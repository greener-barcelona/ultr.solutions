import { sb, ensureAppUser } from "../Common/db.js";
import {
  modeValue,
  conversationHistory,
  cachedConversations,
  title,
  activeConversationId,
  responseDiv,
  textarea,
  user,
  logout,
  startNewConversation,
  loadSidebarConversations,
  loadConversation,
  addMessageToConversationHistory,
  refreshCachedConversations,
  userSendMessage,
  renderMessage,
  onFileLoaded,
  replaceWeirdChars,
  extractBodyContent,
  toggleElement,
  autoResizeTextarea,
} from "../Common/LetsThink.js";
import {
  dialogoPerfiles,
  dialogosInstrucciones,
  socialPerfiles,
  socialInstrucciones,
  recordatorio,
} from "../Common/perfiles.js";

let isChainRunning = false;
let activeToast = null;
let toastOutsideHandler = null;

//Auxiliares

function getPerfilContent(perfilKey) {
  let activePerfiles = null;
  let activeInstrucciones = null;

  switch (modeValue) {
    case "Brainstorming":
      activePerfiles = dialogoPerfiles;
      activeInstrucciones = dialogosInstrucciones;
      break;
    case "Naming":
      console.warn("Cadena: aún no hay perfiles de Naming");
      return;
    case "Socialstorming":
      activePerfiles = socialPerfiles;
      activeInstrucciones = socialInstrucciones;
      break;
  }

  return {
    role: "system",
    content: `${activePerfiles[perfilKey].content}\n\n${activeInstrucciones}`,
  };
}

//Botones

async function summarizeConversationButton(button) {
  toggleElement(button);
  await userSendMessage();

  const conversationIdAtStart = activeConversationId;
  const convTitleAtStart = title || "esta conversación";

  await summarizeConversation(
    conversationIdAtStart,
    convTitleAtStart,
    conversationHistory
  );

  toggleElement(button);
}

async function sendMessageToProfileButton(perfilKey, API, triggerBtn) {
  toggleElement(triggerBtn);
  await userSendMessage();

  const conversationIdAtStart = activeConversationId;

  await sendMessageToProfile(perfilKey, API, conversationIdAtStart);

  toggleElement(triggerBtn);
}

//x3 x6 x12

function getRandomProfileButtons(count) {
  const all = Array.from(
    document.querySelectorAll("button[data-perfil][data-api]")
  );

  if (all.length === 0) {
    alert("No hay perfiles configurados.");
    return [];
  }

  const shuffled = [...all];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}

async function runProfilesChain(count, multiplierBtn) {
  toggleElement(multiplierBtn);
  await userSendMessage();

  if (!textarea) return;

  if (isChainRunning) {
    alert("Ya hay una ronda de perfiles en marcha. Espera a que termine.");
    return;
  }

  if (conversationHistory.length === 0) {
    alert("Primero envía un mensaje (Enter) y luego usa x3 / x6 / x12.");
    return;
  }

  const selectedButtons = getRandomProfileButtons(count);
  if (selectedButtons.length === 0) return;

  const conversationIdAtStart = activeConversationId;
  const convTitleAtStart = title || "esta conversación";
  const historyAtStart = conversationHistory;
  isChainRunning = true;

  try {
    for (const btn of selectedButtons) {
      const perfilKey = btn.dataset.perfil;
      const api = btn.dataset.api;

      await sendMessageToProfile(perfilKey, api, conversationIdAtStart);
    }

    await summarizeConversation(
      conversationIdAtStart,
      convTitleAtStart,
      historyAtStart
    );
  } finally {
    if (multiplierBtn) toggleElement(multiplierBtn);
    const text = `Han respondido ${count} perfiles en "${convTitleAtStart}". Fin de la ronda.`;
    showToastSticky(text);
    isChainRunning = false;
  }
}

