import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const { app, config } = await buildApp();

  const defaultSecrets = [config.pageTokenSecret, config.hashSecret, config.cookieSecret].some(
    (secret) => secret.startsWith("dev-")
  );
  if (defaultSecrets) {
    app.log.warn("Development secrets are in use; set secrets in .env outside local development");
  }

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
