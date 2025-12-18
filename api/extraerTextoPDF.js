/*import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { pureBase64 } = req.body;
    const data = Uint8Array.from(Buffer.from(pureBase64, "base64"));

    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += pageText + "\n\n";
    }

    res.json({ txt: fullText.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error extrayendo texto del PDF" });
  }
}
*/