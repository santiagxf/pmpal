/**
 * The house-style rubric.
 *
 * Every rule here was extracted from a real AI Gateway spec
 * (`tests/fixtures/house-style-sample.md`), not invented. That fixture is the
 * calibration target: it must pass every rule except `market-landscape-sourced`,
 * whose `### Market Landscape` section is empty. If a rule starts failing on the
 * fixture, the rule is wrong about the house style -- not the spec.
 *
 * Severity:
 *   blocking - structural, mechanically verifiable. Gates "ready".
 *   advisory - heuristic. Surfaced in the panel, never blocks.
 */

import {
  findSection,
  sectionText,
  isEmptySection,
  parseTable,
  stripComments,
  stripPlaceholders,
  findPlaceholders,
  META_KEYS,
  HOUSE_OUTLINE,
} from "./template.mjs";

/** Reason connectives that turn "I want X" into "I want X, because Y". */
const REASON_MARKERS = [
  "so ",
  "so,",
  "rather than",
  "instead of",
  "without ",
  "while ",
  "including ",
];

/**
 * Hedges that genuinely weaken a spec. Deliberately narrow: bare "may" is NOT
 * here, because the house style uses it correctly for permission
 * ("A policy may target its attachment level"). Flagging that would be noise.
 */
const HEDGES = [
  /\bTBD\b/i,
  /\bTODO\b/,
  /\bprobably\b/i,
  /\bpossibly\b/i,
  /\bhopefully\b/i,
  /\bwe think\b/i,
  /\bwe believe\b/i,
  /\bunclear\b/i,
  /\bmay or may not\b/i,
  /\bsomewhat\b/i,
  /\bfairly\b/i,
  /\bkind of\b/i,
  /\bto be determined\b/i,
];

const URL_RE = /https?:\/\/[^\s)>\]]+/;

const ok = (rule, message) => ({ rule, pass: true, severity: "blocking", message });

function check(rule, severity, pass, message, section) {
  return { rule, severity, pass, message, section };
}

/** True once a fragment has real words left, not just punctuation. */
const hasSubstance = (s) => /[A-Za-z]{3}/.test(s);

/**
 * Bullet lines (`- ` / `* `) in a chunk of markdown. Fences, guidance comments,
 * and bullets that are nothing but an unfilled `<placeholder>` are excluded --
 * a template slot is not a persona need.
 */
