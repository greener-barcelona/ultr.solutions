import { anthropic } from "../lib/antropicAuth.js";
import { drive } from "../lib/googleAuth.js";

async function resumirContenido(contenido) {
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
}

async function subirArchivoDrive(contenido, nombreArchivo) {
  const fileMetadata = {
    name: nombreArchivo,
    parents: ["1Byw_pdJX_EHPEzzmsrW9ZfSTlaVA0sef"],
  };
  const media = {
    mimeType: "text/plain",
    body: contenido,
  };
  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
  });
  return response.data.id;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { conversation, nombre, summarize } = req.body;
    const contenido = conversation.map((m) => m.content).join("\n\n");
    
    let data = contenido;
    if (summarize) {
      data = await resumirContenido(contenido);
    }

    const fileId = await subirArchivoDrive(
      data,
      nombre || "Conversación sin nombre"
    );

    res.json({ fileId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar a Drive" });
  }
}