function showToastSticky(message) {
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }
  if (toastOutsideHandler) {
    document.removeEventListener("click", toastOutsideHandler, true);
    toastOutsideHandler = null;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <span class="toast-text">${message}</span>
    <button class="toast-close" aria-label="Cerrar">✕</button>
  `;
  document.body.appendChild(toast);

  void toast.offsetHeight;
  toast.classList.add("show");

  const close = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 200);
    activeToast = null;
    if (toastOutsideHandler) {
      document.removeEventListener("click", toastOutsideHandler, true);
      toastOutsideHandler = null;
    }
  };

  toast.querySelector(".toast-close").addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });
  toastOutsideHandler = (e) => {
    if (!toast.contains(e.target)) close();
  };
  document.addEventListener("click", toastOutsideHandler, true);

  activeToast = toast;
}

//Endpoints

async function sendMessageToProfile(perfilKey, API, conversationId) {
  const perfil = getPerfilContent(perfilKey);

  const pending = document.createElement("div");
  pending.className = "message pending text-content";
  pending.textContent = `Enviando (${perfilKey})...`;

  if (activeConversationId === conversationId) {
    responseDiv.appendChild(pending);
    responseDiv.scrollTop = responseDiv.scrollHeight;
  }

  try {
    const res = await fetch(`/api/${API}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perfil,
        messages: [recordatorio, ...conversationHistory],
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Error al enviar.");
    }

    const data = await res.json();
    const text = replaceWeirdChars(data.reply);
    const cleanhtml = extractBodyContent(text);
    if (!cleanhtml || !cleanhtml.trim()) {
      throw new Error("La IA no generó respuesta");
    }

    await saveMessage(conversationId, {
      text: cleanhtml,
      creativeAgent: `${perfilKey}-${API}`,
    });

    pending.remove();

    cachedConversations = cachedConversations.map((conversation) =>
      conversation.id === conversationId
        ? { ...conversation, _messages: [...conversation._messages, cleanhtml] }
        : conversation
    );

    if (activeConversationId === conversationId) {
      const replyDiv = renderMessage({
        author: `${perfilKey}-${API}`,
        text: cleanhtml,
      });
      addMessageToConversationHistory(replyDiv);
      responseDiv.appendChild(replyDiv);
      responseDiv.scrollTop = responseDiv.scrollHeight;
    } else {
      pending.remove();
    }
  } catch (err) {
    console.error(err);
    pending.textContent = `Error: ${err.message}`;
    pending.classList.remove("pending");
    pending.classList.add("error");
  }
}

async function exportConversation(button, summarize) {
  toggleElement(button);
  const pending = document.createElement("div");
  pending.className = "message pending text-content";
  pending.textContent = "Exportando...";
  responseDiv.appendChild(pending);
  responseDiv.scrollTop = responseDiv.scrollHeight;
  try {
    const res = await fetch(`/api/exportar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: conversationHistory,
        nombre: title || "Conversación sin titulo",
        summarize: summarize,
        usuario: user.email,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Error al enviar.");
    }

    const data = await res.json();

    if (data.fileId) {
      pending.remove();
      const driveUrl = `https://drive.google.com/file/d/${data.fileId}`;
      window.open(driveUrl, "_blank");
    } else {
      pending.textContent = "La IA no generó respuesta";
      pending.classList.remove("pending");
      pending.classList.add("error");
    }
  } catch (error) {
    console.error("Error completo:", error);
    pending.textContent = `Error: ${error.message}`;
    pending.classList.remove("pending");
    pending.classList.add("error");
  } finally {
    toggleElement(button);
  }
}

