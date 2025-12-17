import { perfiles, instrucciones } from "./perfiles.js";
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
} from "./db.js";

function getSession() {
  return getLocalSession();
}

function logout() {
  localStorage.removeItem("ultraUser");
  sb.auth.signOut();
  window.location.href = "../LogIn/index.html";
}

function renderMessage({ author, text, userProfile }) {
  const isUser = author === "Usuario";
  const isSystem = author === "system";

  const wrapper = document.createElement("div");
  wrapper.className = `message-content-wrapper ${isUser ? "right" : "left"}`;

  const divText = document.createElement("div");
  divText.className = "text-content";
  divText.innerHTML = text;

  if (isUser) {
    const avatar = document.createElement("img");
    avatar.className = "avatar";
    avatar.src = userProfile || "https://via.placeholder.com/30";

    wrapper.appendChild(avatar);
    wrapper.appendChild(divText);
  } else if (!isUser && !isSystem) {
    const autor = document.createElement("div");
    autor.className = "ia-autor text-content";
    autor.innerHTML = `${author.split("-")[0]}-${author.split("-")[1]}`;
    wrapper.appendChild(divText);
    wrapper.appendChild(autor);
  }
  const div = document.createElement("div");
  div.classList.add("message");
  if (isUser) div.classList.add("user");
  if (isSystem) div.classList.add("system");
  if (!isUser && !isSystem) {
    div.classList.add(`profile-${author.split("-")[0]}`);
    div.classList.add(`api-${author.split("-")[1]}`);
  }

  div.appendChild(wrapper);

  return div;
}

let activeConversationId = null;
const responseDiv = document.getElementById("messages");
const textarea = document.getElementById("userInputArea");
let title = "";

async function handleUserSend() {
  if (!textarea || !responseDiv) return null;

  const text = textarea.value.trim();
  if (!text) return null;

  const user = getSession();

  if (!activeConversationId) {
    title = text.length > 40 ? text.slice(0, 40) + "..." : text;
    const newConv = await createConversation(title);

    if (newConv) {
      activeConversationId = newConv.id;
      await loadSidebarConversations();
    }
  }

  if (title === "Nueva conversación") {
    title = text.length > 40 ? text.slice(0, 40) + "..." : text;
    await renameConversation(activeConversationId, title);
    await loadSidebarConversations();
  }

  const uiMessage = renderMessage({
    author: "Usuario",
    text: text,
    userProfile: user.profilePicture,
  });

  responseDiv.appendChild(uiMessage);
  responseDiv.scrollTop = responseDiv.scrollHeight;

  addMessageToConversationHistory(uiMessage);
  textarea.value = "";
  await saveMessage(activeConversationId, { text: text });
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

  div.appendChild(icon);
  div.appendChild(text);
  div.appendChild(menuButton);

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
    if (activeConversationId === conv.id) {
      title = newTitle.trim();
    }
    await loadSidebarConversations();
  });

  menu.querySelector(".delete").addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!confirm("¿Seguro que deseas eliminar esta conversación?")) return;

    const ok = await deleteConversation(conv.id);
    console.log(ok);
    if (!ok) {
      alert("Error al eliminar");
      return;
    }
    await loadSidebarConversations();

    if (activeConversationId === conv.id) {
      responseDiv.innerHTML = "";
      activeConversationId = null;
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
  responseDiv.innerHTML = "";

  messages.forEach((msg) => {
    const rendered = renderMessage({
      author: msg.creative_agent || "Usuario",
      text: msg.text,
      userProfile: msg.author_avatar,
    });

    addMessageToConversationHistory(rendered);
    if (msg.creative_agent === "system") return;
    responseDiv.appendChild(rendered);
  });

  responseDiv.scrollTop = responseDiv.scrollHeight;
}

async function startNewConversation() {
  responseDiv.innerHTML = "";
  conversationHistory.length = 0;
  activeConversationId = null;
  title = "Nueva conversación";
  const newConv = await createConversation("Nueva conversación");

  if (newConv) {
    activeConversationId = newConv.id;
  }
  await loadSidebarConversations();
}
const conversationHistory = [];

