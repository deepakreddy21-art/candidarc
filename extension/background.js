chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set({ mode: "prepare_only" }));
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_REVIEW") {
    const id = encodeURIComponent(message.opportunityId || "new");
    chrome.tabs.create({ url: `http://localhost:3000/app/opportunities/${id}/application` });
    sendResponse({ ok: true });
  }
});
