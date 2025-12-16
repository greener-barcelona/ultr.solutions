import { anthropic } from "../lib/antropicAuth.js";

async function resumirContenido(contenido) {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 5000,
      system:
        "Eres un experto generador de briefs y resúmenes que ayuda a la hora de sintetizar largas conversaciones entre muchos usuarios.",
      messages: [
        {
          role: "user",
          content: `Necesito que hagas un resumen exhaustivo de la siguiente conversación entre varias personas: ${contenido}`,
        },
      ],
    });

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { conversation } = req.body;
  if (!conversation) {
    return res.status(400).json({ error: "Falta conversación" });
  }

  try {
    const contenido = conversation.map((m) => m.content).join("\n\n");
    const reply = await resumirContenido(contenido);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al resumir" });
  }
}