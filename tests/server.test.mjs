/**
 * The panel plumbing, exercised over real HTTP.
 *
 * extension.mjs can't be imported here -- it imports @github/copilot-sdk and
 * calls joinSession() at module load. lib/server.mjs is the whole HTTP surface
 * it uses, so booting that is as close to the real thing as we get outside the
 * Copilot runtime.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { startServer } from "../.github/extensions/pmpal/lib/server.mjs";

/** Boot a server, run `fn(ctx)`, always shut down. */
async function withServer(handlers, fn) {
  const server = await startServer(handlers);
  try {
    return await fn(server, `http://127.0.0.1:${server.port}`);
  } finally {
    await server.close();
  }
}

/** Read SSE frames off a live response until `count` have arrived. */
async function readEvents(res, count) {
  const events = [];
  let buf = "";
  for await (const chunk of res.body) {
    buf += Buffer.from(chunk).toString("utf8");
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = /^data: (.*)$/m.exec(frame);
      if (data) events.push(JSON.parse(data[1]));
      if (events.length >= count) return events;
    }
  }
  return events;
}

test("GET / serves the panel document", async () => {
  await withServer({ getState: () => ({}), onAsk: () => true }, async (_s, base) => {
    const res = await fetch(base);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);

    const html = await res.text();
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /EventSource\(/, "panel must subscribe to the SSE stream");
    for (const intent of ["draft-market-landscape", "sharpen-goal", "fix-blocking", "critique"]) {
      assert.ok(html.includes(intent), `panel is missing the ${intent} button`);
    }
  });
});

test("/events pushes current state immediately, then again on broadcast", async () => {
  let tick = 0;
  await withServer({ getState: () => ({ tick: ++tick }), onAsk: () => true }, async (server, base) => {
    const res = await fetch(`${base}/events`);
    assert.match(res.headers.get("content-type"), /text\/event-stream/);

    const first = readEvents(res, 2);
    // Wait for the subscription to land before broadcasting, or the client set
    // is still empty and the second frame never arrives.
    while (server.clientCount() === 0) await new Promise((r) => setTimeout(r, 5));
    server.broadcast();

    assert.deepEqual(await first, [{ tick: 1 }, { tick: 2 }]);
  });
});

test("a disconnected subscriber is dropped", async () => {
  await withServer({ getState: () => ({}), onAsk: () => true }, async (server, base) => {
    const controller = new AbortController();
    const res = await fetch(`${base}/events`, { signal: controller.signal });
    while (server.clientCount() === 0) await new Promise((r) => setTimeout(r, 5));

    controller.abort();
    await res.body.cancel().catch(() => {});

    const deadline = Date.now() + 2000;
    while (server.clientCount() > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(server.clientCount(), 0, "closed connections must not accumulate");
  });
});

test("/ui/ask dispatches a known intent and rejects an unknown one", async () => {
  const seen = [];
  const handlers = {
    getState: () => ({}),
    onAsk: (intent) => {
      if (intent !== "critique") return false;
      seen.push(intent);
      return true;
    },
  };

  await withServer(handlers, async (_s, base) => {
    const post = (body) =>
      fetch(`${base}/ui/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

    const ok = await post(JSON.stringify({ intent: "critique" }));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true });

    const bad = await post(JSON.stringify({ intent: "rm -rf" }));
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { ok: false });

    // A malformed body must not take the process down.
    const junk = await post("{not json");
    assert.equal(junk.status, 400);

    assert.deepEqual(seen, ["critique"], "only the known intent may reach the handler");
  });
});

test("unknown routes 404", async () => {
  await withServer({ getState: () => ({}), onAsk: () => true }, async (_s, base) => {
    assert.equal((await fetch(`${base}/../etc/passwd`)).status, 404);
    assert.equal((await fetch(`${base}/events`, { method: "POST" })).status, 404);
  });
});
