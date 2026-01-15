import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs";
import {
  sb,
  ensureAppUser,
  createConversation,
  saveMessage,
  getAllConversations,
  getConversationMessages,
  renameConversation,
  deleteConversation,
} from "../Common/db.js";
import {
  user,
  logout,
  addMessageToConversationHistory,
  refreshCachedConversations,
  renderMessage,
  extractPDFText,
  replaceWeirdChars,
  extractBodyContent,
  toggleElement,
  autoResizeTextarea,
} from "../Common/shared.js";
import {
  dialogoPerfiles,
  dialogosInstrucciones,
  socialPerfiles,
  socialInstrucciones,
  recordatorio,
} from "../Common/perfiles.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs";

let isChainRunning = false;
let activeToast = null;
let toastOutsideHandler = null;

let cachedConversations = [];

const MODE_KEY = "mode";
let modeValue = "Brainstorming";
let activeConversationId = null;
let title = "";

const conversationHistory = [];

const responseDiv = document.getElementById("messages");
const textarea = document.getElementById("userInputArea");

//Conversaciones

async function startNewConversation(newTitle) {
  title = newTitle || "Nueva conversación";
  responseDiv.innerHTML = "";
  conversationHistory.length = 0;
  const newConv = await createConversation(title || "Nueva conversación");

  if (newConv) {
    activeConversationId = newConv.id;
    cachedConversations.push(newConv);
    cachedConversations[cachedConversations.length - 1]._messages = [];
  }
  await loadSidebarConversations();
}

function addConversationToSidebar(conv) {
  const list = document.getElementById("conversationsList");
  const div = document.createElement("div");
  div.className = "conversation-item";
  div.dataset.conversationId = conv.id;

  const icon = document.createElement("div");
  icon.className = "conversation-icon";
  const username = conv.created_by_email.split("@")[0];
  icon.textContent = username[0].toUpperCase();

  const text = document.createElement("div");
  text.className = "conversation-text";
  text.innerHTML = `
    <div class="title">${conv.title}</div>
    <div class="user">${username}</div>
  `;

  const menuButton = document.createElement("button");
  menuButton.className = "conv-menu-btn";
  menuButton.textContent = "⋮";

  const menu = document.createElement("div");
  menu.className = "conv-menu";
  menu.innerHTML = `
    <div class="conv-menu-item rename">Renombrar</div>
    <div class="conv-menu-item delete">Eliminar</div>
  `;

  menuButton.addEventListener("click", (e) => {
    e.stopPropagation();

    document.querySelectorAll(".conv-menu").forEach((m) => {
      if (m !== menu) m.classList.remove("active");
    });

    if (!div.contains(menu)) {
      div.appendChild(menu);
    }

    menu.classList.toggle("active");
  });

  menu.querySelector(".rename").addEventListener("click", async (e) => {
    e.stopPropagation();

    const newTitle = prompt("Nuevo nombre para la conversación:", conv.title);
    if (!newTitle || !newTitle.trim()) return;

    const ok = await renameConversation(conv.id, newTitle.trim());
    if (!ok) {
      alert("Error al renombrar");
      return;
    }

    cachedConversations = cachedConversations.map((conversation) =>
      conversation.id === conv.id
        ? { ...conversation, title: newTitle.trim() }
        : conversation
    );

    if (activeConversationId === conv.id) {
      title = newTitle.trim();
    }

    await loadSidebarConversations();
  });

  menu.querySelector(".delete").addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!confirm("¿Seguro que deseas eliminar esta conversación?")) return;

    const ok = await deleteConversation(conv.id);
    if (!ok) {
      alert("Error al eliminar");
      return;
    }

    cachedConversations = cachedConversations.filter(
      (conversation) => conversation.id !== conv.id
    );

    if (activeConversationId === conv.id) {
      responseDiv.innerHTML = "";
      activeConversationId = null;
    }

    await loadSidebarConversations();
  });

  div.addEventListener("click", () => loadConversation(conv.id));

  div.appendChild(icon);
  div.appendChild(text);
  div.appendChild(menuButton);

  list.appendChild(div);
}

