/* ============================================================
   3PSolutions Dashboard — client-side auth glue
   Shows the signed-in user and wires the sign-out button.
   The actual gating happens server-side (server.py).
   ============================================================ */
(function () {
  // User display (avatar, name, role) is handled in app.js via setUserChrome().
  // This file only wires sign-out controls (any element with .js-logout).
  document.querySelectorAll(".js-logout").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await fetch("/api/logout", { method: "POST" }); } catch (_) {}
      window.location.href = "/login";
    });
  });
})();
