import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs";
import {
  sb,
  getLocalSession,
  createConversation,
  saveMessage,
  getAllConversations,
  getConversationMessages,
  renameConversation,
  deleteConversation,
} from "./db.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs";

export let modeValue = "Brainstorming";
export const conversationHistory = [];
export let cachedConversations = null;
export let title = "";
export let activeConversationId = null;

export const responseDiv = null;
export const textarea = null;

//Sesión

export const user = getLocalSession();

export function logout() {
  cachedConversations = null;
  localStorage.removeItem("ultraUser");
  sb.auth.signOut();
  window.location.href = "../LogIn/";
}

//Conversaciones

export async function startNewConversation() {
  responseDiv.innerHTML = "";
  conversationHistory.length = 0;
  activeConversationId = null;
  title = "Nueva conversación";
  const newConv = await createConversation("Nueva conversación");

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
    await loadSidebarConversations();

    if (activeConversationId === conv.id) {
      responseDiv.innerHTML = "";
      activeConversationId = null;
    }
  });

  div.addEventListener("click", () => loadConversation(conv.id));

  list.appendChild(div);
}

export async function loadSidebarConversations() {
  const list = document.getElementById("conversationsList");
  list.innerHTML = "";
  const all = await getAllConversations();

  const ordered = [...all].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
  );

  ordered.forEach(addConversationToSidebar);
}

export async function loadConversation(conversationId) {
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
  conversationHistory.length = 0;
  responseDiv.innerHTML = "";

  messages.forEach((msg) => {
    const rendered = renderMessage({
      author: msg.creative_agent || msg.author_name.split(" ")[0] || "Usuario",
      text: msg.text,
      userProfile: msg.author_avatar,
    });

    addMessageToConversationHistory(rendered);
    if (msg.creative_agent === "system") return;
    responseDiv.appendChild(rendered);
  });

  responseDiv.scrollTop = responseDiv.scrollHeight;
}

export function addMessageToConversationHistory(message) {
  const classArray = Array.from(message.classList);
  const apiClass = classArray.find((c) => c.startsWith("api-"));
  const profileClass = classArray.find((c) => c.startsWith("profile-"));
  const userClass = classArray.find((c) => c.startsWith("user-"));
  const systemClass = classArray.includes("system");

  let autor = "";

  if (profileClass && apiClass)
    autor = `${profileClass.split("-")[1]}-${apiClass.split("-")[1]}`;
  else if (systemClass) autor = "Sistema";
  else if (userClass) autor = `${userClass.split("-")[1]}`;

  const content = `${autor}: ${message.textContent.trim()}`;

  if (content === "" || content === null) return;

  if (userClass || systemClass || profileClass) {
    conversationHistory.push({
      role: "user",
      content: content,
    });
  }

  console.log(conversationHistory);
}

export async function refreshCachedConversations() {
  cachedConversations = await getAllConversations();
  for (const conv of cachedConversations) {
    conv._messages = await getConversationMessages(conv.id);
    conv._messages = conv._messages.map((msg) => msg.text);
  }
}

//Mensajes

export async function userSendMessage() {
  if (!textarea || !responseDiv) return null;

  const text = textarea.value.trim();
  if (!text) return null;

  if (!activeConversationId) {
    title = text.length > 40 ? text.slice(0, 40) + "..." : text;
    const newConv = await createConversation(title);

    if (newConv) {
      activeConversationId = newConv.id;
      cachedConversations.push(newConv);
      cachedConversations[cachedConversations.length - 1]._messages = [];
      await loadSidebarConversations();
    }
  }

  if (title === "Nueva conversación") {
    title = text.length > 40 ? text.slice(0, 40) + "..." : text;
    await renameConversation(activeConversationId, title);
    cachedConversations = cachedConversations.map((conversation) =>
      conversation.id === activeConversationId.id
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

  addMessageToConversationHistory(uiMessage);
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

export function renderMessage({ author, text, userProfile }) {
  const isUser =
    (!author.includes("-") && author !== "system") || author === "Usuario";
  const isSystem = author === "system";

  const wrapper = document.createElement("div");
  wrapper.className = `message-content-wrapper ${isUser ? "right" : "left"}`;

  const divText = document.createElement("div");
  divText.className = "text-content";
  divText.innerHTML = text;

  if (!isUser && !isSystem) {
    divText.classList.add("ai-message");
  }

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
  if (isUser) div.classList.add(`user-${author}`, "user");
  if (isSystem) div.classList.add("system");
  if (!isUser && !isSystem) {
    div.classList.add(`profile-${author.split("-")[0]}`);
    div.classList.add(`api-${author.split("-")[1]}`);
  }

  div.appendChild(wrapper);

  return div;
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
        continue;
      }

      const replyDiv = renderMessage({
        author: user.name.split(" ")[0] || "Usuario",
        text: `${file.name} cargado correctamente.`,
        userProfile: user.profilePicture,
      });

      addMessageToConversationHistory(replyDiv);
      responseDiv.appendChild(replyDiv);

      await saveMessage(activeConversationId, { text: replyDiv.textContent });

      conversationHistory.push({
        role: "user",
        content: `${file.name}: ${PDFcontent}`,
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

async function extractPDFText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n\n";
  }
  return fullText.trim();
}

//Auxiliares

export function replaceWeirdChars(text) {
  const htmlFreeText = text.replace(/```html|```/g, "");

  let open = true;
  const asteriskFreeText = htmlFreeText.replace(/\*\*/g, () => {
    const tag = open ? "<strong>" : "</strong>";
    open = !open;
    return tag;
  });

  const hashtagFreeText = asteriskFreeText.replace(/#{2,}/g, "");

  return hashtagFreeText;
}

export function extractBodyContent(html) {
  const isFullHTML =
    /<!doctype html>/i.test(html) ||
    (/<html[\s>]/i.test(html) && /<body[\s>]/i.test(html));

  if (!isFullHTML) {
    return html;
  }

  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : "";
}

export function toggleElement(element) {
  element.disabled = !element.disabled;
}

export const autoResizeTextarea = () => {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
};