async function summarizeConversation(conversationId, convTitle, history) {
  const pending = document.createElement("div");
  pending.className = "message pending text-content";
  pending.textContent = "Resumiendo...";
  if (activeConversationId === conversationId) {
    responseDiv.appendChild(pending);
    responseDiv.scrollTop = responseDiv.scrollHeight;
  }
  try {
    const res = await fetch(`/api/resumir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: history,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Error al enviar.");
    }

    const data = await res.json();

    pending.remove();

    if (data.reply && data.reply.trim() !== "") {
      const text = replaceWeirdChars(data.reply);
      const cleanhtml = extractBodyContent(text);

      cachedConversations = cachedConversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              _messages: [...conversation._messages, cleanhtml],
            }
          : conversation
      );

      if (activeConversationId === conversationId) {
        const replyDiv = renderMessage({
          author: "summary-openai",
          text: `<strong>Resumen de la ronda ${convTitle}:</strong><br>${cleanhtml}`,
        });
        addMessageToConversationHistory(replyDiv);
        responseDiv.appendChild(replyDiv);
        responseDiv.scrollTop = responseDiv.scrollHeight;
      }

      await saveMessage(conversationId, {
        text: cleanhtml,
        creativeAgent: `summary-openai`,
      });
    } else {
      if (activeConversationId === conversationId) {
        pending.textContent = "La IA no generó respuesta";
        pending.classList.remove("pending");
        pending.classList.add("error");
      }
    }
  } catch (error) {
    console.error("Error completo:", error);
    if (activeConversationId === conversationId) {
      pending.textContent = `Error: ${error.message}`;
      pending.classList.remove("pending");
      pending.classList.add("error");
    }
  }
}

//Inicialización

document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    window.location.href = "../LogIn/";
    return;
  }

  const searchBtn = document.getElementById("searchChatBtn");
  const searchModal = document.getElementById("searchModal");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const closeSearchBtn = document.getElementById("closeSearchBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsMenu = document.getElementById("settingsMenu");
  const logoutBtn = document.getElementById("logoutBtn");
  const newChatBtn = document.getElementById("newChatBtn");
  const exportBtn = document.getElementById("exportBtn");
  const summaryPdfBtn = document.getElementById("summaryPdfBtn");
  const summaryBtn = document.getElementById("summaryBtn");
  const fileInput = document.getElementById("fileInput");
  const modeSelector = document.getElementById("selector");
  const titleText = document.getElementById("title");
  const multiplier3 = document.getElementById("multiplier3");
  const multiplier6 = document.getElementById("multiplier6");
  const multiplier12 = document.getElementById("multiplier12");

  if (
    !searchBtn ||
    !searchModal ||
    !searchInput ||
    !searchResults ||
    !closeSearchBtn ||
    !settingsBtn ||
    !settingsMenu ||
    !logoutBtn ||
    !newChatBtn ||
    !textarea ||
    !exportBtn ||
    !summaryPdfBtn ||
    !summaryBtn ||
    !fileInput ||
    !modeSelector
  ) {
    console.warn("Buscador no inicializado (elementos faltantes)");
    return;
  }
  if (multiplier3) {
    multiplier3.addEventListener("click", () =>
      runProfilesChain(3, multiplier3)
    );
  }

  if (multiplier6) {
    multiplier6.addEventListener("click", () =>
      runProfilesChain(6, multiplier6)
    );
  }

  if (multiplier12) {
    multiplier12.addEventListener("click", () =>
      runProfilesChain(12, multiplier12)
    );
  }

  await ensureAppUser();
  await loadSidebarConversations();

  searchBtn.addEventListener("click", () => {
    searchModal.classList.add("active");
    searchInput.value = "";
    searchResults.innerHTML = "";
    searchInput.focus();
  });

  closeSearchBtn.addEventListener("click", () => {
    searchModal.classList.remove("active");
  });

  searchModal.addEventListener("click", (e) => {
    if (e.target === searchModal) {
      searchModal.classList.remove("active");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchModal.classList.remove("active");
    }
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase().trim();
    searchResults.innerHTML = "";
    if (!query || !cachedConversations) return;
    console.log("Cached conversations loaded:", cachedConversations);

    cachedConversations.forEach((conv) => {
      const titleMatch = conv.title.toLowerCase().includes(query);
      const contentMatch = conv._messages.some((m) =>
        m.toLowerCase().includes(query)
      );

      if (titleMatch || contentMatch) {
        const div = document.createElement("div");
        div.className = "search-result-item";
        div.innerHTML = `<div class="search-result-title">${conv.title}</div>`;
        div.onclick = () => {
          searchModal.classList.remove("active");
          loadConversation(conv.id);
        };
        searchResults.appendChild(div);
      }
    });
  });

  textarea.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setTimeout(() => {
        textarea.style.height = "auto";
      }, 0);
      await userSendMessage();
    }
  });

  textarea.addEventListener("input", () => {
    autoResizeTextarea();
  });

  newChatBtn.addEventListener("click", async () => {
    await startNewConversation();
  });

  const profileButtons = document.querySelectorAll("button[data-api]");
  profileButtons.forEach((btn) =>
    btn.addEventListener("click", () =>
      sendMessageToProfileButton(btn.dataset.perfil, btn.dataset.api, btn)
    )
  );

  exportBtn.addEventListener("click", () => {
    exportConversation(exportBtn, false);
  });

  summaryPdfBtn.addEventListener("click", () => {
    exportConversation(summaryPdfBtn, true);
  });

  summaryBtn.addEventListener("click", () => {
    summarizeConversationButton(summaryBtn);
  });

  fileInput.addEventListener("change", async (e) => onFileLoaded(e, fileInput));

  logoutBtn.addEventListener("click", logout);

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle("active");
  });

  modeSelector.addEventListener("change", (e) => {
    const value = e.target.value;
    if (value === "Briefer") window.location.href = "../Briefer/";
    modeValue = value;
    titleText.text = value;
  });
  document.addEventListener("click", (e) => {
    if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
      settingsMenu.classList.remove("active");
    }

    document.querySelectorAll(".conv-menu").forEach((menu) => {
      const btn = menu.previousElementSibling;
      if (!menu.contains(e.target) && !btn?.contains(e.target)) {
        menu.classList.remove("active");
      }
    });
  });

  await refreshCachedConversations();
});
