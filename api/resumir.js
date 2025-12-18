import { openai } from "../lib/openaiAuth.js";
import { instrucciones } from "../public/LetsTalk/perfiles.js"

async function resumirContenido(contenido) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            `Eres un experto generador de briefs y resúmenes que ayuda a la hora de sintetizar largas conversaciones entre muchos usuarios.\n${instrucciones}`,
        },
        {
          role: "user",
          content: `Necesito que hagas un resumen exhaustivo de la siguiente conversación entre varias personas: ${contenido}`,
        },
      ],
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al llamar a OpenAI" });
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