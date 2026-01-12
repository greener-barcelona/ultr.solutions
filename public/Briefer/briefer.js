import { sb, ensureAppUser, saveMessage } from "../Common/db.js";
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
import { brieferPerfil } from "../Common/perfiles.js";

let activeConversationId = null;
let cachedConversations = null;
let title = "Nueva conversación";

function goTo(url) {
  // guarda selección actual
  const selector = document.getElementById("selector");
  if (selector) sessionStorage.setItem("ultra_mode", selector.value);

  document.body.classList.add("page-leave");
  setTimeout(() => (window.location.href = url), 160);
}

function openSearchModal() {
  const searchModal = document.getElementById("searchModal");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");

  searchModal.classList.add("active");
  searchInput.value = "";
  searchResults.innerHTML = "";
  searchInput.focus();
}

function closeSearchModal() {
  document.getElementById("searchModal").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", async () => {
  responseDiv = document.getElementById("messages");
  textarea = document.getElementById("userInputArea");

  const searchBtn = document.getElementById("searchChatBtn");
  const searchModal = document.getElementById("searchModal");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const closeSearchBtn = document.getElementById("closeSearchBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsMenu = document.getElementById("settingsMenu");
  const logoutBtn = document.getElementById("logoutBtn");
  const newChatBtn = document.getElementById("newChatBtn");

  const modeSelector = document.getElementById("modeSelector");

  // sesión supabase
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session || !user) {
    window.location.href = "../LogIn/";
    return;
  }

  await ensureAppUser();
  await refreshCachedConversations();
  await loadSidebarConversations();

  // mantener selector
  const saved = sessionStorage.getItem("ultra_mode");
  if (saved) modeSelector.value = saved;
  modeSelector.value = "Briefer";

  // sale del briefer
  modeSelector.addEventListener("change", (e) => {
    const value = e.target.value;
    if (value !== "Briefer") {
      goTo("../Chat/");
    }
  });

  // buscador
  searchBtn.addEventListener("click", openSearchModal);
  closeSearchBtn.addEventListener("click", closeSearchModal);

  searchModal.addEventListener("click", (e) => {
    if (e.target === searchModal) closeSearchModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearchModal();
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase().trim();
    searchResults.innerHTML = "";
    if (!query || !cachedConversations) return;

    cachedConversations.forEach((conv) => {
      const titleMatch = conv.title.toLowerCase().includes(query);
      const contentMatch = conv._messages?.some((m) =>
        (m.text || "").toLowerCase().includes(query)
      );

      if (titleMatch || contentMatch) {
        const div = document.createElement("div");
        div.className = "search-result-item";
        div.innerHTML = `<div class="search-result-title">${conv.title}</div>`;
        div.onclick = () => {
          closeSearchModal();
          loadConversation(conv.id);
        };
        searchResults.appendChild(div);
      }
    });
  });

  textarea.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await userSendMessage();
    }
  });
  textarea.addEventListener("input", autoResizeTextarea);

  newChatBtn.addEventListener("click", startNewConversation);

  logoutBtn.addEventListener("click", logout);

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
});
