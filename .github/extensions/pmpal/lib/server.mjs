/**
 * The loopback HTTP surface the canvas iframe renders from.
 *
 * The canvas `open()` handler returns this server's URL; the panel subscribes to
 * `/events` for live state and POSTs to `/ui/ask` to hand work back to the agent.
 *
 * Kept free of the SDK so the plumbing can be tested without the Copilot runtime.
 */

import http from "node:http";

import { renderSpecHtml } from "./ui/spec.mjs";

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * @param {object} opts
 * @param {() => object} opts.getState  current view model
 * @param {(intent: string) => boolean} opts.onAsk  dispatch a panel button; true if handled
 * @returns {Promise<{port: number, broadcast: () => void, close: () => Promise<void>, clientCount: () => number}>}
 */
export async function startServer({ getState, onAsk }) {
  const clients = new Set();

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderSpecHtml());
      return;
    }

    if (req.method === "GET" && req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: state\ndata: ${JSON.stringify(getState())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (req.method === "POST" && req.url === "/ui/ask") {
      const { intent } = await readBody(req);
      const handled = Boolean(onAsk(intent));
      res.writeHead(handled ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: handled }));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  const port = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

  return {
    port,
    clientCount: () => clients.size,
    broadcast() {
      const payload = `event: state\ndata: ${JSON.stringify(getState())}\n\n`;
      for (const res of clients) res.write(payload);
    },
    close() {
      for (const res of clients) res.end();
      clients.clear();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
