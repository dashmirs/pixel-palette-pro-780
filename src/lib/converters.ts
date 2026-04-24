import { saveAs } from "file-saver";
import JSZip from "jszip";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

export type ConversionCategory = "image" | "document" | "spreadsheet";

export const IMAGE_FORMATS = ["png", "jpeg", "webp", "bmp"] as const;
export const DOCUMENT_FORMATS = ["pdf", "txt", "html", "md"] as const;
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
export async function convertImage(file: File, target: ImageFormat): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    if (target === "jpeg" || target === "bmp") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0);
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
    // @ts-expect-error worker import
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
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
export async function convertFile(file: File, category: ConversionCategory, target: string): Promise<Blob> {
  if (category === "image") return convertImage(file, target as ImageFormat);
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