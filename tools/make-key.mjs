#!/usr/bin/env node
// Mint YKV app keys offline: node tools/make-key.mjs [count]
// Prints keys to stdout — store them privately, bake ONE per build:
//   node tools/build-config.mjs --api https://... --token YKV-....
// The formula lives obfuscated in server/src/apptoken.js; this tool only calls it.
import { mintAppKey, isYkvKey } from "../server/src/apptoken.js";

const n = Math.max(1, Math.min(100, Number(process.argv[2] ?? 1) || 1));
for (let i = 0; i < n; i++) {
  const k = mintAppKey();
  if (!isYkvKey(k)) {
    console.error("self-check failed");
    process.exit(1);
  }
  console.log(k);
}
