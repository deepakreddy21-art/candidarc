(() => {
  const host = location.hostname;
  const supported = host.includes("greenhouse.io") || host === "jobs.lever.co" || host.includes("ashbyhq.com");
  if (!supported || document.getElementById("candidarc-save-job")) return;

  const button = document.createElement("button");
  button.id = "candidarc-save-job";
  button.textContent = "Save job to CandidArc";
  Object.assign(button.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "2147483647",
    padding: "12px 16px",
    border: "0",
    borderRadius: "10px",
    background: "#635bff",
    color: "white",
    cursor: "pointer",
  });
  button.addEventListener("click", async () => {
    await chrome.storage.local.set({
      pendingJob: { url: location.href, title: document.title, capturedAt: new Date().toISOString() },
    });
    button.textContent = "Saved to CandidArc";
  }, { once: true });
  document.body.appendChild(button);

  chrome.storage.local.get(["mode", "fillPackage"], ({ mode, fillPackage }) => {
    if (mode !== "autofill_review" || !fillPackage?.fields) return;
    const overlay = document.createElement("div");
    overlay.id = "candidarc-review-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.textContent = "CandidArc filled approved fields only. Review every answer. The extension never submits and never bypasses CAPTCHA.";
    Object.assign(overlay.style, {
      position: "fixed",
      left: "20px",
      bottom: "20px",
      zIndex: "2147483647",
      maxWidth: "320px",
      padding: "12px 14px",
      borderRadius: "10px",
      background: "#111",
      color: "white",
      font: "13px system-ui",
    });
    document.body.appendChild(overlay);

    for (const field of fillPackage.fields) {
      if (!field.fillable || !field.selector) continue;
      const el = document.querySelector(field.selector);
      if (!el) continue;
      if (field.sensitive && !field.approved) continue;
      if ("value" in el) {
        el.value = field.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    document.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((submit) => {
      submit.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        overlay.textContent = "Submission blocked. Continue only after you review the employer form yourself.";
      }, true);
    });
  });
})();
