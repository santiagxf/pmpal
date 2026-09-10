/**
 * Parse and serialize the AI Gateway house-style spec.
 *
 *   # Title
 *   **Scenario:** / **PM Owner:** / **Target Milestone:** / **Offerings:**
 *   ## Understand   -> ### Goal / ### Who We're Solving For / ### Market Landscape
 *   ## Identify     -> ### Solution / ### Hero Scenarios
 *   ## Execute      -> ### Phasing
 *
 * Round-trip is lossless by construction: `blocks` is a flat, ordered list of
 * (heading, raw body lines) and serialization simply re-emits it. The tree in
 * `root` is a navigation view over the *same* node objects, so mutating a node
 * through the tree changes what gets serialized.
 *
 * No dependency on @github/copilot-sdk -- this file stays plain Node so it can
 * be unit tested and survives changes to the experimental canvas API.
 */

/** Metadata keys that appear as `**Key:** value` under the H1, in house order. */
export const META_KEYS = ["Scenario", "PM Owner", "Target Milestone", "Offerings"];

/** The canonical section skeleton: H2 phase -> ordered H3 sections. */
export const HOUSE_OUTLINE = [
  { title: "Understand", sections: ["Goal", "Who We're Solving For", "Market Landscape"] },
  { title: "Identify", sections: ["Solution", "Hero Scenarios"] },
  { title: "Execute", sections: ["Phasing"] },
];

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const META_RE = /^\*\*(.+?):\*\*\s*(.*)$/;

/**
 * Split markdown into lines, flagging which ones sit inside a fenced code
 * block. Headings inside fences are content, not structure -- the house style
 * puts `jsonc` payloads everywhere, so this matters.
 */
