import { openai } from "../lib/openaiAuth.js";
import { drive } from "../lib/googleAuth.js";

async function resumirContenido(contenido) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres un experto generador de briefs y resúmenes que ayuda a la hora de sintetizar largas conversaciones entre muchos usuarios.`,
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

async function subirArchivoDrive(contenido, nombreArchivo, usuario) {
  const fileMetadata = {
    name: nombreArchivo,
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
  const fileId = response.data.id;

  if (usuario) {
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: usuario,
      },
      fields: "id",
    });
  }

  return fileId;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { conversation, nombre, summarize, usuario } = req.body;
    const contenido = conversation.map((m) => m.content).join("\n\n");

    let data = contenido;
    if (summarize) {
      data = await resumirContenido(contenido);
    }

    const fileId = await subirArchivoDrive(
      data,
      nombre || "Conversación sin nombre",
      usuario
    );

    res.json({ fileId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar a Drive" });
  }
}
