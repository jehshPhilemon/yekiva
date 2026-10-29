// Server status (read-only): the learner NEVER types a URL.
// Narrated by the pack (prompts.server_hint), like every other screen.
// The server address is baked in at build time (tools/build-config.mjs).
// This screen only shows whether the Yekiva server answers, with a retry tile.
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
    const base = services.transcriber.serverUrl;
    screenPrompt(services, state.language, "server_hint");
    if (!base) {
      show("cloudoff");
      explain("Mode hors-ligne : exercices d'écoute, la voix reviendra avec le serveur.");
      return;
    }
    show("");
    status.append(document.createTextNode("…"));
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) {
        show("check");
        explain("Serveur Yekiva joint : la voix et la photo sont actives.");
      } else {
        show("alert");
        explain("Le serveur ne répond pas correctement.");
      }
    } catch {
      show("cloudoff");
      explain("Serveur injoignable pour l'instant : on continue hors-ligne.");
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