async function OnFileLoaded(e, fileInput) {
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
      const base64 = await fileToBase64(file);
      const pureBase64 = base64.split(",")[1];

      const response = await fetch("/api/extraerTextoPDF", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pureBase64,
        }),
      });

      if (!response.ok) {
        const errorDiv = document.createElement("div");
        errorDiv.className = `message error text-content`;
        errorDiv.textContent = `Error procesando ${file.name}.`;
        responseDiv.appendChild(errorDiv);
        continue;
      }

      const PDFcontent = await response.json();

      if (!PDFcontent.txt) {
        const errorDiv = document.createElement("div");
        errorDiv.className = `message error text-content`;
        errorDiv.textContent = `el PDF ${file.name} no tiene texto extraíble.`;
        responseDiv.appendChild(errorDiv);
        continue;
      }

      const user = getSession();
      const replyDiv = renderMessage({
        author: "Usuario",
        text: `${file.name} cargado correctamente.`,
        userProfile: user.profilePicture,
      });

      addMessageToConversationHistory(replyDiv);
      responseDiv.appendChild(replyDiv);

      await saveMessage(activeConversationId, { text: replyDiv.textContent });

      conversationHistory.push({
        role: "user",
        content: `${file.name}: ${PDFcontent.txt}`,
      });

      if (!activeConversationId) {
        title =
          file.name.length > 40 ? file.name.slice(0, 40) + "..." : file.name;
        const newConv = await createConversation(title);

        if (newConv) {
          activeConversationId = newConv.id;
          await loadSidebarConversations();
        }
      }

      await saveMessage(activeConversationId, {
        text: `${file.name}: ${PDFcontent.txt}`,
        creativeAgent: `system`,
      });
    } catch (error) {
      console.error("Error al procesar el PDF:", error);
      alert(`Error al procesar el archivo ${file.name}`);
    }

    fileInput.value = "";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);

    reader.readAsDataURL(file); 
  });
}

function addMessageToConversationHistory(message) {
  const classArray = Array.from(message.classList);
  const apiClass = classArray.find((c) => c.startsWith("api-"));
  const profileClass = classArray.find((c) => c.startsWith("profile-"));
  const systemClass = classArray.includes("system");

  let autor = "";

  if (profileClass && apiClass)
    autor = `${profileClass.split("-")[1]}-${apiClass.split("-")[1]}`;
  else if (systemClass) autor = "Sistema";
  else autor = "Usuario";

  const content = `${autor}: ${message.textContent.trim()}`;

  if (content === "" || content === null) return;

  if (message.classList.contains("user") || systemClass || profileClass) {
    conversationHistory.push({
      role: "user",
      content: content,
    });
  }
}

function toggleProfileButtons(triggerBtn) {
  triggerBtn.disabled = !triggerBtn.disabled;
}
async function sendMessageToPerfil(perfilKey, API, triggerBtn) {
  await handleUserSend();

  if (conversationHistory.length === 0) {
    return alert("No hay mensajes para enviar.");
  }
  const perfil = {
    role: "system",
    content: `A continuación se te presenta un perfil:\n\n${perfiles[perfilKey].content}\n\n${instrucciones}\n\nTu tarea es analizar exhaustivamente el perfil, entenderlo, y, finalmente, dar una respuesta. Ten en cuenta que estás en una conversación entre varias personas, por lo tanto tendrás que adaptar tu respuesta para adecuarte a las dinámicas típicas de una conversación.`,
  };

  if (!perfil) return alert("Perfil no encontrado.");

  toggleProfileButtons(triggerBtn);

  const pending = document.createElement("div");
  pending.className = "message pending text-content";
  pending.textContent = "Enviando...";
  responseDiv.appendChild(pending);
  responseDiv.scrollTop = responseDiv.scrollHeight;

  try {
    const res = await fetch(`/api/${API}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        perfil,
        messages: conversationHistory,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Error al enviar.");
    }

    const data = await res.json();

    if (data.reply && data.reply.trim() !== "") {
      pending.remove();

      const replyDiv = renderMessage({
        author: `${perfilKey}-${API}`,
        text: data.reply,
      });
      addMessageToConversationHistory(replyDiv);
      responseDiv.appendChild(replyDiv);

      await saveMessage(activeConversationId, {
        text: data.reply,
        creativeAgent: `${perfilKey}-${API}`,
      });
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
    toggleProfileButtons(triggerBtn);
  }
}

async function summarizeOrExportConversationToDoc(button, summarize) {
  toggleProfileButtons(button);
  const res = await fetch(`/api/exportar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation: conversationHistory,
      nombre: title || "Conversación sin titulo",
      summarize: summarize,
    }),
  });

  const data = await res.json();
  toggleProfileButtons(button);
  const driveUrl = `https://drive.google.com/file/d/${data.fileId}`;
  window.open(driveUrl, "_blank");
}

