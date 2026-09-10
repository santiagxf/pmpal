/**
 * PMPal -- a Copilot canvas extension for AI Gateway product specs.
 *
 * Phase 1 registers the Spec canvas: the house outline with per-section status,
 * a live rubric, and buttons that hand work back to the agent.
 *
 * Architecture note: everything the canvas API touches lives in this file. The
 * modules under lib/ are plain Node with no SDK import, so they stay unit
 * testable and survive changes to the experimental canvas wire protocol.
 *
 * NEVER call console.log here -- stdout carries JSON-RPC. Use session.log().
 */

import { createCanvas, joinSession } from "@github/copilot-sdk/extension";

import { Workspace, listWorkspaces, createWorkspace, openWorkspace } from "./lib/state.mjs";
import { viewModel, writeSection, exportSpec } from "./lib/actions.mjs";
import { safeResearchPrompt, KNOWN_VENDORS, ConfidentialityError } from "./lib/confidential.mjs";
import { startServer } from "./lib/server.mjs";

let session;
/** @type {Workspace|null} */
let ws = null;

const view = () => viewModel(ws);
const broadcast = () => server.broadcast();

function requireWorkspace() {
  if (!ws) throw new Error("No spec workspace is open. Call create_workspace or open_workspace first.");
  return ws;
}

function commit() {
  ws.save();
  broadcast();
}

// --- Prompts the canvas buttons hand back to the agent ---------------------

const ASK_PROMPTS = {
  "draft-market-landscape": () => {
    const vendors = KNOWN_VENDORS.slice(0, 6).join(", ");
    return [
      "The `### Market Landscape` section of the current spec is the weakest part of it.",
      `Research these competitors and fill it in: ${vendors}.`,
      "",
      "Use the `research_competitor` canvas action to get a safe, pre-approved research prompt",
      "for each vendor -- do not write your own query, and do not mention anything from this",
      "spec in a web search. This work is Microsoft-confidential.",
      "",
      "For every claim, call `add_citation` with the URL and the date you read it.",
      "Then call `write_section` for `Understand > Market Landscape` with prose that says",
      "what competitors do today and where our gap is. Cite inline. Anything you could not",
      "source, write as an explicit assumption to validate -- not as a fact.",
    ].join("\n");
  },
  "sharpen-goal": () => [
    "Review the `### Goal` of the current spec against the house style.",
    "",
    "The Goal must name the one thing this enables, then quantify what today costs in real",
    "numbers -- how many writes, how much exposure, how long. A Goal with no numbers is a wish.",
    "",
    "Ask me for any number you don't have rather than inventing one. Then call `write_section`",
    "for `Understand > Goal`.",
  ].join("\n"),
  "fix-blocking": () => {
    const r = view().rubric;
    const items = r ? r.blocking.map((b) => `- ${b.section}: ${b.message}`).join("\n") : "";
    return [
      "Fix the blocking rubric findings on the current spec:",
      "",
      items || "- (none)",
      "",
      "Work one section at a time. Call `read_spec` first, then `write_section` per fix, then",
      "`run_rubric` to confirm. Match the house voice: declarative, unhedged, real payloads,",
      "bolded write rules, first-person needs that carry a reason.",
      "Ask me rather than inventing any fact you cannot source.",
    ].join("\n");
  },
  critique: () => [
    "Critique the current spec as a demanding reviewer, not a supportive one.",
    "",
    "Call `read_spec`. Then tell me, specifically:",
    "- Which claims are asserted without evidence?",
    "- Which persona need is really a feature request wearing a persona's voice?",
    "- Where does the Solution describe behaviour the payload doesn't actually show?",
    "- Which phase in the Phasing table delivers no customer value on its own?",
    "- What would a competitor's PM say is missing?",
    "",
    "Do not rewrite anything. Log open questions with `add_open_question` and let me decide.",
  ].join("\n"),
};

// --- HTTP surface ----------------------------------------------------------

const server = await startServer({
  getState: view,
  onAsk(intent) {
    const build = ASK_PROMPTS[intent];
    if (!build) return false;
    session?.send({ prompt: build() });
    session?.log?.(`pmpal: dispatched intent ${intent}`);
    return true;
  },
});

// --- Canvas ----------------------------------------------------------------

