import { sb } from "../Common/db.js";

const allowedDomains = ["itsgreener.com", "ffforward.ai", "villamagia.com"];

function isAllowedDomain(email) {
  if (!email || !email.includes("@")) return false;
  const domain = email.split("@")[1].toLowerCase();
  return allowedDomains.includes(domain);
}

function saveLocalSession(user) {
  localStorage.setItem(
    "ultraUser",
    JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.email,
      profilePicture: user.user_metadata?.avatar_url || null,
    })
  );
}

async function ensureUserInDB(user) {
  const { data: existing } = await sb
    .from("app_users")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();

  if (!existing) {
    await sb.from("app_users").insert({
      email: user.email,
      display_name: user.user_metadata?.full_name || user.email,
      avatar_url: user.user_metadata?.avatar_url || null,
    });
  }
}

sb.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_IN") {
    const user = session.user;

    console.log("SIGNED_IN con:", user.email);

    if (!isAllowedDomain(user.email)) {
      alert("Dominio no permitido");
      await sb.auth.signOut();
      localStorage.removeItem("ultraUser");
      return;
    }

    await ensureUserInDB(user);
    saveLocalSession(user);

    window.location.href = "../Chat/";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("googleLoginBtn");

  btn.addEventListener("click", async (e) => {
    e.preventDefault();

    await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "http://ultr.solutions/LogIn/",
      },
    });
  });
});
