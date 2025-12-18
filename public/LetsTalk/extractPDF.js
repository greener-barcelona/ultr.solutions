import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs";

export async function extractPDFText(file) {
  console.log(file);
  const base64 = await fileToBase64(file);
  const pureBase64 = base64.split(",")[1];
  const data = Uint8Array.from(Buffer.from(pureBase64, "base64"));
  console.log(data);
  const arrayBuffer = await data.arrayBuffer();
  console.log(arrayBuffer);
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  console.log(pdf);

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n\n";
  }
  console.log(fullText);
  return fullText;
}