const specCanvas = createCanvas({
  id: "pmpal-spec",
  displayName: "PMPal Spec",
  description:
    "Write an Azure AI Gateway product spec in the team's house style, with a live readiness rubric that blocks on unsourced claims.",
  actions: [
    {
      name: "list_workspaces",
      description: "List existing spec workspaces.",
      inputSchema: { type: "object", properties: {} },
      handler() {
        return { workspaces: listWorkspaces(), open: ws?.slug ?? null };
      },
    },
    {
      name: "create_workspace",
      description: "Start a new spec from the house template. Returns its slug.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Feature title, e.g. 'Workspace and gateway level policies'" },
          pmOwner: { type: "string", description: "e.g. 'Facundo Santiago (fasantia)'" },
          milestone: { type: "string", description: "e.g. 'Public Preview'" },
          offerings: { type: "string", description: "e.g. 'AI Gateway SKU'" },
        },
        required: ["title"],
      },
      handler({ input }) {
        ws = createWorkspace(input.title, input);
        broadcast();
        return { slug: ws.slug, path: ws.specPath };
      },
    },
    {
      name: "open_workspace",
      description: "Open an existing spec workspace by slug.",
      inputSchema: {
        type: "object",
        properties: { slug: { type: "string" } },
        required: ["slug"],
      },
      handler({ input }) {
        ws = openWorkspace(input.slug);
        broadcast();
        return { slug: ws.slug, hasSpec: Boolean(ws.spec.trim()) };
      },
    },
    {
      name: "read_spec",
      description: "Return the current spec markdown, its section outline, and rubric findings.",
      inputSchema: { type: "object", properties: {} },
      handler() {
        requireWorkspace();
        return { markdown: ws.spec, ...view() };
      },
    },
    {
      name: "write_section",
      description:
        "Replace the body of one section. Path is 'Phase > Section', e.g. 'Understand > Market Landscape'. Subsections are preserved.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "e.g. 'Understand > Goal'" },
          markdown: { type: "string", description: "The new body, in house style." },
        },
        required: ["path", "markdown"],
      },
      handler({ input }) {
        const result = writeSection(requireWorkspace(), input.path, input.markdown);
        broadcast();
        return result;
      },
    },
    {
      name: "set_section_status",
      description: "Set a section's status: empty, draft, unsourced, or ready.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          status: { type: "string", enum: ["empty", "draft", "unsourced", "ready"] },
        },
        required: ["path", "status"],
      },
      handler({ input }) {
        requireWorkspace().setSectionStatus(input.path, input.status);
        commit();
        return { ok: true };
      },
    },
    {
      name: "research_competitor",
      description:
        "Get a safe, pre-approved research prompt for a public competitor. Use this instead of writing your own web query -- it is built from a closed vocabulary so no confidential detail can leak.",
      inputSchema: {
        type: "object",
        properties: {
          vendor: { type: "string", description: `One of: ${KNOWN_VENDORS.join(", ")}` },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description: "Optional subset of the public capability vocabulary.",
          },
        },
        required: ["vendor"],
      },
      handler({ input }) {
        const w = requireWorkspace();
        try {
          const built = safeResearchPrompt(input, w.internalTexts());
          session?.log?.(`pmpal: approved research prompt for ${built.vendor}`);
          return built;
        } catch (err) {
          if (err instanceof ConfidentialityError) {
            return { refused: true, reason: err.message, allowedVendors: KNOWN_VENDORS };
          }
          throw err;
        }
      },
    },
    {
      name: "add_citation",
      description:
        "Record an external claim with its source. Both url and accessed date are required -- an undated citation is an assertion with a link stapled to it.",
      inputSchema: {
        type: "object",
        properties: {
          claim: { type: "string", description: "One sentence: what the product does." },
          url: { type: "string", description: "The exact page you read it on." },
          accessed: { type: "string", description: "ISO date, e.g. 2026-09-09." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          competitor: { type: "string" },
        },
        required: ["claim", "url", "accessed"],
      },
      handler({ input }) {
        const e = requireWorkspace().addEvidence(input);
        commit();
        return e;
      },
    },
    {
      name: "add_open_question",
      description: "Log something the spec cannot answer yet. Blocking questions gate readiness.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          blocking: { type: "boolean" },
          internal: { type: "boolean", description: "Mark Microsoft-confidential; never leaves in a research prompt." },
        },
        required: ["text"],
      },
      handler({ input }) {
        const w = requireWorkspace();
        const q = w.addOpenQuestion(input.text, input);
        if (input.internal) w.markInternal(`question:${q.id}`, input.text);
        commit();
        return q;
      },
    },
    {
      name: "run_rubric",
      description: "Re-run the house-style rubric and return findings.",
      inputSchema: { type: "object", properties: {} },
      handler() {
        requireWorkspace();
        broadcast();
        return view().rubric;
      },
    },
    {
      name: "export_spec",
      description:
        "Write the spec to a path outside the workspace, e.g. your specs repo. Refuses while blocking findings remain unless force is true.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute, or relative to the pmpal repo root." },
          force: { type: "boolean" },
        },
        required: ["path"],
      },
      handler({ input }) {
        return exportSpec(requireWorkspace(), input.path, input);
      },
    },
  ],
  open() {
    return { url: `http://127.0.0.1:${server.port}`, title: "PMPal Spec", status: ws ? ws.slug : "no spec open" };
  },
});

session = await joinSession({ canvases: [specCanvas] });
session.log(`pmpal: spec canvas listening on 127.0.0.1:${server.port}`);
