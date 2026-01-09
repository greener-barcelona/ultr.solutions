import { anthropic } from "../lib/antropicAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { messages, perfil } = req.body;
  if (!messages || !perfil) {
    return res.status(400).json({ error: "Falta mensaje o perfil" });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 5000,
      system: perfil.content,
      messages: messages,
    });

    res.json({
      reply: response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n"),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al llamar a Claude" });
  }
}
/* 
Ejemplos de uso de mensajes con imagenes y PDFs: (para el briefer)
[
  {
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: imageBase64
        }
      }
    ]
  },
  {
    role: "user",
    content: [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdfBase64
        }
      }
    ]
  },
  {
    role: "user",
    content: "Analiza estos documentos"  
  } 
]*/