async function loadSidebarConversations() {
  const list = document.getElementById("conversationsList");
  list.innerHTML = "";
  const all = await getAllConversations();

  const ordered = [...all].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
  );

  ordered.forEach(addConversationToSidebar);
}

async function loadConversation(conversationId) {
  const { data: convData, error } = await sb
    .from("conversations")
    .select("title")
    .eq("id", conversationId)
    .single();

  if (!error && convData) {
    title = convData.title;
    const titleDiv = document.getElementById("conversationTitle");
    if (titleDiv) titleDiv.textContent = convData.title;
  }

  const messages = await getConversationMessages(conversationId);
  activeConversationId = conversationId;
  conversationHistory.length = 0;
  responseDiv.innerHTML = "";

  messages.forEach((msg) => {
    if (msg.creative_agent !== "system") {
      const rendered = renderMessage({
        author:
          msg.creative_agent || msg.author_name.split(" ")[0] || "Usuario",
        text: msg.text,
        userProfile: msg.author_avatar,
      });

      addMessageToConversationHistory(rendered, conversationHistory);

      responseDiv.appendChild(rendered);
    } else conversationHistory.push({ role: "user", content: msg.text });
  });

  responseDiv.scrollTop = responseDiv.scrollHeight;
}

//Mensajes

export async function userSendMessage() {
  if (!textarea || !responseDiv) return;

  const text = textarea.value.trim();
  if (!text) return;

  if (!activeConversationId) {
    title = text.length > 40 ? text.slice(0, 40) + "..." : text;
    await startNewConversation(title);
  }

  if (title === "Nueva conversación") {
    title = text.length > 40 ? text.slice(0, 40) + "..." : text;
    await renameConversation(activeConversationId, title);
    cachedConversations = cachedConversations.map((conversation) =>
      conversation.id === activeConversationId
        ? { ...conversation, title: title }
        : conversation
    );
    await loadSidebarConversations();
  }

  const uiMessage = renderMessage({
    author: user.name.split(" ")[0] || "Usuario",
    text: text,
    userProfile: user.profilePicture,
  });

  responseDiv.appendChild(uiMessage);
  responseDiv.scrollTop = responseDiv.scrollHeight;

  addMessageToConversationHistory(uiMessage, conversationHistory);

  textarea.value = "";
  cachedConversations = cachedConversations.map((conversation) =>
    conversation.id === activeConversationId
      ? {
          ...conversation,
          _messages: [...conversation._messages, uiMessage.textContent.trim()],
        }
      : conversation
  );
  await saveMessage(activeConversationId, { text: text });
}

//Botones

async function summarizeConversationButton(button) {
  toggleElement(button);
  await userSendMessage();

  if (!activeConversationId || conversationHistory.length <= 0) {
    toggleElement(button);
    return alert("Primero inicia una conversación antes de resumir.");
  }

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

  if (!activeConversationId || conversationHistory.length <= 0) {
    toggleElement(triggerBtn);
    return alert("Primero inicia una conversación antes de resumir.");
  }

  const conversationIdAtStart = activeConversationId;

  await sendMessageToProfile(perfilKey, API, conversationIdAtStart);

  toggleElement(triggerBtn);
}

//Archivos

