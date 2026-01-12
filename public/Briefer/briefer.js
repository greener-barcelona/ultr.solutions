// briefer.js

import { sb, ensureAppUser } from "../Common/db.js";
import {
  user,
  logout,
  startNewConversation,
  loadSidebarConversations,
  loadConversation,
  refreshCachedConversations,
  userSendMessage,
  autoResizeTextarea,
  assignResponseDiv,
  assignTextarea,
} from "../Common/LetsThink.js";

let cachedConversations = null;

function goTo(url) {
  const selector = document.getElementById("modeSelector");
  if (selector) sessionStorage.setItem("ultra_mode", selector.value);

  document.body.classList.add("page-leave");
  setTimeout(() => (window.location.href = url), 160);
}

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
  assignResponseDiv(document.getElementById("messages"));
  assignTextarea(document.getElementById("userInputArea"));

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
  const textarea = document.getElementById("userInputArea");

  // sesión supabase
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session || !user) {
    window.location.href = "../LogIn/";
    return;
  }

  await ensureAppUser();
  const refreshed = await refreshCachedConversations();
  if (Array.isArray(refreshed)) cachedConversations = refreshed;

  await loadSidebarConversations();

  // mantener selector
  const saved = sessionStorage.getItem("ultra_mode");
  if (saved && modeSelector) modeSelector.value = saved;
  if (modeSelector) modeSelector.value = "Briefer";

  // sale del briefer
  if (modeSelector) {
    modeSelector.addEventListener("change", (e) => {
      const value = e.target.value;
      if (value !== "Briefer") goTo("../Chat/");
    });
  }

  // buscador
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

  if (searchInput && searchResults) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.toLowerCase().trim();
      searchResults.innerHTML = "";
      if (!query || !Array.isArray(cachedConversations)) return;

      cachedConversations.forEach((conv) => {
        const titleText = (conv.title || "").toLowerCase();
        const titleMatch = titleText.includes(query);

        const msgs = conv._messages || [];
        const contentMatch = msgs.some((m) => {
          const text = typeof m === "string" ? m : m?.text || "";
          return text.toLowerCase().includes(query);
        });

        if (titleMatch || contentMatch) {
          const div = document.createElement("div");
          div.className = "search-result-item";
          div.innerHTML = `<div class="search-result-title">${conv.title || ""}</div>`;
          div.onclick = () => {
            closeSearchModal();
            loadConversation(conv.id);
          };
          searchResults.appendChild(div);
        }
      });
    });
  }

  // input chat
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
