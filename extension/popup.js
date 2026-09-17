chrome.storage.local.get(["mode", "pendingJob"], ({ mode, pendingJob }) => {
  const selected = document.querySelector(`input[value="${mode || "prepare_only"}"]`); if (selected) selected.checked = true;
  document.getElementById("status").textContent = pendingJob ? pendingJob.title : "Open a supported ATS job page.";
});
document.querySelectorAll('input[name="mode"]').forEach((input) => input.addEventListener("change", () => chrome.storage.local.set({ mode: input.value })));
document.getElementById("review").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_REVIEW", opportunityId: "new" }));
document.getElementById("prepare-fill")?.addEventListener("click", async () => {
  const host = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? "";
  const origin = host ? new URL(host).host : "";
  try {
    const res = await fetch(`http://localhost:3000/api/v1/autofill/mapping?host=${encodeURIComponent(origin)}&opportunityId=new`, { credentials: "include" });
    const body = await res.json();
    await chrome.storage.local.set({ fillPackage: body });
    document.getElementById("status").textContent = body.supported
      ? "Fill package saved. Reload the ATS page, then review every field. CandidArc will not submit."
      : "This site is not a supported Greenhouse, Lever, or Ashby host.";
  } catch {
    document.getElementById("status").textContent = "Could not load a fill package. Sign in to CandidArc on localhost first.";
  }
});
