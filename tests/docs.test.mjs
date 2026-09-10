/**
 * docs/HOUSE-STYLE.md is the prose behind every rubric message. If it drifts,
 * a finding in the panel points at a paragraph that no longer describes it --
 * which is worse than having no doc at all. So the doc is checked like code.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { runRubric } from "../.github/extensions/pmpal/lib/rubric.mjs";
import { parseSpec } from "../.github/extensions/pmpal/lib/template.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = readFileSync(join(HERE, "..", "docs", "HOUSE-STYLE.md"), "utf8");
const FIXTURE = readFileSync(join(HERE, "fixtures", "house-style-sample.md"), "utf8");

const results = runRubric(parseSpec(FIXTURE, { normalize: true }), FIXTURE, {}).results;

test("every rubric rule is documented", () => {
  for (const { rule } of results) {
    assert.ok(DOC.includes(`\`${rule}\``), `HOUSE-STYLE.md never mentions the rule '${rule}'`);
  }
});

test("the doc invents no rule that the rubric does not implement", () => {
  const implemented = new Set(results.map((r) => r.rule));
  // Only ids written in the enforcement form `id` (blocking|advisory) are claims
  // about the rubric; bare backticks elsewhere are filenames and JSON keys.
  for (const [, id] of DOC.matchAll(/`([a-z][a-z-]+)` \((?:blocking|advisory)\)/g)) {
    assert.ok(implemented.has(id), `HOUSE-STYLE.md documents '${id}', which no rule implements`);
  }
});

test("documented severities match the rubric", () => {
  const severity = new Map(results.map((r) => [r.rule, r.severity]));
  for (const [, id, claimed] of DOC.matchAll(/`([a-z][a-z-]+)` \((blocking|advisory)\)/g)) {
    assert.equal(severity.get(id), claimed, `'${id}' is documented as ${claimed} but the rubric reports ${severity.get(id)}`);
  }
});

/**
 * The doc's whole argument is that these rules describe a real house style rather
 * than a generic PRD notion. Quoting the fixture is what makes that checkable --
 * so the quotes have to still be in it.
 */
test("illustrations are quoted verbatim from the golden fixture", () => {
  // Compare words, not formatting: the doc wraps quotes across lines, prefixes
  // them with `>`, and bolds the clause it is drawing attention to.
  const words = (s) =>
    s
      .replace(/^\s*>\s?/gm, "")
      .replace(/\*\*|\*/g, "")
      .replace(/\s+/g, " ");

  const doc = words(DOC);
  const fixture = words(FIXTURE);
  const quotes = [
    "A site of forty nodes is forty writes",
    "forty nodes at 50 TB each is 2 PB of egress written as a 50 TB quota",
    "I want an ambiguous quota rejected on write",
    "api-version=2099-01-01-preview",
    "A missing dimension value fails closed",
    "The set is unordered and normalized on write.",
    "A quota may target its attachment level or a descendant level, never an ancestor.",
    "the write fails rather than guessing",
    "so the developer sizes a workload against the pool",
  ];

  for (const q of quotes) {
    assert.ok(doc.includes(words(q)), `HOUSE-STYLE.md no longer contains the illustration: ${q}`);
    assert.ok(fixture.includes(words(q)), `illustration is not actually in the fixture: ${q}`);
  }
});
