/**
 * Workspace state.
 *
 * One directory per spec under `workspaces/<slug>/`:
 *
 *   spec.md          the artifact -- always a valid, committable house-style doc
 *   evidence.json    every external claim: url, accessed date, confidence
 *   benchmark.json   competitor x capability matrix
 *   positioning.json
 *   state.json       section status, open questions, internal-only flags
 *
 * Markdown is the source of truth. The JSON files are sidecars holding only what
 * markdown cannot express. Delete PMPal and you still have your spec.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";

const HERE = dirname(fileURLToPath(import.meta.url));
/** repo root = up from .github/extensions/pmpal/lib */
export const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
export const WORKSPACES_DIR = process.env.PMPAL_WORKSPACES_DIR ?? join(REPO_ROOT, "workspaces");
export const TEMPLATE_PATH = join(REPO_ROOT, "templates", "spec-template.md");

const SIDECARS = {
  evidence: "evidence.json",
  benchmark: "benchmark.json",
  positioning: "positioning.json",
  meta: "state.json",
};

const DEFAULTS = {
  evidence: [],
  benchmark: { competitors: [], capabilities: [], cells: {} },
  positioning: { statement: null, differentiators: [], objections: [] },
  meta: { sections: {}, openQuestions: [], internal: [], slug: null, createdAt: null },
};

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function readJson(path, fallback) {
  if (!existsSync(path)) return structuredClone(fallback);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** A single spec workspace, plus a change stream for the canvas to subscribe to. */
export class Workspace extends EventEmitter {
  constructor(slug) {
    super();
    this.slug = slug;
    this.dir = join(WORKSPACES_DIR, slug);
    this.specPath = join(this.dir, "spec.md");
    this.load();
  }

  load() {
    this.spec = existsSync(this.specPath) ? readFileSync(this.specPath, "utf8") : "";
    for (const [key, file] of Object.entries(SIDECARS)) {
      this[key] = readJson(join(this.dir, file), DEFAULTS[key]);
    }
    return this;
  }

  save() {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.specPath, this.spec, "utf8");
    for (const [key, file] of Object.entries(SIDECARS)) {
      writeJson(join(this.dir, file), this[key]);
    }
    this.emit("change", this);
    return this;
  }

  /** Section status: empty | draft | unsourced | ready */
  setSectionStatus(path, status) {
    this.meta.sections[path] = { status, updatedAt: new Date().toISOString() };
    return this;
  }

  addOpenQuestion(text, { blocking = false, internal = false } = {}) {
    const q = {
      id: `q${this.meta.openQuestions.length + 1}`,
      text,
      blocking,
      internal,
      resolved: false,
      askedAt: new Date().toISOString(),
    };
    this.meta.openQuestions.push(q);
    return q;
  }

  /**
   * Record an external claim. `accessed` is required -- an undated citation is
   * an assertion with a link stapled to it.
   */
  addEvidence({ claim, url, accessed, confidence = "medium", competitor = null }) {
    if (!url) throw new Error("addEvidence: url is required");
    if (!accessed) throw new Error("addEvidence: accessed date is required");
    const e = { id: `e${this.evidence.length + 1}`, claim, url, accessed, confidence, competitor };
    this.evidence.push(e);
    return e;
  }

  /** Mark a section or note as Microsoft-confidential. */
  markInternal(ref, text) {
    this.meta.internal.push({ ref, text, at: new Date().toISOString() });
    return this;
  }

  /** Every piece of internal-flagged text, for leak checks. */
  internalTexts() {
    return this.meta.internal.map((i) => i.text).filter(Boolean);
  }
}

export function listWorkspaces() {
  if (!existsSync(WORKSPACES_DIR)) return [];
  return readdirSync(WORKSPACES_DIR)
    .filter((name) => statSync(join(WORKSPACES_DIR, name)).isDirectory())
    .sort();
}

export function openWorkspace(slug) {
  return new Workspace(slug);
}

/** Create a workspace seeded from the house template. */
export function createWorkspace(title, { pmOwner = "", milestone = "Public Preview", offerings = "AI Gateway SKU" } = {}) {
  const slug = slugify(title);
  const ws = new Workspace(slug);
  if (!ws.spec) {
    const template = readFileSync(TEMPLATE_PATH, "utf8");
    ws.spec = template
      .replace("# <Feature title>", `# ${title}`)
      .replace("**PM Owner:** <Name (alias)>", `**PM Owner:** ${pmOwner}`)
      .replace("**Target Milestone:** <Public Preview | GA>", `**Target Milestone:** ${milestone}`)
      .replace("**Offerings:** <SKU>", `**Offerings:** ${offerings}`);
  }
  ws.meta.slug = slug;
  ws.meta.createdAt ??= new Date().toISOString();
  return ws.save();
}
