import { promises as fs } from "fs";
import path from "path";
import { getEnv } from "../config/env";
import { newId } from "../database/repositories";

type ResumeVersionLike = { publicId: string; sections: unknown[] };

function resumeLines(version: ResumeVersionLike, candidateName: string, role: string, company: string): string[] {
  const lines = [candidateName, `${role} · ${company}`, ""];
  const visit = (value: unknown) => {
    if (typeof value === "string" && value.trim()) lines.push(value.trim());
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (!["id", "order", "evidenceIds", "researchRequirementIds"].includes(key)) visit(child);
      }
    }
  };
  visit(version.sections);
  return lines.slice(0, 120);
}

function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
}

export function createMinimalPdf(lines: string[]): Buffer {
  const stream = [
    "BT", "/F1 11 Tf", "54 760 Td", "14 TL",
    ...lines.flatMap((line, index) => [`(${pdfEscape(line)}) Tj`, index < lines.length - 1 ? "T*" : ""]),
    "ET",
  ].filter(Boolean).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(entries: Array<{ name: string; body: string }>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const body = Buffer.from(entry.body);
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(body.length, 20); directory.writeUInt32LE(body.length, 24);
    directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += local.length + name.length + body.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createMinimalDocx(lines: string[]): Buffer {
  const paragraphs = lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join("");
  return zipStored([
    { name: "[Content_Types].xml", body: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", body: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", body: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>` },
  ]);
}

export async function renderPdfAndDocx(input: {
  resumeVersion: ResumeVersionLike;
  candidateName: string;
  role: string;
  company: string;
  tenantId?: string;
  applicationId?: string;
}) {
  const pdfFileId = newId("file_pdf");
  const docxFileId = newId("file_docx");
  const directory = path.join(getEnv().STORAGE_LOCAL_PATH, input.tenantId ?? "customer", "resumes", input.applicationId ?? input.resumeVersion.publicId);
  await fs.mkdir(directory, { recursive: true });
  const pdfPath = path.join(directory, `${pdfFileId}.pdf`);
  const docxPath = path.join(directory, `${docxFileId}.docx`);
  const lines = resumeLines(input.resumeVersion, input.candidateName, input.role, input.company);
  await Promise.all([
    fs.writeFile(pdfPath, createMinimalPdf(lines)),
    fs.writeFile(docxPath, createMinimalDocx(lines)),
  ]);
  return { pdfFileId, docxFileId, pdfPath, docxPath };
}
