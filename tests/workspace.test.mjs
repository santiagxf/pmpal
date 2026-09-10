/**
 * End-to-end over the real action code path: create a workspace from the house
 * template, write each section, watch the rubric go from blocked to ready.
 *
 * This exercises exactly what the canvas actions call -- extension.mjs is a thin
 * adapter over lib/actions.mjs, so this covers the behaviour without needing the
 * Copilot runtime.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createWorkspace, openWorkspace, listWorkspaces, WORKSPACES_DIR, slugify } from "../.github/extensions/pmpal/lib/state.mjs";
import { viewModel, writeSection, exportSpec } from "../.github/extensions/pmpal/lib/actions.mjs";
import { parseSpec } from "../.github/extensions/pmpal/lib/template.mjs";

const TITLE = "PMPal test gateway rate limit inheritance";
const SLUG = slugify(TITLE);
const DIR = join(WORKSPACES_DIR, SLUG);

const cleanup = () => rmSync(DIR, { recursive: true, force: true });
test.before(cleanup);
test.after(cleanup);

test("creates a workspace seeded from the house template", () => {
  const ws = createWorkspace(TITLE, {
    pmOwner: "Facundo Santiago (fasantia)",
    milestone: "Public Preview",
    offerings: "AI Gateway SKU",
  });

  assert.equal(ws.slug, SLUG);
  assert.ok(existsSync(ws.specPath));
  assert.ok(listWorkspaces().includes(SLUG));

  const doc = parseSpec(ws.spec, { normalize: true });
  assert.equal(doc.title, TITLE);
  assert.equal(doc.meta["PM Owner"], "Facundo Santiago (fasantia)");
  assert.equal(doc.meta["Offerings"], "AI Gateway SKU");
});

/**
 * The template ships guidance comments and `<placeholder>` slots that have the
 * *shape* of real content -- an example need, a skeleton payload, a phasing row.
 * None of it may satisfy a rule, or a blank spec would look nearly finished.
 */
test("a blank template satisfies almost nothing", () => {
  const vm = viewModel(openWorkspace(SLUG));
  assert.equal(vm.rubric.ready, false);

  const failed = new Set(vm.rubric.blocking.map((r) => r.rule));
  for (const rule of [
    "sections-written",
    "no-placeholders",
    "goal-quantified",
    "needs-first-person",
    "market-landscape-sourced",
    "solution-has-contract",
    "write-rules-bolded",
    "ambiguity-table",
    "hero-scenario-outcome",
    "phasing-customer-value",
  ]) {
    assert.ok(failed.has(rule), `${rule} must not be satisfied by template placeholder text`);
  }

  // Only the two rules that are genuinely satisfiable by a blank doc may pass.
  assert.deepEqual(
    vm.rubric.results.filter((r) => r.pass).map((r) => r.rule).sort(),
    ["breaking-change-callout", "metadata-complete", "no-hedging"],
  );
});

test("a fresh spec's outline is the house outline", () => {
  const vm = viewModel(openWorkspace(SLUG));
  assert.deepEqual(
    vm.outline.map((s) => `${s.phase} > ${s.name}`),
    [
      "Understand > Goal",
      "Understand > Who We're Solving For",
      "Understand > Market Landscape",
      "Identify > Solution",
      "Identify > Hero Scenarios",
      "Execute > Phasing",
    ],
  );
});

test("writing a section preserves its subsections and flips its status", () => {
  const ws = openWorkspace(SLUG);
  const before = parseSpec(ws.spec, { normalize: true }).blocks.length;

  writeSection(ws, "Identify > Solution", "A gateway-level `rateLimit` is inherited by every workspace beneath it.");

  const after = parseSpec(ws.spec, { normalize: true });
  assert.equal(after.blocks.length, before, "writing a body must not drop the Write rules subsection");
  assert.ok(after.blocks.some((b) => /write rules/i.test(b.title)));

  const vm = viewModel(ws);
  const solution = vm.outline.find((s) => s.name === "Solution");
  assert.notEqual(solution.status, "empty");
});

test("write_section rejects an unknown section", () => {
  assert.throws(() => writeSection(openWorkspace(SLUG), "Understand > Nonexistent", "x"), /No such section/);
});