function bulletsOf(text) {
  const out = [];
  let inFence = false;
  for (const raw of stripComments(text).split("\n")) {
    if (/^\s*(`{3,}|~{3,})/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (!m) continue;
    const line = m[1].trim();
    if (hasSubstance(stripPlaceholders(line))) out.push(line);
  }
  return out;
}

/** Strip fenced code, guidance comments, and placeholders: prose checks read only real prose. */
function proseOnly(text) {
  const out = [];
  let inFence = false;
  for (const raw of stripComments(text).split("\n")) {
    if (/^\s*(`{3,}|~{3,})/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(raw);
  }
  return stripPlaceholders(out.join("\n"));
}

// --- Rules -----------------------------------------------------------------

/** 0. Header metadata is present and filled in, not still a template slot. */
function metadataComplete(doc) {
  const missing = META_KEYS.filter((k) => {
    const v = (doc.meta[k] || "").trim();
    return !v || findPlaceholders(v).length > 0;
  });
  return check(
    "metadata-complete",
    "blocking",
    missing.length === 0,
    missing.length ? `Header fields not filled in: ${missing.join(", ")}.` : "All header fields present.",
    "(header)",
  );
}

/**
 * 0a. Every house section has been written.
 *
 * Market Landscape is excluded: it has its own stricter rule
 * (`market-landscape-sourced`), and reporting it twice would double-count the
 * single most common gap.
 */
const OWN_RULE = new Set(["Understand > Market Landscape"]);

function sectionsWritten(doc) {
  const blank = [];
  for (const phase of HOUSE_OUTLINE) {
    for (const name of phase.sections) {
      const path = `${phase.title} > ${name}`;
      if (OWN_RULE.has(path)) continue;
      const node = findSection(doc, [phase.title, name]);
      if (!node || isEmptySection(node)) blank.push(path);
    }
  }
  return check(
    "sections-written",
    "blocking",
    blank.length === 0,
    blank.length === 0 ? "Every section has content." : `Not yet written: ${blank.join(", ")}.`,
    blank[0] ?? "(document)",
  );
}

/** 0b. No template placeholders left behind. */
function noPlaceholders(doc, markdown) {
  const left = [...new Set(findPlaceholders(markdown))];
  return check(
    "no-placeholders",
    "blocking",
    left.length === 0,
    left.length === 0
      ? "No template placeholders remain."
      : `${left.length} template placeholder(s) still unfilled: ${left.slice(0, 4).join(", ")}${left.length > 4 ? ", ..." : ""}.`,
    "(document)",
  );
}

/** 1. The Goal quantifies today's cost. A Goal with no number is a wish. */
function goalQuantified(doc) {
  const goal = findSection(doc, ["Understand", "Goal"]);
  const text = proseOnly(sectionText(goal));
  const hasNumber = /\d/.test(text.replace(/`[^`]*`/g, ""));
  return check(
    "goal-quantified",
    "blocking",
    !isEmptySection(goal) && hasNumber,
    hasNumber
      ? "Goal states today's cost in numbers."
      : "Goal has no numbers. State what today costs: how many writes, how much exposure, how long.",
    "Understand > Goal",
  );
}

/** 2. Persona needs are first-person and carry a reason. */
function needsFirstPerson(doc) {
  const who = findSection(doc, ["Understand", "Who We're Solving For"]);
  const bullets = bulletsOf(sectionText(who));
  if (!bullets.length) {
    return check("needs-first-person", "blocking", false, "No persona needs found.", "Understand > Who We're Solving For");
  }
  const bad = bullets.filter((b) => {
    const lower = b.toLowerCase();
    const firstPerson = lower.startsWith("i want") || lower.startsWith("i need");
    const hasReason = REASON_MARKERS.some((m) => lower.includes(m));
    // `I want <outcome>, so <why it matters>.` has the right shape and says
    // nothing. Require real words once the placeholders are gone.
    const words = stripPlaceholders(lower).match(/[a-z]{2,}/g) ?? [];
    return !firstPerson || !hasReason || words.length < 8;
  });
  return check(
    "needs-first-person",
    "blocking",
    bad.length === 0,
    bad.length === 0
      ? `All ${bullets.length} needs are first-person with a reason.`
      : `${bad.length} need(s) are not first-person-with-a-reason, e.g. "${bad[0].slice(0, 80)}".`,
    "Understand > Who We're Solving For",
  );
}

/** 3. The Solution shows the real contract, not pseudocode. */
function solutionHasContract(doc) {
  const sol = findSection(doc, ["Identify", "Solution"]);
  // Placeholders stripped first, so `api-version=<version>` reads as unfilled.
  const text = stripPlaceholders(stripComments(sectionText(sol)));
  const hasFence = /```/.test(text);
  const hasVerb = /\b(GET|PUT|POST|PATCH|DELETE)\b/.test(text);
  const hasVersion = /api-version=[^\s"'&]/.test(text);
  const pass = hasFence && hasVerb && hasVersion;
  const missing = [
    !hasFence && "a fenced payload",
    !hasVerb && "an HTTP method",
    !hasVersion && "an api-version",
  ].filter(Boolean);
  return check(
    "solution-has-contract",
    "blocking",
    pass,
    pass ? "Solution shows a real API contract." : `Solution is missing ${missing.join(", ")}.`,
    "Identify > Solution",
  );
}

/** 4. Write rules are bolded assertions, one per bullet. */
function writeRulesBolded(doc) {
  const sol = findSection(doc, ["Identify", "Solution"]);
  const rules = sol && sol.children.find((c) => /write rules/i.test(c.title));
  if (!rules) {
    return check("write-rules-bolded", "advisory", true, "No Write rules subsection (not required).", "Identify > Solution");
  }
  const bullets = bulletsOf(sectionText(rules));
  const unbolded = bullets.filter((b) => !b.startsWith("**"));
  const message = !bullets.length
    ? "Write rules section is empty. State each rule as a bolded assertion."
    : unbolded.length
      ? `${unbolded.length} write rule(s) do not lead with a bolded assertion.`
      : `All ${bullets.length} write rules lead with a bolded assertion.`;
  return check("write-rules-bolded", "blocking", bullets.length > 0 && unbolded.length === 0, message, "Identify > Solution > Write rules");
}

/** 5. Ambiguity is resolved with a declaration-to-meaning table, not prose. */
function ambiguityTable(doc) {
  const sol = findSection(doc, ["Identify", "Solution"]);
  const hasTable = parseTable(stripComments(sectionText(sol))) !== null;
  return check(
    "ambiguity-table",
    "blocking",
    hasTable,
    hasTable
      ? "Solution maps declarations to meanings in a table."
      : "Solution has no table. Where a declaration could mean two things, show declaration -> meaning in a table.",
    "Identify > Solution",
  );
}

/** 6. Breaking changes are called out in a blockquote. */
function breakingChangeCallout(doc, markdown) {
  markdown = stripComments(markdown);
  const mentioned = /breaking change/i.test(markdown);
  if (!mentioned) {
    return check("breaking-change-callout", "advisory", true, "No breaking change declared.", "(document)");
  }
  const quoted = /^\s*>\s*\*\*Breaking change\*\*/im.test(markdown);
  return check(
    "breaking-change-callout",
    "blocking",
    quoted,
    quoted
      ? "Breaking change is called out in a blockquote."
      : 'A breaking change is mentioned but not called out. Use `> **Breaking change**: ...`.',
    "(document)",
  );
}

/** 7. Every phasing row states customer value at that phase. */
function phasingCustomerValue(doc) {
  const phasing = findSection(doc, ["Execute", "Phasing"]);
  if (!phasing) {
    return check("phasing-customer-value", "blocking", false, "No Execute > Phasing section.", "Execute > Phasing");
  }
  const table = parseTable(stripComments(sectionText(phasing)));
  if (!table) {
    return check("phasing-customer-value", "blocking", false, "Phasing has no table.", "Execute > Phasing");
  }
  const col = table.headers.findIndex((h) => /customer value/i.test(h));
  if (col === -1) {
    return check(
      "phasing-customer-value",
      "blocking",
      false,
      'Phasing table has no "Customer value at this phase" column.',
      "Execute > Phasing",
    );
  }
  // A cell that is only an unfilled `<placeholder>` states no value.
  const empty = table.rows.filter((r) => !hasSubstance(stripPlaceholders(r[col] || "")));
  return check(
    "phasing-customer-value",
    "blocking",
    empty.length === 0,
    empty.length === 0
      ? `All ${table.rows.length} phases state customer value.`
      : `${empty.length} phase(s) state no customer value. A phase that delivers nothing to a customer is not a phase.`,
    "Execute > Phasing",
  );
}

/** 8. No hedging. */
function noHedging(doc, markdown) {
  const prose = proseOnly(markdown);
  const hits = [];
  for (const re of HEDGES) {
    const m = re.exec(prose);
    if (m) hits.push(m[0]);
  }
  return check(
    "no-hedging",
    "advisory",
    hits.length === 0,
    hits.length === 0
      ? "No hedging found."
      : `Hedging found: ${[...new Set(hits)].join(", ")}. State what happens, not what might.`,
    "(document)",
  );
}

/** 9. Hero scenarios end in a customer-visible outcome, not a payload. */
function heroScenarioOutcome(doc) {
  const hero = findSection(doc, ["Identify", "Hero Scenarios"]);
  if (!hero) {
    return check("hero-scenario-outcome", "blocking", false, "No Identify > Hero Scenarios section.", "Identify > Hero Scenarios");
  }
  const leaves = [];
  const walk = (n) => (n.children.length ? n.children.forEach(walk) : leaves.push(n));
  hero.children.forEach(walk);
  if (!leaves.length) {
    return check("hero-scenario-outcome", "blocking", false, "No scenarios found under Hero Scenarios.", "Identify > Hero Scenarios");
  }
  const bad = leaves.filter((leaf) => {
    const lines = proseOnly(leaf.body.join("\n"))
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const last = lines[lines.length - 1] || "";
    return !/^\d+\./.test(last);
  });
  return check(
    "hero-scenario-outcome",
    "blocking",
    bad.length === 0,
    bad.length === 0
      ? `All ${leaves.length} scenarios end on an outcome step.`
      : `${bad.length} scenario(s) end on a payload or fragment, e.g. "${bad[0].title}". End on what the customer now sees.`,
    "Identify > Hero Scenarios",
  );
}

/**
 * 10. The evidence gate. Market Landscape must exist, be non-empty, and cite
 * its claims. This is the rule that fires on the calibration fixture.
 */
function marketLandscapeSourced(doc, markdown, evidence) {
  const ml = findSection(doc, ["Understand", "Market Landscape"]);
  if (!ml) {
    return check("market-landscape-sourced", "blocking", false, "No Understand > Market Landscape section.", "Understand > Market Landscape");
  }
  if (isEmptySection(ml)) {
    return check(
      "market-landscape-sourced",
      "blocking",
      false,
      "Market Landscape is empty. Benchmark the competitors, then write what the gap is and cite it.",
      "Understand > Market Landscape",
    );
  }
  const hasInlineUrl = URL_RE.test(stripComments(sectionText(ml)));
  const hasEvidence = Array.isArray(evidence) && evidence.length > 0;
  const cited = hasInlineUrl || hasEvidence;
  return check(
    "market-landscape-sourced",
    "blocking",
    cited,
    cited
      ? "Market Landscape claims are sourced."
      : "Market Landscape has claims but no citations. Every external claim needs a URL and the date you read it.",
    "Understand > Market Landscape",
  );
}

// --- Runner ----------------------------------------------------------------

/**
 * Run the full rubric.
 *
 * @param {object} doc      parsed spec from `parseSpec`
 * @param {string} markdown the source markdown
 * @param {object} [state]  workspace state; `state.evidence` supplies citations
 * @returns {{results: object[], blocking: object[], advisory: object[],
 *            ready: boolean, score: {passed: number, total: number}}}
 */
export function runRubric(doc, markdown, state = {}) {
  const evidence = state.evidence ?? [];
  const results = [
    metadataComplete(doc),
    sectionsWritten(doc),
    noPlaceholders(doc, markdown),
    goalQuantified(doc),
    needsFirstPerson(doc),
    marketLandscapeSourced(doc, markdown, evidence),
    solutionHasContract(doc),
    writeRulesBolded(doc),
    ambiguityTable(doc),
    heroScenarioOutcome(doc),
    breakingChangeCallout(doc, markdown),
    phasingCustomerValue(doc),
    noHedging(doc, markdown),
  ];

  const failed = results.filter((r) => !r.pass);
  return {
    results,
    blocking: failed.filter((r) => r.severity === "blocking"),
    advisory: failed.filter((r) => r.severity === "advisory"),
    ready: failed.every((r) => r.severity !== "blocking"),
    score: { passed: results.length - failed.length, total: results.length },
  };
}
