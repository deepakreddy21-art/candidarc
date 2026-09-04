(() => {
  const host = location.hostname;
  const supported = host.includes("greenhouse.io") || host === "jobs.lever.co" || host === "jobs.ashbyhq.com";
  if (!supported || document.getElementById("candidarc-save-job")) return;
  // Injection is intentionally user-activated; no form fields are read or changed on load.
  const button = document.createElement("button");
  button.id = "candidarc-save-job";
  button.textContent = "Save job to CandidArc";
  Object.assign(button.style, { position: "fixed", right: "20px", bottom: "20px", zIndex: "2147483647", padding: "12px 16px", border: "0", borderRadius: "10px", background: "#635bff", color: "white", cursor: "pointer" });
  button.addEventListener("click", async () => {
    await chrome.storage.local.set({ pendingJob: { url: location.href, title: document.title, capturedAt: new Date().toISOString() } });
    button.textContent = "Saved to CandidArc";
  }, { once: true });
  document.body.appendChild(button);
})();
