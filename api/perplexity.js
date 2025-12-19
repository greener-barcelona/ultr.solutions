import { perplexity } from "../lib/perplexityAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { messages, perfil } = req.body;
  if (!messages || !perfil) {
    return res.status(400).json({ error: "Falta mensaje o perfil" });
  }

  try {
    const response = await perplexity.chat.completions.create({
      model: "sonar-pro",
      messages: [
        perfil,
        { role: "user", content: messages.map((m) => m.content).join("\n\n") },
      ],
    });

    const content = response.choices[0].message.content.replace(/\[\d+\]/g, '');
    const reply =
      typeof content === "string"
        ? content
        : content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n");

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al llamar a Perplexity" });
  }
}