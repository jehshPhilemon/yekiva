#!/usr/bin/env node
// Generates a full lesson from ONE word with Muse Spark, inside OUR lesson format.
// Run OFFLINE with the project's Meta key — the app never calls this.
//
//   node tools/generate-lesson.mjs sw mangue              # -> pack sw, lesson mangue
//   node tools/generate-lesson.mjs sw mangue --dry        # show the lesson JSON, save nothing
//   node tools/generate-lesson.mjs sw mangue --direct     # call Meta directly (needs server/.env key)
//   node tools/generate-lesson.mjs sw mangue --track child --after i-l
//
// Flow: word -> Spark (word + syllables) -> OUR buildLesson (structure) ->
// saved as app/www/packs/<pack>/lessons/<word>.json -> wired into the pack track ->
// validated with tools/validate-packs.mjs (refused if invalid). The model proposes,
// OUR validator disposes: no invalid lesson can enter a pack.
// Zero dependencies.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const packsRoot = join(here, "..", "app", "www", "packs");

function loadEnv() {
  for (const rel of ["../server/.env", "../.env"]) {
    const file = fileURLToPath(new URL(rel, import.meta.url));
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || m[1] in process.env) continue;
      process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
}

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const [packId, word] = positional;
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? "");
};
const dry = args.includes("--dry");
const direct = args.includes("--direct");
const track = flag("--track") ?? "adult";
const after = flag("--after");

if (!packId || !word) {
  console.error("usage: generate-lesson.mjs <pack> <word> [--dry] [--direct] [--track adult|child] [--after lesson-id]");
  process.exit(1);
}
if (track !== "adult" && track !== "child") {
  console.error("track must be 'adult' or 'child'");
  process.exit(1);
}

function slug(w) {
  return w.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function generate(w, lang) {
  if (direct) {
    const { generateLesson } = await import("../server/src/providers/meta.js");
    return generateLesson(w, { lang });
  }
  const base = (process.env.YEKIVA_SERVER_URL ?? "http://127.0.0.1:8787").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/generate-lesson`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ word: w, lang }),
  });
  if (!res.ok) throw new Error(`server answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  loadEnv();
  const manifestPath = join(packsRoot, packId, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`pack '${packId}' not found`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const lang = manifest.language ?? packId;
  console.log(`generating lesson for "${word}" (${lang}, pack ${packId})...`);
  const lesson = await generate(word, lang);
  const id = slug(word) || `lesson-${Date.now()}`;
  lesson.id = id;
  if (dry) {
    console.log(JSON.stringify(lesson, null, 2));
    return;
  }
  const lessonPath = join(packsRoot, packId, "lessons", `${id}.json`);
  if (existsSync(lessonPath)) {
    console.error(`lesson '${id}' already exists in pack ${packId} (delete it to regenerate)`);
    process.exit(1);
  }
  writeFileSync(lessonPath, JSON.stringify(lesson, null, 2) + "\n");
  // Wire into the pack track.
  const list = manifest.tracks?.[track] ?? (manifest.tracks[track] = []);
  if (after && list.includes(after)) list.splice(list.indexOf(after) + 1, 0, id);
  else list.push(id);
  manifest.version = (manifest.version ?? 1) + 1;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  // Validate: refuse to keep an invalid lesson.
  try {
    execFileSync("node", [join(here, "validate-packs.mjs")], { stdio: "pipe" });
  } catch (e) {
    console.error("VALIDATION FAILED — lesson removed:");
    console.error(String(e.stdout ?? e.stderr ?? e.message).slice(0, 1000));
    const { unlinkSync } = await import("node:fs");
    unlinkSync(lessonPath);
    process.exit(1);
  }
  console.log(`saved lessons/${id}.json (${lesson.steps.length} steps) + wired into ${track} track.`);
  console.log(`tip: illustrate it with: node tools/illustrate-pack.mjs ${packId} --word ${slug(word)}`);
}

main().catch((e) => {
  console.error(`failed: ${e.message}`);
  process.exit(1);
});
