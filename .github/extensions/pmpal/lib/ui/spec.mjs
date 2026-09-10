/**
 * The Spec canvas surface.
 *
 * Rendered in the Copilot app's right side panel, so it is built narrow. State
 * arrives over SSE (`/events`); user actions POST to `/ui/*`, which asks the
 * agent to do the work via `session.send`.
 */

export function renderSpecHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PMPal &middot; Spec</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #1f2328;
    --muted: #59636e;
    --line: #d1d9e0;
    --sunken: #f6f8fa;
    --accent: #0969da;
    --pass: #1a7f37;
    --block: #cf222e;
    --warn: #9a6700;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d;
      --sunken: #151b23; --accent: #4493f8; --pass: #3fb950; --block: #f85149; --warn: #d29922;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  header {
    position: sticky; top: 0; background: var(--bg); z-index: 2;
    padding: 12px 14px 10px; border-bottom: 1px solid var(--line);
  }
  h1 { font-size: 14px; margin: 0 0 2px; font-weight: 600; }
  .slug { font-size: 11px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, monospace; }
  main { padding: 12px 14px 32px; }
  section { margin-bottom: 20px; }
  h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); margin: 0 0 8px; font-weight: 600;
  }

  .readiness {
    display: flex; align-items: center; gap: 8px; margin-top: 8px;
    padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--sunken);
  }
  .readiness.ready { border-color: var(--pass); }
  .readiness.blocked { border-color: var(--block); }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--muted); }
  .ready .dot { background: var(--pass); }
  .blocked .dot { background: var(--block); }
  .readiness b { font-weight: 600; }
  .score { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }

  ul { list-style: none; margin: 0; padding: 0; }
  li.outline {
    display: flex; align-items: baseline; gap: 8px;
    padding: 5px 0; border-bottom: 1px solid var(--line);
  }
  li.outline .name { flex: 1; }
  li.outline .phase { color: var(--muted); }
  .chip {
    font-size: 10px; padding: 1px 6px; border-radius: 10px;
    border: 1px solid var(--line); color: var(--muted); white-space: nowrap;
  }
  .chip.ready { color: var(--pass); border-color: var(--pass); }
  .chip.draft { color: var(--accent); border-color: var(--accent); }
  .chip.unsourced { color: var(--warn); border-color: var(--warn); }
  .chip.empty { color: var(--block); border-color: var(--block); }

  li.rule { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); }
  li.rule .mark { flex: none; width: 12px; font-weight: 700; }
  li.rule.pass .mark { color: var(--pass); }
  li.rule.blocking .mark { color: var(--block); }
  li.rule.advisory .mark { color: var(--warn); }
  li.rule .body { flex: 1; }
  li.rule .rulename {
    font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; color: var(--muted);
  }
  li.rule .msg { margin-top: 1px; }
  li.rule.pass { opacity: .55; }

  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  button {
    font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 6px;
    border: 1px solid var(--line); background: var(--sunken); color: var(--fg); cursor: pointer;
  }
  button:hover { border-color: var(--accent); color: var(--accent); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.primary:hover { opacity: .9; color: #fff; }

  .empty-state { color: var(--muted); padding: 24px 0; text-align: center; }
  .q { padding: 6px 0; border-bottom: 1px solid var(--line); }
  .q .tag { font-size: 10px; color: var(--block); text-transform: uppercase; letter-spacing: .04em; }
  .cite { padding: 6px 0; border-bottom: 1px solid var(--line); }
  .cite a { color: var(--accent); text-decoration: none; word-break: break-all; }
  .cite .meta { font-size: 11px; color: var(--muted); }
</style>
</head>
<body>
<header>
  <h1 id="title">No spec open</h1>
  <div class="slug" id="slug">&mdash;</div>
  <div class="readiness" id="readiness"><span class="dot"></span><b id="readyText">Waiting for a spec</b><span class="score" id="score"></span></div>
</header>

<main>
  <section>
    <h2>Outline</h2>
    <ul id="outline"><li class="empty-state">Ask the agent to start a spec.</li></ul>
  </section>

  <section>
    <h2>Rubric</h2>
    <ul id="rubric"></ul>
  </section>

  <section id="questionsBox" hidden>
    <h2>Open questions</h2>
    <div id="questions"></div>
  </section>

  <section id="evidenceBox" hidden>
    <h2>Evidence</h2>
    <div id="evidence"></div>
  </section>

  <section>
    <h2>Ask the agent</h2>
    <div class="actions">
      <button class="primary" data-ask="draft-market-landscape">Draft Market Landscape</button>
      <button data-ask="sharpen-goal">Sharpen the Goal</button>
      <button data-ask="fix-blocking">Fix blocking findings</button>
      <button data-ask="critique">Critique this spec</button>
    </div>
  </section>
</main>

<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function render(state) {
  $("title").textContent = state.title || "No spec open";
  $("slug").textContent = state.slug ? "workspaces/" + state.slug + "/spec.md" : "\\u2014";

  const r = state.rubric;
  const box = $("readiness");
  if (!r) {
    box.className = "readiness";
    $("readyText").textContent = "Waiting for a spec";
    $("score").textContent = "";
  } else {
    box.className = "readiness " + (r.ready ? "ready" : "blocked");
    $("readyText").textContent = r.ready
      ? "Ready to review"
      : r.blocking.length + " blocking finding" + (r.blocking.length === 1 ? "" : "s");
    $("score").textContent = r.score.passed + "/" + r.score.total;
  }

  const outline = $("outline");
  if (!state.outline || !state.outline.length) {
    outline.innerHTML = '<li class="empty-state">Ask the agent to start a spec.</li>';
  } else {
    outline.innerHTML = state.outline.map((s) =>
      '<li class="outline"><span class="phase">' + esc(s.phase) + '</span>' +
      '<span class="name">' + esc(s.name) + '</span>' +
      '<span class="chip ' + esc(s.status) + '">' + esc(s.status) + '</span></li>'
    ).join("");
  }

  $("rubric").innerHTML = !r ? "" : r.results.map((x) => {
    const cls = x.pass ? "pass" : x.severity;
    const mark = x.pass ? "\\u2713" : (x.severity === "blocking" ? "\\u2717" : "!");
    return '<li class="rule ' + cls + '"><span class="mark">' + mark + '</span>' +
      '<span class="body"><span class="rulename">' + esc(x.rule) + '</span>' +
      '<div class="msg">' + esc(x.message) + '</div></span></li>';
  }).join("");

  const qs = state.openQuestions || [];
  $("questionsBox").hidden = qs.length === 0;
  $("questions").innerHTML = qs.map((q) =>
    '<div class="q">' + (q.blocking ? '<span class="tag">blocking</span> ' : "") + esc(q.text) + '</div>'
  ).join("");

  const ev = state.evidence || [];
  $("evidenceBox").hidden = ev.length === 0;
  $("evidence").innerHTML = ev.map((e) =>
    '<div class="cite">' + esc(e.claim) +
    '<div class="meta"><a href="' + esc(e.url) + '" target="_blank" rel="noreferrer">' + esc(e.url) + '</a>' +
    ' &middot; read ' + esc(e.accessed) + ' &middot; ' + esc(e.confidence) + '</div></div>'
  ).join("");
}

document.querySelectorAll("[data-ask]").forEach((b) => {
  b.addEventListener("click", () => {
    b.disabled = true;
    fetch("/ui/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: b.dataset.ask }),
    }).finally(() => { b.disabled = false; });
  });
});

const es = new EventSource("/events");
es.addEventListener("state", (e) => render(JSON.parse(e.data)));
</script>
</body>
</html>`;
}
