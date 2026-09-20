import { readFile } from "node:fs/promises";
import path from "node:path";
import { RESUME_FONT_FACES } from "@/lib/resume-template";

// One bounded cache of four immutable font files, shared by all export requests.
let fontFiles: Promise<Buffer[]> | undefined;
export function loadResumeFonts(): Promise<Buffer[]> {
  fontFiles ??= Promise.all(RESUME_FONT_FACES.map(({ file }) =>
    readFile(path.join(process.cwd(), "public", "fonts", "resume", file)),
  )).catch((error) => {
    fontFiles = undefined;
    throw error;
  });
  return fontFiles;
}

export async function resumeFontDataUrls(): Promise<string[]> {
  return (await loadResumeFonts()).map((font) => `data:font/ttf;base64,${font.toString("base64")}`);
}
