import { sb, ensureAppUser } from "../Common/db.js";
import {
  modeValue,
  conversationHistory,
  title,
  activeConversationId,
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
  assignModeValue,
  assignTextarea,
  assignResponseDiv,
} from "../Common/LetsThink.js";

import {
  dialogoPerfiles,
  dialogosInstrucciones,
  socialPerfiles,
  socialInstrucciones,
  recordatorio,
} from "../Common/perfiles.js";

const MODE_KEY = "ultra_mode";

let isChainRunning = false;
let activeToast = null;
let toastOutsideHandler = null;

let cachedConversationsLocal = null;

// =====================
// Helpers modo
// =====================
function setHeadTitle(mode) {
  // <title id="title">...</title>
  const t = document.getElementById("title");
  if (t) t.textContent = mode;
  document.title = mode;
}

function applyMode(mode) {
  // Briefer es otra página
  if (mode === "Briefer") {
    localStorage.setItem(MODE_KEY, "Briefer");
    window.location.href = "../Briefer/";
    return;
  }

  localStorage.setItem(MODE_KEY, mode);
  assignModeValue(mode);
  setHeadTitle(mode);
}

function initModeSelector() {
  const selector = document.getElementById("selector");
  if (!selector) return;

  // si hay modo guardado y es uno de los 4, úsalo
  const saved = localStorage.getItem(MODE_KEY);
  const valid = ["Brainstorming", "Naming", "Socialstorming", "Briefer"];
  const initial = valid.includes(saved) ? saved : selector.value || "Brainstorming";

  selector.value = initial;

  // si el guardado era Briefer, navega automáticamente
  if (initial === "Briefer") {
    window.location.href = "../Briefer/";
    return;
  }

  assignModeValue(initial);
  setHeadTitle(initial);

  selector.addEventListener("change", (e) => {
    const value = e.target.value;
    applyMode(value);
  });
}

// =====================
// Perfil content
// =====================
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

// =====================
// Toast
// =====================
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

// =====================
// Search modal
// =====================
function openSearchModal() {
  const searchModal = document.getElementById("searchModal");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  if (!searchModal || !searchInput || !searchResults) return;

  searchModal.classList.add("active");
  searchInput.value = "";
  searchResults.innerHTML = "";
  searchInput.focus();
}

function closeSearchModal() {
  const searchModal = document.getElementById("searchModal");
  if (searchModal) searchModal.classList.remove("active");
}

// =====================
// Endpoints
// =====================
async function sendMessageToProfile(perfilKey, API, conversationId) {
  const perfil = getPerfilContent(perfilKey);

  const pending = document.createElement("div");
  pending.className = "message pending text-content";
  pending.textContent = `Enviando (${perfilKey})...`;

  const responseDiv = document.getElementById("messages");
  if (activeConversationId === conversationId && responseDiv) {
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
    if (!cleanhtml || !cleanhtml.trim()) throw new Error("La IA no generó respuesta");

    await saveMessage(conversationId, {
      text: cleanhtml,
      creativeAgent: `${perfilKey}-${API}`,
    });

    pending.remove();

    // refresca cache local del buscador si existe
    if (Array.isArray(cachedConversationsLocal)) {
      cachedConversationsLocal = cachedConversationsLocal.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, _messages: [...(conversation._messages || []), cleanhtml] }
          : conversation
      );
    }

    if (activeConversationId === conversationId && responseDiv) {
      const replyDiv = renderMessage({
        author: `${perfilKey}-${API}`,
        text: cleanhtml,
      });
      addMessageToConversationHistory(replyDiv);
      responseDiv.appendChild(replyDiv);
      responseDiv.scrollTop = responseDiv.scrollHeight;
    }
  } catch (err) {
    console.error(err);
    pending.textContent = `Error: ${err.message}`;
    pending.classList.remove("pending");
    pending.classList.add("error");
  }
}

