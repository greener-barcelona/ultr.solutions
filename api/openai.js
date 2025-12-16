import { openai } from "../lib/openaiAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { messages, perfil } = req.body;
  if (!messages || !perfil) {
    return res.status(400).json({ error: "Falta mensaje o perfil" });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [perfil, ...messages],
    });

    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al llamar a OpenAI" });
  }
}