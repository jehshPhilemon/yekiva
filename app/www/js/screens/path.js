// Visual learning path: each step carries a contextual symbol, a short title and visible progress.
// GATING: lessons unlock in order — lesson N+1 opens only when lesson N is
// validated (progress.done). The first lesson is always open. Locked lessons
// show a lock, cannot be tapped, and the voice says so (non-reader friendly).
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { profile, progress } from "../core/storage.js";
import { screenPrompt } from "../core/narrate.js";
import { startCycle } from "../ui/cycle.js";

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
    // Sequential unlock: open if first lesson or the previous one is validated.
    const isOpen = index === 0 || Boolean(done[lessons[index - 1]?.id]);
    const context = lesson.steps?.find((step) => step.params?.context)?.params?.context;
    const title = lesson.title ?? lesson.id;
    const symbol = lesson.symbol ?? context?.letter ?? String(index + 1);
    const visual = lesson.icon ?? context?.icon ?? "book";
    const card = h(
      "button",
      {
        class: `path-node${isDone ? " is-complete" : ""}${isOpen ? "" : " is-locked"}`,
        type: "button",
        "aria-label": isOpen ? `${title} — ${symbol}` : `${title} — ${labels.locked ?? "locked, finish the previous lesson"}`,
        ...(isOpen ? {} : { disabled: "true", "aria-disabled": "true" }),
      },
      h("span", { class: "path-node-art" }, icon(visual, 54)),
      h(
        "span",
        { class: "path-node-info" },
        h("span", { class: "path-node-symbol" }, symbol),
        h("span", { class: "path-node-title" }, title),
      ),
      h("span", { class: "path-node-action", "aria-hidden": "true" }, icon(isDone ? "star" : isOpen ? "play" : "lock", 30)),
    );
    card.style.setProperty("--path-color", lang.color);
    if (isOpen) {
      card.addEventListener("click", () => go("lesson", { lessonId: lesson.id }));
    } else {
      // Locked: gentle voice reminder (non-reader) + shake, never a punishment.
      card.addEventListener("click", () => {
        card.classList.remove("shake");
        void card.offsetWidth;
        card.classList.add("shake");
        screenPrompt(services, lang, "path_hint");
      });
    }
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
  const conversation = tile("mic", {
    onClick: () => go("conversation"), size: 40,
    label: actions.conversation ?? "parler à Yekiva", caption: actions.conversation ?? "parler",
    className: "path-action path-conversation",
  });
  // Demo: no debug button ("son ?" diag screen hidden) — photo, voice status, replay, conversation only.
  const bar = h("div", { class: "path-actions" }, photo, server, replay, conversation);

  const screen = h(
    "div",
    { class: "screen path-screen" },
    change,
    header,
    h("div", { class: "path-list" }, nodes),
    bar,
  );
  // Voice tour of the path: after the hint, read the 2 most recent unlocked
  // lessons (titles) with a blink on each card — the learner hears where to go.
  let stopCycle = null;
  screen.destroy = () => { stopCycle?.(); services.speaker.stop(); };
  screen.prompt = () => screenPrompt(services, lang, "path_hint");
  queueMicrotask(async () => {
    await screen.prompt();
    if (!screen.isConnected) return;
    const openIdx = lessons.map((l, i) => (i === 0 || done[lessons[i - 1]?.id]) ? i : -1).filter((i) => i >= 0);
    const recent = openIdx.slice(-2);
    if (!recent.length) return;
    const items = recent.map((i) => ({
      el: nodes[i],
      say: () => services.speaker.say({ text: lessons[i].title ?? lessons[i].id }, lang.code, lessons[i].owner ?? lang.basePackId),
    }));
    stopCycle = startCycle(items, { pauseMs: 1200 });
  });
  return screen;
}
