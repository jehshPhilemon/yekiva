// Resolve the hosted MMS API key without requiring it in the project server/.env.
// Priority: explicit YEKIVA_MMS_KEY, common process-env names, then the existing
// system secret file (default /etc/tts-api.env). Never logs or returns key material
// anywhere except to the server's internal authenticated MMS request.
import { existsSync, readFileSync } from "node:fs";

const ENV_NAMES = [
  "YEKIVA_MMS_KEY",
  "MMS_API_KEY",
  "TTS_API_KEY",
  "API_KEY",
  "X_API_KEY",
];

function parseEnv(text) {
  const out = new Map();
  for (const raw of String(text).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    const value = m[2].replace(/^("|')(.*)\1$/, "$2").trim();
    if (value) out.set(m[1].toUpperCase(), value);
  }
  return out;
}

/** Return secret value in process; key is never logged or placed in client config. */
export function resolveMmsApiKey({ env = process.env, filePath } = {}) {
  for (const name of ENV_NAMES) {
    const value = String(env[name] ?? "").trim();
    if (value) return value;
  }

  const path = filePath ?? env.YEKIVA_MMS_KEY_FILE ?? "/etc/tts-api.env";
  try {
    if (!existsSync(path)) return "";
    const entries = parseEnv(readFileSync(path, "utf8"));
    for (const name of ENV_NAMES) {
      const value = entries.get(name);
      if (value) return value;
    }
    // Accept a single unambiguous key-like entry used by an existing TTS install.
    const candidates = [...entries.entries()]
      .filter(([name]) => /(?:MMS|TTS|API).*KEY|KEY.*(?:MMS|TTS|API)/.test(name))
      .map(([, value]) => value);
    return candidates.length === 1 ? candidates[0] : "";
  } catch {
    return "";
  }
}
