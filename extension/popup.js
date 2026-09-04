chrome.storage.local.get(["mode", "pendingJob"], ({ mode, pendingJob }) => {
  const selected = document.querySelector(`input[value="${mode || "prepare_only"}"]`); if (selected) selected.checked = true;
  document.getElementById("status").textContent = pendingJob ? pendingJob.title : "Open a supported ATS job page.";
});
document.querySelectorAll('input[name="mode"]').forEach((input) => input.addEventListener("change", () => chrome.storage.local.set({ mode: input.value })));
document.getElementById("review").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_REVIEW", opportunityId: "new" }));
