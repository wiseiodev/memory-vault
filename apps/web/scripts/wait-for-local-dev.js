const endpoint = 'http://localhost:3000/api/inngest';
const timeoutMs = 60_000;
const intervalMs = 1_000;

async function waitForEndpoint() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
      });

      if (response.ok || response.status === 405) {
        process.stdout.write(`Inngest endpoint ready at ${endpoint}\n`);
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  process.stderr.write(
    `Timed out waiting for local app endpoint: ${endpoint}\n`,
  );
  process.exit(1);
}

void waitForEndpoint();
