import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResearchPrompt,
  safeResearchPrompt,
  assertNoLeak,
  ConfidentialityError,
  KNOWN_VENDORS,
  CAPABILITY_VOCAB,
} from "../.github/extensions/pmpal/lib/confidential.mjs";

test("builds a research prompt from the public vocabulary", () => {
  const { vendor, prompt } = buildResearchPrompt({
    vendor: "kong ai gateway",
    capabilities: ["policy inheritance", "cost limits and budgets"],
  });
  assert.equal(vendor, "Kong AI Gateway");
  assert.match(prompt, /- policy inheritance/);
  assert.match(prompt, /add_citation/);
  assert.match(prompt, /accessed\s+- \d{4}-\d{2}-\d{2}/);
});

test("refuses a vendor that is not on the public list", () => {
  assert.throws(
    () => buildResearchPrompt({ vendor: "Contoso Secret Gateway" }),
    ConfidentialityError,
  );
});

test("refuses a capability term outside the public vocabulary", () => {
  assert.throws(
    () =>
      buildResearchPrompt({
        vendor: "Portkey",
        capabilities: ["partitionBy dimension sets on unreleased tenant quotas"],
      }),
    ConfidentialityError,
  );
});

test("no unreleased detail can reach the wire, because nothing is passed through", () => {
  const internal = [
    "partitionBy changes from a scalar to an array of dimensions in the 2099-01-01-preview contract",
    "Phase 3 node-type discrimination is a decision gate, not committed",
  ];
  for (const vendor of KNOWN_VENDORS) {
    const { prompt } = safeResearchPrompt({ vendor }, internal);
    assert.doesNotThrow(() => assertNoLeak(prompt, internal));
    assert.ok(!/partitionBy/i.test(prompt));
    assert.ok(!/2099-01-01-preview/.test(prompt));
    assert.ok(!/Phase 3/.test(prompt));
  }
});

test("assertNoLeak catches a verbatim internal phrase", () => {
  const internal = ["the fleet will ship site scoped budgets in the March release"];
  assert.throws(
    () => assertNoLeak(`Research Kong. ${internal[0]}`, internal),
    ConfidentialityError,
  );
});

test("assertNoLeak catches a distinctive fragment, not just the whole string", () => {
  const internal = ["we plan to ship hierarchical budget rollups before the summer milestone"];
  assert.throws(
    () => assertNoLeak("Some text about hierarchical budget rollups before the summer, and more.", internal),
    ConfidentialityError,
  );
});

test("assertNoLeak does not fire on ordinary English overlap", () => {
  const internal = ["we are not sure about this yet"];
  assert.doesNotThrow(() =>
    assertNoLeak(buildResearchPrompt({ vendor: "LiteLLM" }).prompt, internal),
  );
});

test("the default capability set is entirely public vocabulary", () => {
  const { capabilities } = buildResearchPrompt({ vendor: "Portkey" });
  assert.deepEqual(capabilities, CAPABILITY_VOCAB);
});
