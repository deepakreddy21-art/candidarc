import { type Page } from "@playwright/test";

const BENIGN_CONSOLE = [
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /Fast Refresh/i,
  /was preloaded using link preload but not used/i,
  /Failed to load resource: the server responded with a status of 4/i,
  /Warning: Extra attributes from the server/i,
  /Image with src/i,
];

export function attachPageGuards(page: Page, options?: { allowRequestFailure?: RegExp }) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (BENIGN_CONSOLE.some((pattern) => pattern.test(text))) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("/api/v1/")) return;
    if (options?.allowRequestFailure?.test(url)) return;
    failedRequests.push(`${request.method()} ${url} ${request.failure()?.errorText ?? ""}`);
  });

  return {
    assertClean() {
      if (pageErrors.length) throw new Error(`Unexpected page exceptions:\n${pageErrors.join("\n")}`);
      if (consoleErrors.length) throw new Error(`Unexpected console errors:\n${consoleErrors.join("\n")}`);
      if (failedRequests.length) throw new Error(`Unexpected failed API requests:\n${failedRequests.join("\n")}`);
    },
  };
}
