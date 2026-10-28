// Settings. To try things in the browser without rebuilding, in the console:
//   localStorage.setItem("yekiva.serverUrl", "https://serveur.exemple")
// The token is NOT a secret (it is readable in the app): it limits abuse, it does not replace authentication.
const ls = (k) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};

export const config = {
  serverUrl: ls("yekiva.serverUrl"), // empty = no server: everything that needs the AI stays disabled
  appToken: ls("yekiva.appToken"),
};
