const MAX_PDF_PAGES = 12;
const MAX_EXTRACTED_TEXT_LENGTH = 40_000;

type PdfTextItem = {
  str?: string;
};

let workerConfigured = false;

function compactText(value: string) {
  return value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_LENGTH);
}

export async function extractPdfTextFromBytes(bytes: Uint8Array) {
  const [pdfjs, workerUrl] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.mjs?url")]);
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    workerConfigured = true;
  }

  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pagesToRead = Math.min(document.numPages, MAX_PDF_PAGES);
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? (item as PdfTextItem).str : undefined))
      .filter((text): text is string => Boolean(text?.trim()))
      .join(" ");
    if (text.trim()) pageTexts.push(text.trim());
  }

  return compactText(pageTexts.join("\n\n"));
}
