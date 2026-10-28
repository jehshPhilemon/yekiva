import { makeApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
makeApp({ appToken: process.env.APP_TOKEN ?? "" }).listen(port, () => {
  console.log(`yekiva-server listening on :${port}`);
});