export async function onFileLoaded(e, fileInput) {
  const files = Array.from(e.target.files);
  for (const file of files) {
    if (!file) continue;

    if (file.type !== "application/pdf") continue;

    const maxSize = 30 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("El archivo es demasiado grande. Máximo 30MB");
      continue;
    }

    try {
      const PDFcontent = await extractPDFText(file);

      if (!PDFcontent) {
        const errorDiv = document.createElement("div");
        errorDiv.className = `message error text-content`;
        errorDiv.textContent = `el PDF ${file.name} no tiene texto extraíble.`;
        responseDiv.appendChild(errorDiv);
        responseDiv.scrollTop = responseDiv.scrollHeight;
        continue;
      }

      const replyDiv = renderMessage({
        author: user.name.split(" ")[0] || "Usuario",
        text: `${file.name} cargado correctamente.`,
        userProfile: user.profilePicture,
      });

      addMessageToConversationHistory(replyDiv, conversationHistory);

      responseDiv.appendChild(replyDiv);
      responseDiv.scrollTop = responseDiv.scrollHeight;

      conversationHistory.push({
        role: "user",
        content: `${file.name}: ${PDFcontent}`,
      });

      if (!activeConversationId) {
        title =
          file.name.length > 40 ? file.name.slice(0, 40) + "..." : file.name;
        await startNewConversation(title);
      }

      await saveMessage(activeConversationId, {
        text: replyDiv.textContent.trim(),
      });

      await saveMessage(activeConversationId, {
        text: `${file.name}: ${PDFcontent}`,
        creativeAgent: "system",
      });
    } catch (error) {
      console.error("Error al procesar el PDF:", error);
      alert(`Error al procesar el archivo ${file.name}`);
    }

    fileInput.value = "";
  }
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

  if (!activeConversationId || conversationHistory.length <= 0) {
    toggleElement(multiplierBtn);
    return alert("Primero inicia una conversación antes de resumir.");
  }

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
      addMessageToConversationHistory(replyDiv, conversationHistory);

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
  await userSendMessage();

  if (!activeConversationId || conversationHistory.length <= 0) {
    toggleElement(button);
    return alert("Primero inicia una conversación antes de resumir.");
  }
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
        addMessageToConversationHistory(replyDiv, conversationHistory);

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

//Auxiliares

function applyMode(mode) {
  if (mode === "Briefer") {
    localStorage.setItem(MODE_KEY, "Briefer");
    window.location.href = "../Briefer/";
    return;
  }

  localStorage.setItem(MODE_KEY, mode);
  modeValue = mode;
}

function initModeSelector(selector) {
  const saved = localStorage.getItem(MODE_KEY);
  const valid = ["Brainstorming", "Naming", "Socialstorming", "Briefer"];
  const initial = valid.includes(saved)
    ? saved
    : selector.value || "Brainstorming";

  selector.value = initial;

  if (initial === "Briefer") {
    window.location.href = "../Briefer/";
    return;
  }

  applyMode(initial);
}

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

//Inicialización

document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    window.location.href = "../LogIn/";
    return;
  }

  await ensureAppUser();
  await loadSidebarConversations();

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
  //const multiplier3 = document.getElementById("multiplier3");
  //const multiplier6 = document.getElementById("multiplier6");
  //const multiplier12 = document.getElementById("multiplier12");

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
    !modeSelector ||
    //!multiplier3 ||
    //!multiplier6 ||
    //!multiplier12 ||
    !textarea ||
    !responseDiv
  ) {
    console.warn("Buscador no inicializado (elementos faltantes)");
    return;
  }

  initModeSelector(modeSelector);

  //multiplier3.addEventListener("click", () => runProfilesChain(3, multiplier3));

  //multiplier6.addEventListener("click", () => runProfilesChain(6, multiplier6));

  //multiplier12.addEventListener("click", () =>
  //runProfilesChain(12, multiplier12)
  //);

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
      if (textarea.value.trim()) await userSendMessage();
      else return alert("Escribe un mensaje antes de enviar.");
    }
  });

  textarea.addEventListener("input", () => {
    autoResizeTextarea(textarea);
  });

  newChatBtn.addEventListener(
    "click",
    async () => await startNewConversation()
  );

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

  logoutBtn.addEventListener("click", () => {
    cachedConversations.length = 0;
    logout(MODE_KEY);
  });

  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle("active");
  });

  modeSelector.addEventListener("change", (e) => {
    const value = e.target.value;
    applyMode(value);
    titleText.text = value;
    document.title = modeValue;
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

  cachedConversations = await refreshCachedConversations();
});
