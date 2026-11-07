import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";

export type BulkAwbLabel = {
  awb: string;
  format: "pdf" | "png" | "zpl";
  base64: string;
};

const PAGE_WIDTH = 288; // 4 inches in PDF points
const PAGE_HEIGHT = 432; // 6 inches in PDF points

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/^data:[^,]*;base64,/, "").replace(/\s/g, "");
  return new Uint8Array(Buffer.from(normalized, "base64"));
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "label";
}

export async function labelToPdf(label: BulkAwbLabel): Promise<Uint8Array> {
  const bytes = decodeBase64(label.base64);
  if (label.format === "pdf") {
    if (Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") {
      throw new Error(`Invalid PDF label for ${label.awb}`);
    }
    await PDFDocument.load(bytes);
    return bytes;
  }
  if (label.format === "zpl") {
    throw new Error(`ZPL label for ${label.awb} requires a trusted ZPL-to-PDF renderer; do not rename ZPL as PDF.`);
  }
  if (!Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`Invalid PNG label for ${label.awb}`);
  }
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(bytes);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const scale = Math.min(PAGE_WIDTH / png.width, PAGE_HEIGHT / png.height);
  page.drawImage(png, {
    x: (PAGE_WIDTH - png.width * scale) / 2,
    y: (PAGE_HEIGHT - png.height * scale) / 2,
    width: png.width * scale,
    height: png.height * scale,
  });
  return pdf.save();
}

export async function createBulkAwbPdfArchive(labels: BulkAwbLabel[]): Promise<{
  zip: Uint8Array;
  combinedPdf: Uint8Array;
  count: number;
}> {
  if (!labels.length) throw new Error("No successful AWB labels available.");
  const zip = new JSZip();
  const combined = await PDFDocument.create();
  const seen = new Set<string>();
  for (const label of labels) {
    const pdfBytes = await labelToPdf(label);
    const fileName = safeName(label.awb);
    if (seen.has(fileName)) throw new Error(`Duplicate AWB label: ${label.awb}`);
    seen.add(fileName);
    zip.file(`${fileName}.pdf`, pdfBytes);
    const source = await PDFDocument.load(pdfBytes);
    const pages = await combined.copyPages(source, source.getPageIndices());
    for (const page of pages) combined.addPage(page);
  }
  const combinedPdf = await combined.save();
  zip.file("All_AWB_Labels.pdf", combinedPdf);
  return {
    zip: new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })),
    combinedPdf,
    count: labels.length,
  };
}
