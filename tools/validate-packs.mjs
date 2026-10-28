#!/usr/bin/env node
// Validates the packs (app/www/packs) AND simulates their per-language merge.
// Zero dependencies: works anywhere Node 20+ is installed, and in CI.
// Usage: node tools/validate-packs.mjs [folder]   |   --show: print the merged paths
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeLanguage, groupByLanguage } from "../app/www/js/core/merge.js";

export const KNOWN_STEPS = new Set(["watch_write", "trace_letter", "listen_tap", "say_word"]);

function main() {
  const args = process.argv.slice(2);
  const show = args.includes("--show");
  const root = resolve(args.find((a) => !a.startsWith("--")) ?? "app/www/packs");
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  const readJson = (path) => {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      err(`${path}: unreadable JSON (${e.message})`);
      return null;
    }
  };

  const index = readJson(join(root, "index.json"));
  const packIds = index?.packs ?? [];
  if (!Array.isArray(packIds) || packIds.length === 0) err("index.json: 'packs' list is empty or missing");

  const packs = [];
  for (const id of packIds) {
    const dir = join(root, id);
    const manifest = readJson(join(dir, "manifest.json"));
    if (!manifest) continue;
    const at = (m) => `[${id}] ${m}`;
    if (manifest.schema !== 1) err(at(`schema=${manifest.schema}, attendu 1`));
    if (manifest.id !== id) err(at(`manifest.id='${manifest.id}' ≠ folder name`));
    for (const k of ["language", "version", "name", "tracks"]) {
      if (manifest[k] === undefined) err(at(`missing field '${k}'`));
    }
    const role = manifest.role ?? "base";
    if (!["base", "addon"].includes(role)) err(at(`role='${role}' (base | addon)`));
    for (const audience of ["adult", "child"]) {
      if (!Array.isArray(manifest.tracks?.[audience])) err(at(`tracks.${audience} missing`));
    }
    if (role === "base") {
      const pick = manifest.prompts?.language_pick;
      if (!pick || (!pick.text && !pick.audio)) {
        err(at("prompts.language_pick missing: each language must say 'for <language>, tap here' itself"));
      }
      for (const [name, pr] of Object.entries(manifest.prompts ?? {})) {
        if (pr.audio && !existsSync(join(dir, pr.audio))) err(at(`prompt '${name}': audio not found ${pr.audio}`));
      }
    }
    const glyphs = manifest.glyphs ? readJson(join(dir, manifest.glyphs)) ?? {} : {};
    for (const [key, strokes] of Object.entries(glyphs)) {
      const ok =
        Array.isArray(strokes) &&
        strokes.length > 0 &&
        strokes.every(
          (s) =>
            Array.isArray(s) &&
            s.length >= 2 &&
            s.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && v >= 0 && v <= 1))
        );
      if (!ok) err(at(`glyphe '${key}' : invalid strokes (≥2 points per stroke, coordinates between 0 and 1)`));
    }
    packs.push({ id, dir, manifest, glyphs });
  }

  const byLanguage = groupByLanguage(packs);

  for (const [lang, group] of byLanguage) {
    const merged = mergeLanguage(group);
    errors.push(...merged.errors);
    const byId = new Map(group.map((p) => [p.id, p]));

    for (const [lid, owner] of merged.lessonOwner) {
      const pack = byId.get(owner);
      const path = join(pack.dir, "lessons", `${lid}.json`);
      const L = (m) => `[${owner}] lesson '${lid}': ${m}`;
      if (!existsSync(path)) {
        err(L("listed in tracks but file is missing"));
        continue;
      }
      const lesson = readJson(path);
      if (!lesson) continue;
      if (lesson.id !== lid) err(L(`id='${lesson.id}' ≠ file name`));
      if (!Array.isArray(lesson.steps) || lesson.steps.length === 0) {
        err(L("no steps"));
        continue;
      }
      lesson.steps.forEach((step, i) => {
        const S = (m) => L(`step ${i + 1} (${step.type}): ${m}`);
        if (typeof step.type !== "string") return err(L(`step ${i + 1} has no 'type'`));
        if (!KNOWN_STEPS.has(step.type)) warn(S("type unknown to this validator (the app will skip it)"));
        const p = step.params ?? {};
        // glyphs are resolved against the whole merged language, not just the pack
        if ((step.type === "watch_write" || step.type === "trace_letter") && !merged.glyphs[p.glyph]) {
          err(S(`glyph '${p.glyph}' missing from language '${lang}'`));
        }
        if (step.type === "say_word" && !p.word) err(S("params.word missing"));
        if (step.type === "listen_tap") {
          const ids = (p.choices ?? []).map((c) => c.id);
          if (ids.length < 2) err(S("at least 2 choices"));
          if (!ids.includes(p.answer)) err(S(`answer='${p.answer}' is not in choices`));
        }
        for (const a of [p.say?.audio, ...(p.choices ?? []).map((c) => c.audio)].filter(Boolean)) {
          if (!existsSync(join(pack.dir, a))) err(S(`audio not found: ${a}`));
        }
      });
    }
    if (show) {
      console.log(`\n== ${lang} (${group.map((p) => p.id).join(" + ")}) ==`);
      for (const [aud, ids] of Object.entries(merged.tracks)) console.log(`  ${aud}: ${ids.join(" -> ") || "(vide)"}`);
    }
  }

  for (const w of warnings) console.warn(`warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    console.error(`\n${errors.length} error(s).`);
    process.exit(1);
  }
  console.log(`OK: ${packs.length} pack(s), ${byLanguage.size} language(s) (${warnings.length} warning(s)).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
