import { openai } from "../lib/openaiAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { conversation } = req.body;
  if (!conversation) {
    return res.status(400).json({ error: "Falta conversación" });
  }

  const contenido = conversation.map((m) => m.content).join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
          Eres un experto generador de briefs y resúmenes que ayuda a la hora de sintetizar largas conversaciones entre muchos usuarios.
          ### Formato de Respuesta (OBLIGATORIO)
            - HTML limpio y autocontenible (no alterar CSS externo ni body) (MUY IMPORTANTE)
            - Texto negro, sin margenes ni paddings
            - Títulos y subtítulos, ideas separadas por espacios
            - Resalta conceptos clave en negrita
            - Emojis moderados para guiar lectura y énfasis
            - No firmes tu respuesta ni indiques número de palabras`,
        },
        {
          role: "user",
          content: `${contenido}
          Quiero que analices este diálogo y definas:  
          - 1. En un párrafo breve, el objeto de la conversación  
          - 2. Los 20 mejores insights que se descubren en la conversación 
          - 3. Las 20 mejores ideas que se proponen para ajustar, afinar, modificar el planteo inicial. 
          - 4. En que afectan a la temática inicial propuesta estos insights e ideas.`,
        },
      ],
    });

    const text = response.choices[0].message.content;
    res.json({ reply: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al llamar a OpenAI" });
  }
}
