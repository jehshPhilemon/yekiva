#!/usr/bin/env node
// After `npx cap add android`: declares the permissions the app needs (microphone). Idempotent, zero dependencies.
import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] ?? "app/android/app/src/main/AndroidManifest.xml";
let xml = readFileSync(path, "utf8");
const wanted = ["android.permission.INTERNET", "android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"];
const missing = wanted.filter((p) => !xml.includes(`"${p}"`));
if (missing.length) {
  const lines = missing.map((p) => `    <uses-permission android:name="${p}" />`).join("\n");
  xml = xml.replace(/(\n\s*)<\/manifest>/, `\n${lines}$1</manifest>`);
  writeFileSync(path, xml);
}
console.log(missing.length ? `permissions added: ${missing.join(", ")}` : "permissions already present");
