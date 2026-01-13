import { sb, ensureAppUser, saveMessage } from "../Common/db.js";
import {
  logout,
  startNewConversation,
  loadSidebarConversations,
  loadConversation,
  refreshCachedConversations,
  userSendMessage,
  autoResizeTextarea,
} from "../Common/LetsThink.js";

let cachedConversations = null;

const MODE_KEY = "mode";
let modeValue = "Brainstorming";
let activeConversationId = null;
let title = "";

const conversationHistory = [];

const responseDiv = document.getElementById("messages");
const textarea = document.getElementById("userInputArea");

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

document.addEventListener("DOMContentLoaded", async () => {
  const modeSelector = document.getElementById("modeSelector");
  const textarea = document.getElementById("userInputArea");

  const searchBtn = document.getElementById("searchChatBtn");
  const searchModal = document.getElementById("searchModal");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const closeSearchBtn = document.getElementById("closeSearchBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsMenu = document.getElementById("settingsMenu");
  const logoutBtn = document.getElementById("logoutBtn");
  const newChatBtn = document.getElementById("newChatBtn");

  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    window.location.href = "../LogIn/";
    return;
  }

  await ensureAppUser();

  // Si venimos a Briefer pero el modo guardado no es Briefer, vuelve a Chat
  const saved = localStorage.getItem(MODE_KEY);
  if (saved && saved !== "Briefer") {
    window.location.href = "../Chat/";
    return;
  }

  // fija selector a Briefer (sin pisar a otro)
  if (modeSelector) modeSelector.value = "Briefer";

  const refreshed = await refreshCachedConversations();
  if (Array.isArray(refreshed)) cachedConversations = refreshed;

  await loadSidebarConversations();

  // Cambiar modo desde Briefer -> vuelve a Chat y guarda modo
  if (modeSelector) {
    modeSelector.addEventListener("change", (e) => {
      const value = e.target.value;
      localStorage.setItem(MODE_KEY, value);

      if (value !== "Briefer") {
        window.location.href = "../Chat/";
      }
    });
  }

  if (searchBtn) searchBtn.addEventListener("click", openSearchModal);
  if (closeSearchBtn)
    closeSearchBtn.addEventListener("click", closeSearchModal);

  if (searchModal) {
    searchModal.addEventListener("click", (e) => {
      if (e.target === searchModal) closeSearchModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearchModal();
  });

  if (searchInput && searchResults) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.toLowerCase().trim();
      searchResults.innerHTML = "";
      if (!query || !Array.isArray(cachedConversations)) return;

      cachedConversations.forEach((conv) => {
        const titleMatch = (conv.title || "").toLowerCase().includes(query);
        const msgs = conv._messages || [];
        const contentMatch = msgs.some((m) => {
          const text = typeof m === "string" ? m : m?.text || "";
          return text.toLowerCase().includes(query);
        });

        if (!titleMatch && !contentMatch) return;

        const div = document.createElement("div");
        div.className = "search-result-item";
        div.innerHTML = `<div class="search-result-title">${
          conv.title || ""
        }</div>`;
        div.onclick = () => {
          closeSearchModal();
          loadConversation(conv.id);
        };
        searchResults.appendChild(div);
      });
    });
  }

  if (textarea) {
    textarea.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await userSendMessage();
      }
    });
    textarea.addEventListener("input", autoResizeTextarea);
  }

  if (newChatBtn) newChatBtn.addEventListener("click", startNewConversation);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

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
