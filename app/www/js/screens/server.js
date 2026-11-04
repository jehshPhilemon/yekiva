// État de la voix (lecture seule) : l'apprenant ne tape JAMAIS d'URL.
// L'adresse de l'API est bakée au build (tools/build-config.mjs --api/--key).
// Cet écran dit si l'API TTS répond (GET /health), avec une tuile réessayer.
// Narré par le pack (prompts.server_hint), comme tous les écrans.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { screenPrompt } from "../core/narrate.js";

export function serverScreen({ services, state, go }) {
  const status = h("div", { class: "status" });
  const hint = h("div", { class: "server-hint" });
  const show = (name) => status.replaceChildren(name ? icon(name, 64) : "");
  const explain = (msg) => hint.replaceChildren(msg ? document.createTextNode(msg) : "");

  async function test() {
    const api = services.voiceApi ?? services.transcriber;
    const base = api?.apiUrl || api?.serverUrl || "";
    screenPrompt(services, state.language, "server_hint");
    if (!base || !api?.configured?.()) {
      show("cloudoff");
      explain("Mode hors-ligne : leçons + voix déjà entendues, aucun fallback téléphone.");
      return;
    }
    show("");
    status.append(document.createTextNode("…"));
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) {
        const info = await r.json().catch(() => null);
        const langs = Array.isArray(info?.languages) ? info.languages.join(", ") : "";
        show("check");
        explain(langs ? `API Yekiva jointe : voix ${langs} actives.` : "API Yekiva jointe : la voix est active.");
      } else {
        show("alert");
        explain("L'API ne répond pas correctement pour l'instant.");
      }
    } catch {
      show("cloudoff");
      explain("API injoignable pour l'instant : on continue hors-ligne.");
    }
  }

  const el = h(
    "div",
    { class: "screen" },
    hint,
    status,
    h("div", { class: "row small" },
      tile("replay", { onClick: test, size: 56, label: "reessayer" }),
      tile("check", { onClick: () => go("path"), size: 56, label: "continuer" })),
  );
  el.destroy = () => services.speaker.stop();
  test();
  return el;
}
