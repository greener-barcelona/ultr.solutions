export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { messages, perfil } = req.body;
  if (!messages || !perfil) {
    return res.status(400).json({ error: "Falta mensaje o perfil" });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-4-1-fast-reasoning",
        messages: [perfil, ...messages],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Error al llamar a Grok: ${text}`);
    }

    const data = await response.json();
    const message = data.choices
      .filter((d) => d.finish_reason === "stop")
      .map((d) => d.message)[0];

    let reply = "";
    Array.isArray(message.content)
      ? (reply = message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n"))
      : (reply = message.content);

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al llamar a Grok" });
  }
}