/**
 * Calibration suite.
 *
 * The fixture is a redacted stand-in for a real, shipped-quality spec: same
 * structure and voice, fictional product. The rubric is correct
 * only if it flags exactly one blocking failure against it -- the empty
 * `### Market Landscape`.
 *
 *   More failures  -> the rubric is over-fitted / too strict; it is wrong, not the spec.
 *   Fewer failures -> the rubric is not actually checking anything.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseSpec } from "../.github/extensions/pmpal/lib/template.mjs";
import { runRubric } from "../.github/extensions/pmpal/lib/rubric.mjs";

const raw = readFileSync(fileURLToPath(new URL("./fixtures/house-style-sample.md", import.meta.url)), "utf8");
const doc = parseSpec(raw, { normalize: true });
const report = runRubric(doc, raw);

test("flags exactly one blocking failure: the empty Market Landscape", () => {
  assert.deepEqual(
    report.blocking.map((r) => r.rule),
    ["market-landscape-sourced"],
    `unexpected blocking failures:\n${report.blocking.map((r) => `  ${r.rule}: ${r.message}`).join("\n")}`,
  );
  assert.equal(report.ready, false);
});

test("raises no advisory noise on a well-written spec", () => {
  assert.deepEqual(
    report.advisory.map((r) => r.rule),
    [],
    `unexpected advisories:\n${report.advisory.map((r) => `  ${r.rule}: ${r.message}`).join("\n")}`,
  );
});

test("every other rule passes", () => {
  for (const r of report.results) {
    if (r.rule === "market-landscape-sourced") continue;
    assert.ok(r.pass, `${r.rule} should pass on the fixture: ${r.message}`);
  }
  assert.equal(report.score.passed, report.score.total - 1);
});

// --- Each rule must be able to fail, or it is checking nothing. -------------

const rerun = (mutate) => {
  const text = mutate(raw);
  return runRubric(parseSpec(text, { normalize: true }), text);
};
const ruleOf = (rep, rule) => rep.results.find((r) => r.rule === rule);

test("goal-quantified fails when the Goal has no numbers", () => {
  const rep = rerun((t) =>
    t.replace(
      /Today a quota attaches to a single node\.[\s\S]*?written as a 50 TB quota\./,
      "Today a quota attaches to a single node, which is inconvenient for large sites.",
    ),
  );
  assert.equal(ruleOf(rep, "goal-quantified").pass, false);
});

test("needs-first-person fails on a third-person need", () => {
  const rep = rerun((t) =>
    t.replace(
      "- I want one quota to cover every node in my site, including the ones I add next week.",
      "- The engineer covers every node in the site.",
    ),
  );
  assert.equal(ruleOf(rep, "needs-first-person").pass, false);
});

test("needs-first-person fails when a need states no reason", () => {
  const rep = rerun((t) =>
    t.replace(
      "- I want one quota to cover every node in my site, including the ones I add next week.",
      "- I want one quota to cover every node in my site.",
    ),
  );
  assert.equal(ruleOf(rep, "needs-first-person").pass, false);
});

test("solution-has-contract fails without a real payload", () => {
  const rep = rerun((t) => t.replaceAll("api-version=2099-01-01-preview", "the-api-version"));
  assert.equal(ruleOf(rep, "solution-has-contract").pass, false);
});

test("write-rules-bolded fails on an unbolded rule", () => {
  const rep = rerun((t) =>
    t.replace(
      "- **A missing dimension value fails closed**",
      "- A missing dimension value fails closed",
    ),
  );
  assert.equal(ruleOf(rep, "write-rules-bolded").pass, false);
});

test("breaking-change-callout fails when the change is not blockquoted", () => {
  const rep = rerun((t) =>
    t.replace(
      "> **Breaking change**: The scalar form is invalid",
      "This is a breaking change. The scalar form is invalid",
    ),
  );
  assert.equal(ruleOf(rep, "breaking-change-callout").pass, false);
});

test("phasing-customer-value fails on a phase that delivers nothing", () => {
  const rep = rerun((t) =>
    t.replace(
      "| Fast follow | Customers can declare shared fleet or site quotas and independent per-site or per-node quotas using one quota shape. |",
      "| Fast follow |  |",
    ),
  );
  assert.equal(ruleOf(rep, "phasing-customer-value").pass, false);
});

test("no-hedging fires on a hedge but not on permissive 'may'", () => {
  assert.equal(ruleOf(report, "no-hedging").pass, true, "permissive 'may' must not be flagged");
  const rep = rerun((t) => t.replace("Both gates apply.", "Both gates will probably apply. TBD."));
  assert.equal(ruleOf(rep, "no-hedging").pass, false);
});

test("market-landscape-sourced passes once the section is written and cited", () => {
  const rep = rerun((t) =>
    t.replace(
      "### Market Landscape\n",
      "### Market Landscape\n\nKong AI Gateway scopes limits per route, not per workspace " +
        "(https://docs.konghq.com/, read 2026-09-08).\n",
    ),
  );
  assert.equal(ruleOf(rep, "market-landscape-sourced").pass, true);
  assert.equal(rep.ready, true);
});

test("market-landscape-sourced still fails when written but uncited", () => {
  const rep = rerun((t) =>
    t.replace("### Market Landscape\n", "### Market Landscape\n\nNobody else scopes quotas to a site.\n"),
  );
  assert.equal(ruleOf(rep, "market-landscape-sourced").pass, false);
  assert.match(ruleOf(rep, "market-landscape-sourced").message, /citation/i);
});
