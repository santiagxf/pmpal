import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseSpec,
  serializeSpec,
  findSection,
  isEmptySection,
  parseTable,
  sectionText,
} from "../.github/extensions/pmpal/lib/template.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/house-style-sample.md", import.meta.url));
const raw = readFileSync(FIXTURE, "utf8");

test("round-trips the sample spec byte-identically when not normalizing", () => {
  const doc = parseSpec(raw);
  assert.equal(serializeSpec(doc), raw);
});

test("reads the header metadata", () => {
  const doc = parseSpec(raw);
  assert.equal(doc.title, "Site and fleet level quotas");
  assert.equal(doc.meta["PM Owner"], "Dana Whitfield (dwhitfield)");
  assert.equal(doc.meta["Target Milestone"], "Public Preview");
  assert.equal(doc.meta["Offerings"], "Meridian Edge Platform");
  assert.match(doc.meta["Scenario"], /^Attach a quota to a site or fleet/);
});

test("does not treat headings inside jsonc fences as structure", () => {
  const doc = parseSpec(raw);
  const titles = doc.blocks.map((b) => b.title);
  assert.ok(!titles.some((t) => t.includes("{")), "a payload line leaked into the heading tree");
});

test("finds the house sections", () => {
  const doc = parseSpec(raw, { normalize: true });
  for (const path of [
    ["Understand", "Goal"],
    ["Understand", "Who We're Solving For"],
    ["Understand", "Market Landscape"],
    ["Identify", "Solution"],
    ["Identify", "Hero Scenarios"],
    ["Execute", "Phasing"],
  ]) {
    assert.ok(findSection(doc, path), `missing section: ${path.join(" > ")}`);
  }
});

test("normalization promotes the misplaced Execute heading", () => {
  const rawDoc = parseSpec(raw);
  assert.equal(findSection(rawDoc, ["Execute"]), null, "Execute should start nested under Identify");

  const doc = parseSpec(raw, { normalize: true });
  assert.ok(doc.normalizations.length >= 1);
  const execute = findSection(doc, ["Execute"]);
  assert.ok(execute, "Execute should be promoted to a top-level phase");
  assert.equal(execute.level, 2);
  assert.equal(findSection(doc, ["Execute", "Phasing"]).level, 3);
});

test("Market Landscape is the one empty section in the fixture", () => {
  const doc = parseSpec(raw, { normalize: true });
  const empty = doc.blocks.filter((b) => isEmptySection(b)).map((b) => b.title);
  assert.deepEqual(empty, ["Market Landscape"]);
});

test("parses the phasing table", () => {
  const doc = parseSpec(raw, { normalize: true });
  const table = parseTable(sectionText(findSection(doc, ["Execute", "Phasing"])));
  assert.ok(table);
  assert.equal(table.rows.length, 3);
  assert.ok(table.headers.some((h) => /customer value/i.test(h)));
});
