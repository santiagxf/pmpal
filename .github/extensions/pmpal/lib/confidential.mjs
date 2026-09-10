/**
 * Confidentiality guardrails.
 *
 * The AI Gateway roadmap is Microsoft-confidential. The risk is not that the
 * agent is malicious -- it is that a research prompt built by string-concatenating
 * spec text carries an unreleased feature name out to a web search.
 *
 * The defence is construction, not filtering: an outbound research prompt is
 * *assembled* from a closed vendor list and a closed capability vocabulary.
 * No free text from the spec is ever interpolated. `assertNoLeak` is then a
 * belt-and-braces check, not the primary control.
 */

/** Public vendors it is safe to name in an outbound query. Editable. */
export const KNOWN_VENDORS = [
  "Kong AI Gateway",
  "Cloudflare AI Gateway",
  "Portkey",
  "LiteLLM",
  "Google Apigee",
  "AWS Bedrock",
  "Databricks AI Gateway",
  "Envoy AI Gateway",
  "Traefik AI Gateway",
  "IBM watsonx",
  "Gloo AI Gateway",
];

/**
 * Generic, industry-standard capability terms. These describe the *category*,
 * never a specific unreleased design. "workspace-scoped policy inheritance" is
 * a public architectural concept; an unreleased property name is not.
 */
export const CAPABILITY_VOCAB = [
  "token rate limiting",
  "cost limits and budgets",
  "request rate limiting",
  "policy inheritance",
  "hierarchical policy scoping",
  "multi-tenancy and workspaces",
  "semantic caching",
  "model routing and fallback",
  "content safety filtering",
  "observability and metrics",
  "authentication and credential management",
  "MCP tool server support",
  "pricing model",
  "regional availability",
];

export class ConfidentialityError extends Error {}

/** Case- and punctuation-insensitive comparison key. */
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Build a research prompt for one vendor. Every component is drawn from the
 * closed lists above; nothing from the spec reaches the wire.
 *
 * @param {{vendor: string, capabilities?: string[], askedOn?: string}} opts
 * @returns {{vendor: string, capabilities: string[], prompt: string}}
 */
export function buildResearchPrompt({ vendor, capabilities = CAPABILITY_VOCAB, askedOn = today() }) {
  const vendorMatch = KNOWN_VENDORS.find((v) => norm(v) === norm(vendor));
  if (!vendorMatch) {
    throw new ConfidentialityError(
      `"${vendor}" is not in the public vendor list. Add it to KNOWN_VENDORS if it is a public competitor.`,
    );
  }

  const caps = capabilities.map((c) => {
    const match = CAPABILITY_VOCAB.find((v) => norm(v) === norm(c));
    if (!match) {
      throw new ConfidentialityError(
        `"${c}" is not in the public capability vocabulary. Outbound queries use generic category terms only.`,
      );
    }
    return match;
  });

  const prompt = [
    `Research the publicly documented capabilities of ${vendorMatch}.`,
    "",
    "For each capability below, report what the product does today, based only on public sources",
    "(vendor documentation, pricing pages, changelogs, public benchmarks):",
    "",
    ...caps.map((c) => `- ${c}`),
    "",
    "For every claim you make, call the canvas action `add_citation` with:",
    "  claim      - one sentence, what the product does",
    "  url        - the exact page you read it on",
    `  accessed   - ${askedOn}`,
    "  confidence - high if the vendor documents it explicitly,",
    "               medium if inferred from docs, low if from a third party",
    "",
    "If a capability is undocumented, say so and set confidence to low.",
    "Do not guess. An uncited claim is an assumption, and must be reported as one.",
  ].join("\n");

  return { vendor: vendorMatch, capabilities: caps, prompt };
}

/**
 * Verify no internal-flagged text appears in an outbound string. Matching is on
 * distinctive multi-word phrases and rare single tokens, so common English in an
 * internal note does not produce false positives.
 *
 * @throws {ConfidentialityError}
 */
export function assertNoLeak(outbound, internalTexts = []) {
  const haystack = norm(outbound);
  for (const secret of internalTexts) {
    const phrase = norm(secret);
    if (!phrase) continue;
    if (haystack.includes(phrase)) {
      throw new ConfidentialityError(`Outbound text contains internal-only content: "${truncate(secret)}"`);
    }
    // Also catch a distinctive fragment: any run of 4+ consecutive words.
    const words = phrase.split(" ");
    for (let i = 0; i + 4 <= words.length; i++) {
      const window = words.slice(i, i + 4).join(" ");
      if (haystack.includes(window)) {
        throw new ConfidentialityError(`Outbound text contains internal-only content: "...${window}..."`);
      }
    }
  }
  return true;
}

/**
 * Build and verify in one step. This is what the canvas calls -- and the
 * returned prompt is shown in the panel before dispatch, so you see what
 * leaves before it leaves.
 */
export function safeResearchPrompt(opts, internalTexts = []) {
  const built = buildResearchPrompt(opts);
  assertNoLeak(built.prompt, internalTexts);
  return built;
}

function truncate(s, n = 60) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}...` : t;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
