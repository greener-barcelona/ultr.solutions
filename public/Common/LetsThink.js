import {
  sb,
  getLocalSession,
  getAllConversations,
  getConversationMessages,
} from "./db.js";

//Sesión

export const user = getLocalSession();

export function logout(MODE_KEY) {
  localStorage.removeItem(MODE_KEY);
  sb.auth.signOut();
  window.location.href = "../LogIn/";
}

//Conversaciones

export function addMessageToConversationHistory(message, conversationHistory) {
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
}

export async function refreshCachedConversations(cachedConversations) {
  cachedConversations = await getAllConversations();
  for (const conv of cachedConversations) {
    conv._messages = await getConversationMessages(conv.id);
    conv._messages = conv._messages.map((msg) => msg.text);
  }
  return cachedConversations;
}

//Mensajes

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

export function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
}
