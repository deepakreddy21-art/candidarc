declare module "mammoth" {
  import type { Buffer } from "node:buffer";
  export function extractRawText(input: {
    buffer: Buffer;
  }): Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
}