test("export refuses while blocking findings remain, and force overrides", () => {
  const ws = openWorkspace(SLUG);
  const target = join(DIR, "exported.md");

  const refused = exportSpec(ws, target);
  assert.equal(refused.exported, false);
  assert.match(refused.reason, /blocking findings/);
  assert.ok(!existsSync(target));

  const forced = exportSpec(ws, target, { force: true });
  assert.equal(forced.exported, true);
  assert.equal(readFileSync(target, "utf8"), ws.spec);
});

test("export warns when the spec carries internal-only notes", () => {
  const ws = openWorkspace(SLUG);
  ws.markInternal("note:1", "unreleased inheritance design for the March milestone");
  ws.save();

  const result = exportSpec(ws, join(DIR, "exported2.md"), { force: true });
  assert.match(result.warning, /internal-only note/);
});

test("citations require a url and an accessed date", () => {
  const ws = openWorkspace(SLUG);
  assert.throws(() => ws.addEvidence({ claim: "x", accessed: "2026-09-09" }), /url is required/);
  assert.throws(() => ws.addEvidence({ claim: "x", url: "https://example.com" }), /accessed date is required/);

  const e = ws.addEvidence({
    claim: "Kong scopes limits per route, not per workspace.",
    url: "https://docs.konghq.com/",
    accessed: "2026-09-09",
    confidence: "high",
  });
  assert.equal(e.id, "e1");
});

test("a fully written spec reaches ready", () => {
  const ws = openWorkspace(SLUG);

  writeSection(
    ws,
    "Understand > Goal",
    "Let a platform owner write one rate limit on the gateway and have it govern every workspace beneath it.\n\n" +
      "Today a limit attaches to one asset. A gateway of 40 workspaces is 40 writes, and the 41st is ungoverned until someone remembers.",
  );

  writeSection(
    ws,
    "Understand > Who We're Solving For",
    "**Platform Owner**\n\n" +
      "*Provisions and manages the platform.*\n\n" +
      "- I want one limit to cover the whole gateway, so a workspace created next month is governed the day it exists.\n" +
      "- I want that limit to be a floor no team can raise, rather than a default they can edit away.",
  );

  writeSection(
    ws,
    "Understand > Market Landscape",
    "Kong AI Gateway scopes rate limits per route, not per tenant container " +
      "(https://docs.konghq.com/hub/kong-inc/rate-limiting/, read 2026-09-09).",
  );

  writeSection(
    ws,
    "Identify > Solution",
    "A gateway carries a `policies[]` array. A `rateLimit` written there is inherited by every workspace beneath it.\n\n" +
      "```jsonc\n" +
      "// PUT .../service/{gw}?api-version=2099-01-01-preview\n" +
      '// If-Match: W/"0x8DC5F1A2B3C4D5E"\n' +
      '{ "properties": { "policies": [ { "type": "rateLimit", "scope": "workspace" } ] } }\n' +
      "```\n\n" +
      "| Declaration | Meaning |\n|---|---|\n| `scope: \"workspace\"` | One counter per workspace |\n" +
      "| `scope: \"resource\"` | One counter per resource |",
  );

  writeSection(
    ws,
    "Identify > Hero Scenarios",
    "#### Platform Owner\n\n##### Govern every workspace at once\n\n" +
      "1. The owner writes one workspace-scoped `rateLimit` on the gateway.\n" +
      "2. Every workspace now has its own counter, including one created next month.",
  );

  writeSection(
    ws,
    "Execute > Phasing",
    "| Phase | Features bundled | Milestone | Customer value at this phase |\n" +
      "|---|---|---|---|\n" +
      "| **Phase 1: Inheritance** | Gateway-level `rateLimit` with workspace scope. | Public Preview | " +
      "Customers govern every workspace from one write, including workspaces created later. |",
  );

  // The Write rules subsection from the template still holds a placeholder bullet.
  writeSection(ws, "Identify > Solution > Write rules", "- **A limit written on a gateway is a floor.** A workspace cannot raise it.");

  const vm = viewModel(ws);
  assert.deepEqual(
    vm.rubric.blocking.map((b) => b.rule),
    [],
    `still blocked:\n${vm.rubric.blocking.map((b) => `  ${b.rule}: ${b.message}`).join("\n")}`,
  );
  assert.equal(vm.rubric.ready, true);
  assert.ok(vm.outline.every((s) => s.status !== "empty"));
});
