/* Light/dark theme (the same as minethegap.eu's assets/js/theme.js). Default is automatic (follows the OS); the moon/sun
   button in the navigation flips light <-> dark, and the choice is remembered (key mtg-theme: "light" / "dark", absent =
   automatic). Loaded synchronously in <head> so a saved choice is on <html> before the first paint (no flash); CSP
   forbids inline scripts, so this lives in a static file. The icons swap by CSS from the same state. On this site the
   map's base layer follows the theme too: every change is announced with a "mtg-theme" event that map.js listens to. */
(function () {
  "use strict";
  var root = document.documentElement, KEY = "mtg-theme",
      mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function apply(value) {
    if (value === "light" || value === "dark") root.setAttribute("data-theme", value);
    else root.removeAttribute("data-theme");  // automatic: let the OS decide
  }
  function isDark() {
    var v = root.getAttribute("data-theme");
    if (v === "dark") return true;
    if (v === "light") return false;
    return !!(mq && mq.matches);  // automatic
  }
  function announce() {
    document.dispatchEvent(new CustomEvent("mtg-theme", { detail: { dark: isDark() } }));
  }

  apply(stored());  // before paint
  window.mtgIsDark = isDark;

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    var next = isDark() ? "light" : "dark";
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (err) {}
    announce();
  });
  // Automatic: the OS may switch (e.g. at sunset).
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (!stored()) announce(); });
})();
