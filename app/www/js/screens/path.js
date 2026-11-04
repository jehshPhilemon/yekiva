// Visual learning path: each step carries a contextual symbol, a short title and visible progress.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { profile, progress } from "../core/storage.js";
import { screenPrompt } from "../core/narrate.js";

export async function pathScreen({ services, state, go }) {
  const { language: lang, audience } = state;
  const done = progress.load(lang.code, audience);
  const lessonIds = lang.tracks[audience] ?? [];
  const labels = lang.labels ?? {};
  const actions = labels.actions ?? {};
  const lessons = await Promise.all(lessonIds.map(async (id) => {
    try {
      return await services.packs.loadLesson(lang, id);
    } catch {
      return { id, title: id, symbol: id, icon: "book", steps: [] };
    }
  }));
  const doneCount = lessonIds.filter((id) => done[id]).length;

  const change = tile("swap", {
    onClick: () => {
      profile.clear();
      go("language");
    },
    size: 28,
    label: actions.change ?? "change language",
    caption: actions.change,
    className: "path-change",
  });
  const progressBadge = h(
    "div",
    {
      class: "path-progress",
      role: "status",
      "aria-label": `${doneCount} / ${lessonIds.length} ${labels.completed ?? "lessons completed"}`,
    },
    icon("star", 25),
    h("span", {}, `${doneCount}/${lessonIds.length}`),
  );
  const header = h(
    "div",
    { class: "path-header" },
    h("h1", { class: "path-title" }, labels.pathTitle ?? "Mon parcours"),
    progressBadge,
  );

  const nodes = lessons.map((lesson, index) => {
    const isDone = Boolean(done[lesson.id]);
    const context = lesson.steps?.find((step) => step.params?.context)?.params?.context;
    const title = lesson.title ?? lesson.id;
    const symbol = lesson.symbol ?? context?.letter ?? String(index + 1);
    const visual = lesson.icon ?? context?.icon ?? "book";
    const card = h(
      "button",
      {
        class: `path-node${isDone ? " is-complete" : ""}`,
        type: "button",
        "aria-label": `${title} — ${symbol}`,
      },
      h("span", { class: "path-node-art" }, icon(visual, 54)),
      h(
        "span",
        { class: "path-node-info" },
        h("span", { class: "path-node-symbol" }, symbol),
        h("span", { class: "path-node-title" }, title),
      ),
      h("span", { class: "path-node-action", "aria-hidden": "true" }, icon(isDone ? "star" : "play", 30)),
    );
    card.style.setProperty("--path-color", lang.color);
    card.addEventListener("click", () => go("lesson", { lessonId: lesson.id }));
    return card;
  });

  const online = services.transcriber.available();
  const photo = tile("camera", {
    onClick: () => go("photo"), size: 40,
    label: actions.photo ?? "photo lesson", caption: actions.photo,
    className: "path-action",
  });
  const server = tile(online ? "check" : "cloudoff", {
    onClick: () => go("server"), size: 40,
    label: actions.server ?? "voice status", caption: actions.server,
    className: "path-action",
  });
  const replay = tile("volume", {
    onClick: () => screenPrompt(services, lang, "path_hint"), size: 40,
    label: actions.replay ?? "repeat", caption: actions.replay,
    className: "path-action",
  });
  // Diagnostic son 100 % tactile : 3 tests (bip, voix téléphone, voix serveur).
  const diag = tile("music", {
    onClick: () => go("diag"), size: 40,
    label: "Son et voix : tester", caption: "son ?",
    className: "path-action",
  });
  const bar = h("div", { class: "path-actions" }, photo, server, replay, diag);

  const screen = h(
    "div",
    { class: "screen path-screen" },
    change,
    header,
    h("div", { class: "path-list" }, nodes),
    bar,
  );
  screen.destroy = () => services.speaker.stop();
  screen.prompt = () => screenPrompt(services, lang, "path_hint");
  queueMicrotask(() => screen.prompt());
  return screen;
}
