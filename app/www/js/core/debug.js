// Test-only error overlay: makes every error VISIBLE on the phone screen
// (a non-reader tester cannot open the console). Enabled with:
//   localStorage.setItem("yekiva.debug", "1")   then reload.
// Disabled (and fully removed) with YEKIVA.debugOff() or one tap on "tout effacer".
//
// What it shows: JS errors, failed fetches (packs/audio/server), voice failures.
// One button clears the list; one button disables the overlay entirely.
import { h } from "../ui/dom.js";

const KEY = "yekiva.debug";
const MAX = 30;

export function debugEnabled() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDebug(on) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function createDebug() {
  const errors = [];
  let bar = null;
  let list = null;

  function render() {
    if (!bar) return;
    bar.querySelector(".dbg-count").textContent = errors.length ? `${errors.length} erreur${errors.length > 1 ? "s" : ""}` : "aucune erreur";
    bar.classList.toggle("has-errors", errors.length > 0);
    if (list) {
      list.replaceChildren(
        ...errors.map((e) =>
          h("div", { class: "dbg-item" },
            h("span", { class: "dbg-time" }, e.time),
            h("span", { class: "dbg-msg" }, e.message)),
        ),
      );
    }
  }

  function push(message) {
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    errors.unshift({ time, message: String(message).slice(0, 300) });
    while (errors.length > MAX) errors.pop();
    render();
  }

  function mount() {
    if (bar || !debugEnabled()) return;
    bar = h("div", { class: "dbg", role: "status" },
      h("span", { class: "dbg-dot" }),
      h("span", { class: "dbg-count" }, "aucune erreur"),
      h("button", { class: "dbg-btn", type: "button", onclick: () => { list?.classList.toggle("open"); } }, "voir"),
      h("button", { class: "dbg-btn", type: "button", onclick: () => { errors.length = 0; render(); } }, "tout effacer"),
      h("button", { class: "dbg-btn", type: "button", onclick: () => window.YEKIVA?.debugOff() }, "off"),
    );
    list = h("div", { class: "dbg-list" });
    bar.append(list);
    document.body.append(bar);
    render();
  }

  function unmount() {
    bar?.remove();
    bar = null;
    list = null;
  }

  // Catch-all: JS errors + failed fetches, with the URL that failed.
  function install() {
    window.addEventListener("error", (e) => push(e.message || "erreur JS"));
    window.addEventListener("unhandledrejection", (e) => push(`promesse: ${e.reason?.message ?? e.reason ?? "?"}`));
    if (!window.__yekivaFetchWrapped) {
      window.__yekivaFetchWrapped = true;
      const orig = window.fetch.bind(window);
      window.fetch = async (...args) => {
        try {
          const res = await orig(...args);
          if (!res.ok) push(`${labelUrl(args[0])} → ${res.status}: ${shortUrl(args[0])}`);
          return res;
        } catch (e) {
          push(`${labelUrl(args[0])} injoignable: ${shortUrl(args[0])} (${e?.message ?? "?"})`);
          throw e;
        }
      };
    }
  }

  function shortUrl(u) {
    return String(u).slice(0, 140);
  }

  // Tells at a glance WHO was called: the Yekiva server (good) or Meta (forbidden from the app).
  function labelUrl(u) {
    const s = String(u).toLowerCase();
    if (s.includes("api.meta.ai") || s.includes("api.mata.ai")) return "META (interdit dans l'app — utilisez le serveur Yekiva)";
    if (s.includes("/v1/transcribe") || s.includes("/v1/lesson-from-photo") || s.includes("/v1/speak") || s.includes("/v1/voice") || s.includes("/health")) return "serveur Yekiva";
    if (s.includes("packs/") || s.endsWith(".wav") || s.endsWith(".json")) return "fichier local";
    return "réseau";
  }

  return {
    push,
    mount,
    unmount,
    clear() {
      errors.length = 0;
      render();
    },
    install,
  };
}
