#!/usr/bin/env node
// Illustrates every word of a pack with Muse Image (one fixed cartoon style).
// Run OFFLINE, once per pack, with the project's Meta key — the app never calls this.
//
//   node tools/illustrate-pack.mjs sw                    # illustrate all words of pack sw
//   node tools/illustrate-pack.mjs sw --dry              # list words + cost, generate nothing
//   node tools/illustrate-pack.mjs sw --word mama        # illustrate one word only
//   node tools/illustrate-pack.mjs sw --hint mama,mother # disambiguate a word ("mama (mother)")
//
// What it does per word: POST {yekiva}/v1/illustrate (or Meta directly with --direct)
// -> saves app/www/packs/<pack>/images/<word>.png -> writes the `image` field into the
// lesson steps that use the word (say_word.image, listen_tap choices image).
// Cost: $0.01/image. Existing images are skipped (delete one to regenerate it).
// Zero dependencies.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "www", "packs");

function loadEnv() {
  for (const rel of ["../server/.env", "../.env"]) {
    const file = fileURLToPath(new URL(rel, import.meta.url));
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || m[1] in process.env) continue;
      process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
    return file;
  }
  return null;
}

const args = process.argv.slice(2);
const packId = args.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? "");
};
const dry = args.includes("--dry");
const direct = args.includes("--direct");
const onlyWord = flag("--word");
const hints = Object.fromEntries((flag("--hint") ?? "").split(",").filter(Boolean).map((h) => {
  const i = h.indexOf("=");
  return i === -1 ? [h, ""] : [h.slice(0, i), h.slice(i + 1)];
}));

if (!packId) {
  console.error("usage: illustrate-pack.mjs <pack> [--dry] [--word w] [--hint w=hint,...] [--direct]");
  process.exit(1);
}
const packDir = join(root, packId);
const lessonsDir = join(packDir, "lessons");
const imagesDir = join(packDir, "images");
if (!existsSync(lessonsDir)) {
  console.error(`pack '${packId}' not found (${lessonsDir})`);
  process.exit(1);
}

function wordsInLessons() {
  // Collects illustratable words: say_word.word with 3+ letters ONLY.
  // Rationale: a picture must show a real thing (mama, avion, mangue). Bare syllables
  // ("ma", "li") and single letters have nothing to draw — illustrating them would
  // confuse the learner (what picture could "li" possibly show?).
  const words = new Map(); // word -> [{ file, stepIndex, kind, choiceId? }]
  for (const f of readdirSync(lessonsDir).filter((f) => f.endsWith(".json"))) {
    const lesson = JSON.parse(readFileSync(join(lessonsDir, f), "utf8"));
    (lesson.steps ?? []).forEach((step, si) => {
      const p = step.params ?? {};
      if (step.type === "say_word" && typeof p.word === "string" && p.word.trim().length >= 3) {
        const w = p.word.trim().toLowerCase();
        if (!words.has(w)) words.set(w, []);
        words.get(w).push({ file: f, stepIndex: si, kind: "say_word" });
      }
    });
  }
  return words;
}

async function illustrate(word, hint) {
  if (direct) {
    const { illustrate: directIllustrate } = await import("../server/src/providers/meta.js");
    return directIllustrate(word, { hint });
  }
  const base = (process.env.YEKIVA_SERVER_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/illustrate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ word, hint }),
  });
  if (!res.ok) throw new Error(`server answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type") };
}

function fileName(word) {
  return `${word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "word"}.png`;
}

async function main() {
  loadEnv();
  const words = wordsInLessons();
  const list = [...words.keys()].filter((w) => !onlyWord || w === onlyWord.toLowerCase());
  if (list.length === 0) {
    console.log("no illustratable words in this pack (say_word steps with 3+ letters only).");
    return;
  }
  mkdirSync(imagesDir, { recursive: true });
  const todo = list.filter((w) => !existsSync(join(imagesDir, fileName(w))));
  const skipped = list.length - todo.length;
  console.log(`pack ${packId}: ${list.length} word(s), ${todo.length} to generate (${skipped} already illustrated) — cost $${(todo.length * 0.01).toFixed(2)}`);
  if (dry) {
    for (const w of todo) console.log(`  would illustrate: ${w}${hints[w] ? ` (${hints[w]})` : ""}`);
    return;
  }
  if (!direct && !process.env.YEKIVA_SERVER_URL && !existsSync("../server/.env") && !process.env.META_API_KEY) {
    // The Yekiva server holds the key; without it, --direct calls Meta with the local key.
    console.log("(tip: start the Yekiva server, or use --direct with META_API_KEY in server/.env)");
  }
  let done = 0;
  for (const w of todo) {
    process.stdout.write(`  ${w}... `);
    try {
      const { bytes } = await illustrate(w, hints[w]);
      const name = fileName(w);
      writeFileSync(join(imagesDir, name), bytes);
      // Wire the image into every step that uses the word.
      const touched = new Set();
      for (const ref of words.get(w)) {
        const path = join(lessonsDir, ref.file);
        if (!touched.has(path)) touched.add(path);
        const lesson = JSON.parse(readFileSync(path, "utf8"));
        const step = lesson.steps[ref.stepIndex];
        const rel = `images/${name}`;
        if (ref.kind === "say_word") step.params.image = rel;
        if (ref.kind === "answer") step.params.image = rel;
        if (ref.kind === "choice") {
          const c = (step.params.choices ?? []).find((c) => c.id === ref.choiceId);
          if (c) c.image = rel;
        }
        writeFileSync(path, JSON.stringify(lesson, null, 2) + "\n");
      }
      done++;
      console.log(`ok (${(bytes.length / 1024).toFixed(1)} KB)`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
  console.log(`done: ${done}/${todo.length} illustrated. Run node tools/validate-packs.mjs to check.`);
}

main().catch((e) => {
  console.error(`failed: ${e.message}`);
  process.exit(1);
});
