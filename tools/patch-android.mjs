#!/usr/bin/env node
// After `npx cap add android`: declares the permissions + network config the app needs.
// Idempotent, zero dependencies.
//   - Permissions: INTERNET (voice server), RECORD_AUDIO + MODIFY_AUDIO_SETTINGS (microphone).
//   - Cleartext: the Yekiva voice server is often plain http:// on a LAN/VPS.
//     Android 9+ blocks cleartext by default -> the APK would go silent.
//     This patch sets android:usesCleartextTraffic="true" on <application>
//     AND writes a network-security-config that allows cleartext (LAN + voice server)
//     while keeping the rest of the policy strict.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const manifestPath = process.argv[2] ?? "app/android/app/src/main/AndroidManifest.xml";
let xml = readFileSync(manifestPath, "utf8");
let changed = false;

const wanted = ["android.permission.INTERNET", "android.permission.RECORD_AUDIO", "android.permission.MODIFY_AUDIO_SETTINGS"];
const missing = wanted.filter((p) => !xml.includes(`"${p}"`));
if (missing.length) {
  const lines = missing.map((p) => `    <uses-permission android:name="${p}" />`).join("\n");
  xml = xml.replace(/(\n\s*)<\/manifest>/, `\n${lines}$1</manifest>`);
  changed = true;
}

// 1) Allow cleartext at the application level (needed for http:// voice servers).
if (!/usesCleartextTraffic\s*=\s*"true"/.test(xml)) {
  if (/<application\b[^>]*usesCleartextTraffic\s*=\s*"false"/.test(xml)) {
    xml = xml.replace(/usesCleartextTraffic\s*=\s*"false"/, 'usesCleartextTraffic="true"');
  } else {
    xml = xml.replace(/<application\b/, '<application android:usesCleartextTraffic="true"');
  }
  changed = true;
}

// 2) Point the app at a network security config (res/xml/network_security_config.xml).
if (!/networkSecurityConfig/.test(xml)) {
  xml = xml.replace(
    /<application\b([^>]*)>/,
    '<application$1 android:networkSecurityConfig="@xml/network_security_config">',
  );
  changed = true;
}

if (changed) writeFileSync(manifestPath, xml);

// 3) Write the network security config itself.
const appDir = manifestPath.replace(/\/src\/main\/AndroidManifest\.xml$/, "");
const resDir = `${appDir}/src/main/res/xml`;
const nscPath = `${resDir}/network_security_config.xml`;
const nsc = `<?xml version="1.0" encoding="utf-8"?>
<!-- Yekiva: the voice/transcription server is often plain http:// (LAN or VPS).
     Allow cleartext to any host (the app only talks to the configured Yekiva
     server), keep the default strict policy otherwise. Managed by tools/patch-android.mjs. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;
try {
  if (!existsSync(resDir)) mkdirSync(resDir, { recursive: true });
  const prev = existsSync(nscPath) ? readFileSync(nscPath, "utf8") : "";
  if (prev !== nsc) writeFileSync(nscPath, nsc);
} catch (e) {
  console.error(`warning: could not write ${nscPath}: ${e?.message ?? e}`);
}

console.log(
  missing.length
    ? `permissions added: ${missing.join(", ")} (+ cleartext network config ensured)`
    : "permissions already present (+ cleartext network config ensured)",
);
console.log(`network security config: ${nscPath}`);
void dirname;
