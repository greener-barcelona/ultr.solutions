import {
  sb,
  getLocalSession,
  ensureAppUser,
  createConversation,
  saveMessage,
  getAllConversations,
  getConversationMessages,
  renameConversation,
  deleteConversation,
} from "../Chat/db.js";

let activeConversationId = null;
let cachedConversations = null;
let title = "Nueva conversación";
const conversationHistory = [];

const responseDiv = document.getElementById("messages");
const textarea = document.getElementById("userInputArea");

const user = getLocalSession();


function goTo(url) {
  // guarda selección actual
  const selector = document.getElementById("selector");
  if (selector) sessionStorage.setItem("ultra_mode", selector.value);

  document.body.classList.add("page-leave");
  setTimeout(() => (window.location.href = url), 160);
}


function logout() {
  cachedConversations = null;
  localStorage.removeItem("ultraUser");
  sb.auth.signOut();
  window.location.href = "../LogIn/";
}


async function refreshCachedConversations() {
  cachedConversations = await getAllConversations();
  for (const conv of cachedConversations) {
    conv._messages = await getConversationMessages(conv.id);
  }
}

async function startNewConversation() {
  cachedConversations = null;
  responseDiv.innerHTML = "";
  conversationHistory.length = 0;
  activeConversationId = null;

  title = "Nueva conversación";
  const newConv = await createConversation(title);
  if (newConv) activeConversationId = newConv.id;

  await refreshCachedConversations();
  await loadSidebarConversations();
}

function addConversationToSidebar(conv) {
  const list = document.getElementById("conversationsList");
  const div = document.createElement("div");
  div.className = "conversation-item";
  div.dataset.conversationId = conv.id;

  const icon = document.createElement("div");
  icon.className = "conversation-icon";
  const username = (conv.created_by_email || "usuario").split("@")[0];
  icon.textContent = username[0]?.toUpperCase() || "U";

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

  div.appendChild(icon);
  div.appendChild(text);
  div.appendChild(menuButton);

  menuButton.addEventListener("click", (e) => {
    e.stopPropagation();

    document.querySelectorAll(".conv-menu").forEach((m) => {
      if (m !== menu) m.classList.remove("active");
    });

    if (!div.contains(menu)) div.appendChild(menu);
    menu.classList.toggle("active");
  });

  menu.querySelector(".rename").addEventListener("click", async (e) => {
    e.stopPropagation();
    const newTitle = prompt("Nuevo nombre:", conv.title);
    if (!newTitle?.trim()) return;

    const ok = await renameConversation(conv.id, newTitle.trim());
    if (!ok) return alert("Error al renombrar");

    await refreshCachedConversations();
    if (activeConversationId === conv.id) title = newTitle.trim();
    await loadSidebarConversations();
  });

  menu.querySelector(".delete").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar esta conversación?")) return;

    const ok = await deleteConversation(conv.id);
    if (!ok) return alert("Error al eliminar");

    await refreshCachedConversations();
    await loadSidebarConversations();

    if (activeConversationId === conv.id) {
      responseDiv.innerHTML = "";
      conversationHistory.length = 0;
      activeConversationId = null;
      title = "Nueva conversación";
    }
  });

  div.addEventListener("click", () => loadConversation(conv.id));
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
  activeConversationId = conversationId;

  const messages = await getConversationMessages(conversationId);
  conversationHistory.length = 0;
  responseDiv.innerHTML = "";

  messages.forEach((msg) => {
    const rendered = renderMessage({
      author: msg.author_name?.split(" ")[0] || "Usuario",
      text: msg.text,
      userProfile: msg.author_avatar,
      isSystem: msg.creative_agent === "system",
    });

    if (msg.creative_agent !== "system") {
      responseDiv.appendChild(rendered);
    }

    conversationHistory.push({
      role: "user",
      content: rendered.textContent.trim(),
    });
  });

  responseDiv.scrollTop = responseDiv.scrollHeight;
}


async function userSendMessage() {
  if (!textarea || !responseDiv) return;

  const text = textarea.value.trim();
  if (!text) return;
  if (!activeConversationId) {
    title = text.length > 40 ? text.slice(0, 40) + "..." : text;
    const newConv = await createConversation(title);
    if (newConv) {
      activeConversationId = newConv.id;
      await refreshCachedConversations();
      await loadSidebarConversations();
    }
  }

  // renombra “Nueva conversación”
  if (title === "Nueva conversación") {
    title = text.length > 40 ? text.slice(0, 40) + "..." : text;
    await renameConversation(activeConversationId, title);
    await loadSidebarConversations();
  }

  const uiMessage = renderMessage({
    author: user?.name?.split(" ")[0] || "Usuario",
    text,
    userProfile: user?.profilePicture,
    isSystem: false,
  });

  responseDiv.appendChild(uiMessage);
  responseDiv.scrollTop = responseDiv.scrollHeight;

  conversationHistory.push({ role: "user", content: text });

  textarea.value = "";
  textarea.style.height = "auto";

  await saveMessage(activeConversationId, { text });
}

function renderMessage({ author, text, userProfile, isSystem }) {
  const isUser = !isSystem;

  const wrapper = document.createElement("div");
  wrapper.className = `message-content-wrapper ${isUser ? "right" : "left"}`;

  const divText = document.createElement("div");
  divText.className = "text-content";
  divText.textContent = text;

  if (isUser) {
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = userProfile || "https://via.placeholder.com/30";
    wrapper.appendChild(avatar);
    wrapper.appendChild(divText);
  } else {
    wrapper.appendChild(divText);
  }

  const div = document.createElement("div");
  div.classList.add("message");
  if (isUser) div.classList.add("user");
  if (isSystem) div.classList.add("system");

  div.appendChild(wrapper);
  return div;
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

function autoResizeTextarea() {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
}


document.addEventListener("DOMContentLoaded", async () => {
  const searchBtn = document.getElementById("searchChatBtn");
  const searchModal = document.getElementById("searchModal");
  const searchInput = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const closeSearchBtn = document.getElementById("closeSearchBtn");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsMenu = document.getElementById("settingsMenu");
  const logoutBtn = document.getElementById("logoutBtn");
  const newChatBtn = document.getElementById("newChatBtn");

  const modeSelector = document.getElementById("selector");

  // sesión supabase
  const { data: { session } } = await sb.auth.getSession();
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

  // textarea
  textarea.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await userSendMessage();
    }
  });
  textarea.addEventListener("input", autoResizeTextarea);

  // nuevo chat
  newChatBtn.addEventListener("click", startNewConversation);

  // settings
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
