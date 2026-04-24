import FileSaver from "file-saver";
const { saveAs } = FileSaver;
import JSZip from "jszip";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

export type ConversionCategory = "image" | "document" | "spreadsheet";

export const IMAGE_FORMATS = ["png", "jpeg", "webp", "bmp"] as const;
export const DOCUMENT_FORMATS = ["pdf", "docx", "txt", "html", "md", "rtf"] as const;
export const SPREADSHEET_FORMATS = ["xlsx", "csv", "json", "html"] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];
export type SpreadsheetFormat = (typeof SPREADSHEET_FORMATS)[number];

export function detectCategory(file: File): ConversionCategory | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif|svg)$/.test(name)) return "image";
  if (/\.(xlsx|xls|csv|ods)$/.test(name) || type.includes("spreadsheet") || type.includes("excel") || type === "text/csv") return "spreadsheet";
  if (/\.(pdf|docx|doc|txt|md|html?|rtf)$/.test(name) || type.startsWith("text/") || type.includes("pdf") || type.includes("word")) return "document";
  return null;
}

export function getAvailableFormats(category: ConversionCategory): readonly string[] {
  if (category === "image") return IMAGE_FORMATS;
  if (category === "document") return DOCUMENT_FORMATS;
  return SPREADSHEET_FORMATS;
}

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

// ---------- IMAGES ----------
export interface ImageResizeOptions {
  width?: number;
  height?: number;
  keepAspectRatio?: boolean;
}

export async function convertImage(
  file: File,
  target: ImageFormat,
  resize?: ImageResizeOptions
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });

    let outW = img.naturalWidth;
    let outH = img.naturalHeight;
    const ratio = img.naturalWidth / img.naturalHeight;
    if (resize && (resize.width || resize.height)) {
      const keep = resize.keepAspectRatio ?? true;
      if (resize.width && resize.height && !keep) {
        outW = resize.width;
        outH = resize.height;
      } else if (resize.width && resize.height && keep) {
        // fit within both
        outW = resize.width;
        outH = Math.round(resize.width / ratio);
        if (outH > resize.height) {
          outH = resize.height;
          outW = Math.round(resize.height * ratio);
        }
      } else if (resize.width) {
        outW = resize.width;
        outH = keep ? Math.round(resize.width / ratio) : img.naturalHeight;
      } else if (resize.height) {
        outH = resize.height;
        outW = keep ? Math.round(resize.height * ratio) : img.naturalWidth;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, outW);
    canvas.height = Math.max(1, outH);
    const ctx = canvas.getContext("2d")!;
    if (target === "jpeg" || target === "bmp") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const mime =
      target === "png" ? "image/png" :
      target === "jpeg" ? "image/jpeg" :
      target === "webp" ? "image/webp" :
      "image/bmp";
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Conversion failed"))), mime, 0.95);
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- DOCUMENTS ----------
async function readDocumentAsText(file: File): Promise<{ text: string; html?: string }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const html = (await mammoth.convertToHtml({ arrayBuffer })).value;
    const text = (await mammoth.extractRawText({ arrayBuffer })).value;
    return { text, html };
  }
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as string);
    (pdfjs as any).GlobalWorkerOptions.workerSrc = (worker as any).default;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((it: any) => it.str).join(" ") + "\n\n";
    }
    return { text };
  }
  // plain text / html / md
  const text = await file.text();
  if (name.endsWith(".html") || name.endsWith(".htm")) return { text: text.replace(/<[^>]+>/g, ""), html: text };
  return { text };
}

export async function convertDocument(file: File, target: DocumentFormat): Promise<Blob> {
  const { text, html } = await readDocumentAsText(file);
  if (target === "txt") return new Blob([text], { type: "text/plain" });
  if (target === "md") return new Blob([text], { type: "text/markdown" });
  if (target === "html") {
    const body = html ?? `<pre>${escapeHtml(text)}</pre>`;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(stripExt(file.name))}</title></head><body>${body}</body></html>`;
    return new Blob([doc], { type: "text/html" });
  }
  if (target === "rtf") {
    return new Blob([textToRtf(text)], { type: "application/rtf" });
  }
  if (target === "docx") {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const paragraphs = (text || " ").split(/\n/).map(
      (line) => new Paragraph({ children: [new TextRun(line)] })
    );
    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    return blob;
  }
  // pdf
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const lineHeight = 14;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const lines = pdf.splitTextToSize(text || " ", pageWidth - margin * 2);
  let y = margin;
  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight;
  }
  return pdf.output("blob");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function textToRtf(text: string): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\par\n");
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\fs22 ${escaped}}`;
}

// ---------- SPREADSHEETS ----------
export async function convertSpreadsheet(file: File, target: SpreadsheetFormat): Promise<Blob> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  if (target === "csv") {
    const csv = XLSX.utils.sheet_to_csv(firstSheet);
    return new Blob([csv], { type: "text/csv" });
  }
  if (target === "json") {
    const json = XLSX.utils.sheet_to_json(firstSheet);
    return new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  }
  if (target === "html") {
    const html = XLSX.utils.sheet_to_html(firstSheet);
    return new Blob([html], { type: "text/html" });
  }
  // xlsx
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ---------- DISPATCHER ----------
export async function convertFile(
  file: File,
  category: ConversionCategory,
  target: string,
  options?: { resize?: ImageResizeOptions }
): Promise<Blob> {
  if (category === "image") return convertImage(file, target as ImageFormat, options?.resize);
  if (category === "document") return convertDocument(file, target as DocumentFormat);
  return convertSpreadsheet(file, target as SpreadsheetFormat);
}

export function downloadBlob(blob: Blob, filename: string) {
  saveAs(blob, filename);
}

export async function downloadAllAsZip(items: { blob: Blob; name: string }[], zipName = "converted.zip") {
  const zip = new JSZip();
  for (const item of items) zip.file(item.name, item.blob);
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, zipName);
}

export function buildOutputName(originalName: string, target: string): string {
  return `${stripExt(originalName)}.${target === "jpeg" ? "jpg" : target}`;
}