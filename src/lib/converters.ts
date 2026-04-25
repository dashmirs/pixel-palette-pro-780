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
export const FILE_FORMATS = ["pdf", "docx", "txt", "html", "md", "rtf", "xlsx", "csv", "json"] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];
export type SpreadsheetFormat = (typeof SPREADSHEET_FORMATS)[number];
export type FileFormat = (typeof FILE_FORMATS)[number];

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
  return FILE_FORMATS;
}

export function getPreferredFormats(category: ConversionCategory, sourceName: string): readonly string[] {
  const name = sourceName.toLowerCase();
  if (category === "image") {
    const current = name.match(/\.([^.]+)$/)?.[1];
    return [...IMAGE_FORMATS].sort((a, b) => {
      if (a === current) return -1;
      if (b === current) return 1;
      return 0;
    });
  }

  const sourceExt = name.match(/\.([^.]+)$/)?.[1];
  const priority: Record<string, number> = {
    pdf: 0,
    docx: 1,
    txt: 2,
    html: 3,
    md: 4,
    rtf: 5,
    xlsx: 6,
    csv: 7,
    json: 8,
  };

  return [...FILE_FORMATS].sort((a, b) => {
    if (a === sourceExt) return -1;
    if (b === sourceExt) return 1;
    return (priority[a] ?? 999) - (priority[b] ?? 999);
  });
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
      i.crossOrigin = "anonymous";
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

    if (file.name.toLowerCase().endsWith(".svg") || file.type === "image/svg+xml") {
      const svgText = await file.text();
      const nextSvg = rewriteSvgSize(svgText, canvasSafeDimension(outW), canvasSafeDimension(outH));
      if (target === "png" || target === "jpeg" || target === "webp" || target === "bmp") {
        return rasterizeSvg(nextSvg, target, canvasSafeDimension(outW), canvasSafeDimension(outH));
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

function canvasSafeDimension(value: number) {
  return Math.max(1, Math.round(value || 1));
}

async function rasterizeSvg(svg: string, target: ImageFormat, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser");
    if (target === "jpeg" || target === "bmp") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    const mime =
      target === "png" ? "image/png" :
      target === "jpeg" ? "image/jpeg" :
      target === "webp" ? "image/webp" :
      "image/bmp";
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Conversion failed"))), mime, 0.95);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rewriteSvgSize(svg: string, width: number, height: number) {
  let next = svg;
  if (/\<svg[^>]*\bwidth=/.test(next)) {
    next = next.replace(/\bwidth=("[^"]*"|'[^']*')/, `width="${width}"`);
  } else {
    next = next.replace(/<svg\b/, `<svg width="${width}"`);
  }
  if (/\<svg[^>]*\bheight=/.test(next)) {
    next = next.replace(/\bheight=("[^"]*"|'[^']*')/, `height="${height}"`);
  } else {
    next = next.replace(/<svg\b/, `<svg height="${height}"`);
  }
  return next;
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
    const pdf = await (pdfjs as any).getDocument({ data: await file.arrayBuffer(), disableWorker: true }).promise;
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

async function readSpreadsheetData(file: File): Promise<{
  workbook: XLSX.WorkBook;
  sheetName: string;
  rows: any[][];
  html: string;
  text: string;
  json: Record<string, any>[];
}> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }) as any[][];
  const html = XLSX.utils.sheet_to_html(firstSheet);
  const text = rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")).join("\n");
  const json = XLSX.utils.sheet_to_json(firstSheet, { defval: "" }) as Record<string, any>[];
  return { workbook, sheetName, rows, html, text, json };
}

async function createDocxFromText(text: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const lines = (text || " ").split(/\n/);
  const paragraphs = lines.length
    ? lines.map((line) => new Paragraph({ children: [new TextRun(line || " ")] }))
    : [new Paragraph({ children: [new TextRun(" ")] })];
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBlob(doc);
}

function rowsToCsv(rows: any[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

function rowsToMarkdown(rows: any[][]): string {
  if (!rows.length) return "";
  const normalized = rows.map((row) => row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")));
  const columnCount = Math.max(...normalized.map((row) => row.length), 1);
  const fill = (row: string[]) => Array.from({ length: columnCount }, (_, index) => row[index] ?? "");
  const header = fill(normalized[0]);
  const divider = Array.from({ length: columnCount }, () => "---");
  const body = normalized.slice(1).map(fill);
  return [header, divider, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function rowsToHtml(title: string, rows: any[][]): string {
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const header = rows[0]?.length ? rows[0] : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
  const body = rows.length > 1 ? rows.slice(1) : [];
  const thead = `<tr>${header.map((cell) => `<th>${escapeHtml(String(cell ?? ""))}</th>`).join("")}</tr>`;
  const tbody = body.length
    ? body
        .map(
          (row) =>
            `<tr>${Array.from({ length: columnCount }, (_, index) => `<td>${escapeHtml(String(row[index] ?? ""))}</td>`).join("")}</tr>`,
        )
        .join("")
    : `<tr>${Array.from({ length: columnCount }, () => "<td></td>").join("")}</tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></body></html>`;
}

function rowsToWorkbook(rows: any[][], sheetName = "Sheet1") {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows.length ? rows : [[""]]);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31) || "Sheet1");
  return workbook;
}

function workbookToBlob(workbook: XLSX.WorkBook): Blob {
  const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function textToRows(text: string): string[][] {
  const lines = (text || "").split(/\r?\n/);
  return lines.length ? lines.map((line) => [line]) : [[""]];
}

async function createPdfFromText(text: string): Promise<Blob> {
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

export async function convertDocument(file: File, target: FileFormat): Promise<Blob> {
  const { text, html } = await readDocumentAsText(file);
  if (target === "txt") return new Blob([text], { type: "text/plain" });
  if (target === "md") return new Blob([text], { type: "text/markdown" });
  if (target === "html") {
    const body = html ?? `<pre>${escapeHtml(text)}</pre>`;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(stripExt(file.name))}</title></head><body>${body}</body></html>`;
    return new Blob([doc], { type: "text/html" });
  }
  if (target === "rtf") return new Blob([textToRtf(text)], { type: "application/rtf" });
  if (target === "docx") return createDocxFromText(text);
  if (target === "pdf") return createPdfFromText(text);
  if (target === "csv") return new Blob([rowsToCsv(textToRows(text))], { type: "text/csv" });
  if (target === "json") return new Blob([JSON.stringify(textToRows(text).map((row) => ({ value: row[0] ?? "" })), null, 2)], { type: "application/json" });
  return workbookToBlob(rowsToWorkbook(textToRows(text), stripExt(file.name)));
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
export async function convertSpreadsheet(file: File, target: FileFormat): Promise<Blob> {
  const { workbook, sheetName, rows, html, text, json } = await readSpreadsheetData(file);
  if (target === "csv") return new Blob([rowsToCsv(rows)], { type: "text/csv" });
  if (target === "json") return new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  if (target === "html") return new Blob([html || rowsToHtml(stripExt(file.name), rows)], { type: "text/html" });
  if (target === "txt") return new Blob([text], { type: "text/plain" });
  if (target === "md") return new Blob([rowsToMarkdown(rows)], { type: "text/markdown" });
  if (target === "rtf") return new Blob([textToRtf(text)], { type: "application/rtf" });
  if (target === "docx") return createDocxFromText(text);
  if (target === "pdf") return createPdfFromText(text);
  return workbookToBlob(workbook.SheetNames.length ? workbook : rowsToWorkbook(rows, sheetName));
}

// ---------- DISPATCHER ----------
export async function convertFile(
  file: File,
  category: ConversionCategory,
  target: string,
  options?: { resize?: ImageResizeOptions }
): Promise<Blob> {
  if (category === "image") return convertImage(file, target as ImageFormat, options?.resize);
  if (category === "document") return convertDocument(file, target as FileFormat);
  return convertSpreadsheet(file, target as FileFormat);
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