async function summarizeConversation(conversationId, convTitle, history) {
  const responseDiv = document.getElementById("messages");
  const pending = document.createElement("div");
  pending.className = "message pending text-content";
  pending.textContent = "Resumiendo...";

  if (activeConversationId === conversationId && responseDiv) {
    responseDiv.appendChild(pending);
    responseDiv.scrollTop = responseDiv.scrollHeight;
  }

  try {
    const res = await fetch(`/api/resumir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation: history }),
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

      if (Array.isArray(cachedConversationsLocal)) {
        cachedConversationsLocal = cachedConversationsLocal.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, _messages: [...(conversation._messages || []), cleanhtml] }
            : conversation
        );
      }

      if (activeConversationId === conversationId && responseDiv) {
        const replyDiv = renderMessage({
          author: "summary-openai",
          text: `<strong>Resumen de la ronda ${convTitle}:</strong><br>${cleanhtml}`,
        });
        addMessageToConversationHistory(replyDiv);
        responseDiv.appendChild(replyDiv);
        responseDiv.scrollTop = responseDiv.scrollHeight;
      }

      await saveMessage(conversationId, { text: cleanhtml, creativeAgent: "summary-openai" });
    } else if (activeConversationId === conversationId) {
      pending.textContent = "La IA no generó respuesta";
      pending.classList.remove("pending");
      pending.classList.add("error");
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

// =====================
// Chain x3/x6/x12
// =====================
function getRandomProfileButtons(count) {
  const all = Array.from(document.querySelectorAll("button[data-perfil][data-api]"));
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

  const textarea = document.getElementById("userInputArea");
  if (!textarea) return;

  if (isChainRunning) {
    alert("Ya hay una ronda de perfiles en marcha. Espera a que termine.");
    toggleElement(multiplierBtn);
    return;
  }

  if (conversationHistory.length === 0) {
    alert("Primero envía un mensaje (Enter) y luego usa x3 / x6 / x12.");
    toggleElement(multiplierBtn);
    return;
  }

  const selectedButtons = getRandomProfileButtons(count);
  if (selectedButtons.length === 0) {
    toggleElement(multiplierBtn);
    return;
  }

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

    await summarizeConversation(conversationIdAtStart, convTitleAtStart, historyAtStart);
  } finally {
    toggleElement(multiplierBtn);
    showToastSticky(`Han respondido ${count} perfiles en "${convTitleAtStart}". Fin de la ronda.`);
    isChainRunning = false;
  }
}

// =====================
// Init
// =====================
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    window.location.href = "../LogIn/";
    return;
  }

  // Inicializa referencias internas de LetsThink
  assignResponseDiv(document.getElementById("messages"));
  assignTextarea(document.getElementById("userInputArea"));

  // ✅ selector persistente
  initModeSelector();

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
  const multiplier3 = document.getElementById("multiplier3");
  const multiplier6 = document.getElementById("multiplier6");
  const multiplier12 = document.getElementById("multiplier12");

  await ensureAppUser();

  // cache para buscador
  const refreshed = await refreshCachedConversations();
  if (Array.isArray(refreshed)) cachedConversationsLocal = refreshed;

  await loadSidebarConversations();

  if (searchBtn) searchBtn.addEventListener("click", openSearchModal);
  if (closeSearchBtn) closeSearchBtn.addEventListener("click", closeSearchModal);

  if (searchModal) {
    searchModal.addEventListener("click", (e) => {
      if (e.target === searchModal) closeSearchModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearchModal();
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.toLowerCase().trim();
      if (searchResults) searchResults.innerHTML = "";
      if (!query || !Array.isArray(cachedConversationsLocal) || !searchResults) return;

      cachedConversationsLocal.forEach((conv) => {
        const titleMatch = (conv.title || "").toLowerCase().includes(query);
        const msgs = conv._messages || [];
        const contentMatch = msgs.some((m) => {
          const text = typeof m === "string" ? m : m?.text || "";
          return text.toLowerCase().includes(query);
        });

        if (!titleMatch && !contentMatch) return;

        const div = document.createElement("div");
        div.className = "search-result-item";
        div.innerHTML = `<div class="search-result-title">${conv.title || ""}</div>`;
        div.onclick = () => {
          closeSearchModal();
          loadConversation(conv.id);
        };
        searchResults.appendChild(div);
      });
    });
  }

  const textarea = document.getElementById("userInputArea");
  if (textarea) {
    textarea.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setTimeout(() => (textarea.style.height = "auto"), 0);
        await userSendMessage();
      }
    });
    textarea.addEventListener("input", autoResizeTextarea);
  }

  if (newChatBtn) newChatBtn.addEventListener("click", startNewConversation);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  if (multiplier3) multiplier3.addEventListener("click", () => runProfilesChain(3, multiplier3));
  if (multiplier6) multiplier6.addEventListener("click", () => runProfilesChain(6, multiplier6));
  if (multiplier12) multiplier12.addEventListener("click", () => runProfilesChain(12, multiplier12));

  // botones perfiles
  document.querySelectorAll("button[data-api]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      toggleElement(btn);
      await userSendMessage();
      try {
        await sendMessageToProfile(btn.dataset.perfil, btn.dataset.api, activeConversationId);
      } finally {
        toggleElement(btn);
      }
    });
  });

  if (fileInput) fileInput.addEventListener("change", async (e) => onFileLoaded(e, fileInput));

  if (settingsBtn && settingsMenu) {
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      settingsMenu.classList.toggle("active");
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
  }
});
