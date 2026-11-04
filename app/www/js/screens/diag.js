// Écran "Son et voix" : diagnostic 100 % tactile, sans URL ni console.
// Pensé pour un testeur sans clavier : 3 gros boutons = 3 tests, chacun
// affiche son résultat en toutes lettres + parle quand il le peut.
//   1. "bip" : le haut-parleur sort-il un son ? (hors voix)
//   2. "voix téléphone" : la synthèse vocale de secours parle-t-elle ?
//   3. "voix serveur" : la voix naturelle (serveur Yekiva) répond-elle ?
// + un bouton "erreurs" qui affiche le bandeau de debug (5-tapes sinon).
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";

function resultLine(text = "") {
  return h("div", { class: "diag-result", role: "status" }, text);
}

export function diagScreen({ services, go }) {
  const speaker = services.speaker;
  const line1 = resultLine("Appuyez sur un bouton pour tester le son.");
  const line2 = resultLine("");
  const line3 = resultLine("");

  const busy = (el, msg) => el.replaceChildren(msg);
  const say = (el, ok, detail) => {
    el.replaceChildren(document.createTextNode(`${ok ? "✅ " : "❌ "}${detail}`));
    el.classList.toggle("ok", ok);
    el.classList.toggle("ko", !ok);
  };

  const btnBeep = tile("volume", {
    size: 56, label: "test du haut-parleur", caption: "1 · bip",
    className: "diag-btn",
    onClick: async () => {
      busy(line1, "…");
      const r = await speaker.testBeep();
      say(line1, r.ok, r.detail);
    },
  });
  const btnPhone = tile("mic", {
    size: 56, label: "test de la voix téléphone", caption: "2 · voix téléphone",
    className: "diag-btn",
    onClick: async () => {
      busy(line2, "…");
      const lang = services.transcriber ? undefined : undefined;
      void lang;
      const code = "fr";
      const r = await speaker.testPhoneVoice(code);
      say(line2, r.ok, r.detail);
    },
  });
  const btnServer = tile("cloudoff", {
    size: 56, label: "test de la voix serveur", caption: "3 · voix serveur",
    className: "diag-btn",
    onClick: async () => {
      busy(line3, "…");
      const r = await speaker.testServerVoice("Bonjour, la voix du serveur arrive.", "fr");
      say(line3, r.ok, r.detail);
      // L'icône reflète le dernier résultat : check = joint, cloudoff = injoignable.
      try {
        btnServer.querySelector("svg")?.remove();
      } catch { /* ignore */ }
    },
  });

  // Résumé serveur baké (sans jargon) : quelle adresse l'APK essaie de joindre ?
  const base = services.transcriber?.serverUrl || "";
  const summary = resultLine(
    base
      ? `Serveur configuré : ${base}`
      : "Serveur NON configuré : cet APK a été construit sans --api (voix téléphone uniquement).",
  );
  summary.classList.add(base ? "ok" : "ko");

  const btnErrors = tile("alert", {
    size: 40, label: "afficher les erreurs", caption: "erreurs",
    className: "path-action",
    onClick: () => {
      try {
        window.YEKIVA?.debugOn?.();
      } catch { /* ignore */ }
    },
  });
  const btnBack = tile("check", {
    size: 40, label: "retour", caption: "retour",
    className: "path-action",
    onClick: () => go("path"),
  });

  const el = h(
    "div",
    { class: "screen diag-screen" },
    h("h1", { class: "diag-title" }, "Son et voix"),
    h("div", { class: "diag-sub" }, "3 tests, dans l'ordre. Si le 1 échoue : montez le volume / quittez le mode silencieux."),
    btnBeep, line1,
    btnPhone, line2,
    btnServer, line3,
    h("div", { class: "diag-sep" }),
    summary,
    h("div", { class: "path-actions" }, btnErrors, btnBack),
  );
  el.destroy = () => services.speaker.stop();
  return el;
}
