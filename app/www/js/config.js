// Build-time settings. The learner NEVER types a server URL: it is baked in here.
//   - Dev (browser/Termux): npm run dev writes the local server URL (see tools/serve.mjs --api).
//   - Prod (APK): the hackathon server URL, replaced at build time (see tools/build-config.mjs).
//   - Fallback: same-origin (when the app and the server share one host).
// The APP_TOKEN is NOT a secret (readable in the app): it limits abuse, not authentication.
export const config = {
  serverUrl: "__YEKIVA_SERVER_URL__",
  appToken: "__YEKIVA_APP_TOKEN__",
};
