import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { createFakeAi, createFakeDb, fakeContext } from "./fake-db.js";

async function withServer(run) {
  const server = createApp({ corsOrigins: ["https://katha.example"], db: createFakeDb(), ai: createFakeAi(), context: fakeContext }).listen(0);
  await once(server, "listening");

  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("health endpoint returns an OK status", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});

test("CORS exposes responses only to the configured origin", async () => {
  await withServer(async (baseUrl) => {
    const allowedResponse = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://katha.example" },
    });
    const blockedResponse = await fetch(`${baseUrl}/health`, {
      headers: { Origin: "https://untrusted.example" },
    });

    assert.equal(
      allowedResponse.headers.get("access-control-allow-origin"),
      "https://katha.example",
    );
    assert.equal(blockedResponse.headers.get("access-control-allow-origin"), null);
  });
});