function scanLines(markdown) {
  const lines = markdown.split("\n");
  const inFence = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_RE.exec(lines[i]);
    if (fence === null) {
      if (m) {
        fence = m[1][0].repeat(3);
        inFence[i] = true;
      }
    } else {
      inFence[i] = true;
      // A closing fence is a fence marker of the same char on its own line.
      if (m && m[1][0] === fence[0] && lines[i].trim().replace(/[^`~]/g, "") === lines[i].trim()) {
        fence = null;
      }
    }
  }
  return { lines, inFence };
}

/**
 * Parse a house-style spec.
 *
 * @param {string} markdown
 * @param {{normalize?: boolean}} [opts] - normalize:true promotes a misplaced
 *   `### Execute` to `## Execute` (your fixture has it nested under Identify).
 * @returns {{preamble: string[], blocks: object[], root: object[],
 *            normalizations: string[], title: string|null, meta: object}}
 */
export function parseSpec(markdown, opts = {}) {
  const { normalize = false } = opts;
  const { lines, inFence } = scanLines(markdown);

  const preamble = [];
  const blocks = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const heading = inFence[i] ? null : HEADING_RE.exec(lines[i]);
    if (heading) {
      current = {
        level: heading[1].length,
        title: heading[2],
        body: [],
        children: [],
        parent: null,
      };
      blocks.push(current);
    } else if (current) {
      current.body.push(lines[i]);
    } else {
      preamble.push(lines[i]);
    }
  }

  const normalizations = normalize ? normalizeStructure(blocks) : [];
  const root = buildTree(blocks);
  const titleBlock = blocks.find((b) => b.level === 1) ?? null;

  return {
    preamble,
    blocks,
    root,
    // Section lookup starts at the phase level (Understand / Identify /
    // Execute), so callers don't have to know whether the doc has an H1.
    phases: titleBlock ? titleBlock.children : root,
    normalizations,
    title: titleBlock ? titleBlock.title : null,
    meta: parseMeta(titleBlock),
  };
}

/**
 * Reassemble the flat block list into a tree by heading level. Nodes are shared
 * with `blocks`, not copied.
 */
function buildTree(blocks) {
  const root = [];
  const stack = [];
  for (const block of blocks) {
    block.children = [];
    block.parent = null;
    while (stack.length && stack[stack.length - 1].level >= block.level) stack.pop();
    if (stack.length) {
      const parent = stack[stack.length - 1];
      parent.children.push(block);
      block.parent = parent;
    } else {
      root.push(block);
    }
    stack.push(block);
  }
  return root;
}

/**
 * Fix structural drift we know about. Currently one rule: `### Execute` sitting
 * under `## Identify` is a demoted phase heading, not a subsection of the
 * solution. Promote it so Phasing lands where the outline expects it.
 */
function normalizeStructure(blocks) {
  const applied = [];
  for (const block of blocks) {
    if (block.level === 3 && block.title.trim() === "Execute") {
      block.level = 2;
      applied.push("Promoted `### Execute` to `## Execute` (top-level phase).");
      // Its subsections keep their levels; Phasing stays at H4 in the source,
      // so pull it up one to match the outline.
      const idx = blocks.indexOf(block);
      for (let i = idx + 1; i < blocks.length; i++) {
        if (blocks[i].level <= 2) break;
        blocks[i].level -= 1;
      }
      applied.push("Pulled `#### Phasing` up to `### Phasing`.");
    }
  }
  return applied;
}

/** Read the `**Key:** value` block that follows the H1. */
function parseMeta(titleBlock) {
  const meta = {};
  if (!titleBlock) return meta;
  for (const line of titleBlock.body) {
    const m = META_RE.exec(line.trim());
    if (m) meta[m[1]] = m[2].trim();
  }
  return meta;
}

/**
 * Re-emit a parsed spec. Byte-identical to the input when no normalization was
 * applied.
 */
export function serializeSpec(doc) {
  const out = [...doc.preamble];
  for (const block of doc.blocks) {
    out.push(`${"#".repeat(block.level)} ${block.title}`);
    out.push(...block.body);
  }
  return out.join("\n");
}

/**
 * Look up a section by heading path, e.g. `["Understand", "Goal"]`.
 * Matching is case-insensitive and ignores surrounding whitespace.
 */
export function findSection(doc, path) {
  let level = doc.phases;
  let found = null;
  for (const want of path) {
    found = level.find((n) => n.title.trim().toLowerCase() === want.trim().toLowerCase());
    if (!found) return null;
    level = found.children;
  }
  return found;
}

/** The section's own body plus all descendant headings and bodies, as text. */
export function sectionText(node, { includeChildren = true } = {}) {
  if (!node) return "";
  const parts = [node.body.join("\n")];
  if (includeChildren) {
    for (const child of node.children) {
      parts.push(`${"#".repeat(child.level)} ${child.title}`);
      parts.push(sectionText(child));
    }
  }
  return parts.join("\n");
}

/** Remove HTML comments. Guidance in the template is not spec content. */
export function stripComments(text) {
  return String(text).replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * `<Feature title>`, `<Persona>`, `<what ships>` -- angle-bracket slots left
 * over from the template. A section still full of these has not been written.
 * Deliberately narrow: no slashes (so it can't match an HTML tag) and no
 * newlines.
 */
const PLACEHOLDER_RE = /<[^<>\n/]{2,60}>/g;

export function stripPlaceholders(text) {
  return String(text).replace(PLACEHOLDER_RE, "");
}

/** Every unfilled placeholder in a chunk of markdown. */
export function findPlaceholders(text) {
  return [...stripComments(text).matchAll(PLACEHOLDER_RE)].map((m) => m[0]);
}

/**
 * The content that actually counts: no guidance comments, no unfilled
 * placeholders. This is what "is this section written?" means.
 */
export function meaningfulText(node) {
  return stripPlaceholders(stripComments(sectionText(node)))
    .replace(/^\s*[-*]\s*$/gm, "")
    .trim();
}

/** True when a section carries no real prose, code, or subsections. */
export function isEmptySection(node) {
  if (!node) return true;
  return meaningfulText(node) === "";
}

/** Replace a section's body. Subsections are left untouched. */
export function setSectionBody(node, text) {
  if (!node) throw new Error("setSectionBody: no such section");
  const lines = String(text).replace(/\s+$/, "").split("\n");
  node.body = ["", ...lines, ""];
  return node;
}

/** Parse a GitHub-flavored markdown table into {headers, rows}. */
export function parseTable(text) {
  const lines = text.split("\n").map((l) => l.trim());
  const start = lines.findIndex((l) => l.startsWith("|") && l.endsWith("|"));
  if (start === -1) return null;
  const sep = lines[start + 1];
  if (!sep || !/^\|[\s:|-]+\|$/.test(sep)) return null;

  const cells = (line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());

  const headers = cells(lines[start]);
  const rows = [];
  for (let i = start + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|") || !line.endsWith("|")) break;
    rows.push(cells(line));
  }
  return { headers, rows };
}
