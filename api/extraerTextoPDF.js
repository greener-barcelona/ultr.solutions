import PDFParse from "pdf-parse/lib/pdf-parse.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { pureBase64 } = req.body;
    const data = new Uint8Array(Buffer.from(pureBase64, "base64"));
    const result = new PDFParse(data);
    const extractedText = await result.getText();

    res.json({
      txt: extractedText.text,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error subiendo el PDF" });
  }
}