async function summarizeConversation(button) {
  toggleProfileButtons(button);
  const pending = document.createElement("div");
  pending.className = "message pending text-content";
  pending.textContent = "Resumiendo...";
  responseDiv.appendChild(pending);
  responseDiv.scrollTop = responseDiv.scrollHeight;

  try {
    const res = await fetch(`/api/resumir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: conversationHistory,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Error al enviar.");
    }

    const data = await res.json();

    if (data.reply && data.reply.trim() !== "") {
      pending.remove();

      const replyDiv = renderMessage({
        author: `claude-summary`,
        text: data.reply,
      });
      addMessageToConversationHistory(replyDiv);
      responseDiv.appendChild(replyDiv);

      await saveMessage(activeConversationId, {
        text: data.reply,
        creativeAgent: `claude-summary`,
      });
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
    toggleProfileButtons(button);
  }
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
  const exportBtn = document.getElementById("exportBtn");
  const summaryPdfBtn = document.getElementById("summaryPdfBtn");
  const summaryBtn = document.getElementById("summaryBtn");
  const fileInput = document.getElementById("fileInput");

  if (
    !searchBtn ||
    !searchModal ||
    !searchInput ||
    !searchResults ||
    !closeSearchBtn ||
    !settingsBtn ||
    !settingsMenu ||
    !logoutBtn ||
    !exportBtn ||
    !summaryPdfBtn ||
    !summaryBtn ||
    !fileInput
  ) {
    console.warn("Buscador no inicializado (elementos faltantes)");
    return;
  }

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

  searchInput.addEventListener("input", async () => {
    const query = searchInput.value.toLowerCase().trim();
    searchResults.innerHTML = "";
    if (!query) return;

    const allConvs = await getAllConversations();

    for (const conv of allConvs) {
      const messages = await getConversationMessages(conv.id);
      const titleMatch = conv.title.toLowerCase().includes(query);
      const contentMatch = messages.some((m) =>
        m.text.toLowerCase().includes(query)
      );

      if (titleMatch || contentMatch) {
        const div = document.createElement("div");
        div.className = "search-result-item";
        div.innerHTML = `
          <div class="search-result-title">${conv.title}</div>
        `;

        div.addEventListener("click", () => {
          searchModal.classList.remove("active");
          loadConversation(conv.id);
        });

        searchResults.appendChild(div);
      }
    }
  });

  textarea.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await handleUserSend();
    }
  });

  const newChatBtn = document.getElementById("newChatBtn");
  newChatBtn.addEventListener("click", async () => {
    await startNewConversation();
  });

  const profileButtons = document.querySelectorAll("button[data-api]");
  profileButtons.forEach((btn) =>
    btn.addEventListener("click", () =>
      sendMessageToPerfil(btn.dataset.perfil, btn.dataset.api, btn)
    )
  );

  exportBtn.addEventListener("click", () => {
    summarizeOrExportConversationToDoc(exportBtn, false);
  });

  summaryPdfBtn.addEventListener("click", () => {
    summarizeOrExportConversationToDoc(summaryPdfBtn, true);
  });

  summaryBtn.addEventListener("click", () => {
    summarizeConversation(summaryBtn);
  });

  fileInput.addEventListener("change", async (e) => OnFileLoaded(e, fileInput));

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

  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) {
    window.location.href = "../LogIn/index.html";
    return;
  }

  await ensureAppUser();
  await loadSidebarConversations();
});
