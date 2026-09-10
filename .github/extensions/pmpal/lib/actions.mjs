/**
 * The work behind the canvas actions, as plain functions.
 *
 * extension.mjs is a thin adapter over this module: it owns the canvas wire
 * protocol, this owns the behaviour. Everything here is unit testable without
 * the SDK, which matters because the canvas API is marked @experimental.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import {
  parseSpec,
  serializeSpec,
  findSection,
  setSectionBody,
  isEmptySection,
  HOUSE_OUTLINE,
} from "./template.mjs";
import { runRubric } from "./rubric.mjs";
import { REPO_ROOT } from "./state.mjs";

/** Derive a section status when the PM hasn't set one explicitly. */
function statusFor(doc, phase, name, rubric, explicit) {
  if (explicit) return explicit.status;
  if (isEmptySection(findSection(doc, [phase, name]))) return "empty";
  return rubric.blocking.some((r) => r.section === `${phase} > ${name}`) ? "unsourced" : "draft";
}

/** Everything the panel renders. Safe to call with no workspace open. */
export function viewModel(ws) {
  if (!ws || !ws.spec.trim()) {
    return { title: null, slug: null, outline: [], rubric: null, openQuestions: [], evidence: [] };
  }

  const doc = parseSpec(ws.spec, { normalize: true });
  const rubric = runRubric(doc, ws.spec, { evidence: ws.evidence });

  const outline = [];
  for (const phase of HOUSE_OUTLINE) {
    for (const name of phase.sections) {
      outline.push({
        phase: phase.title,
        name,
        status: statusFor(doc, phase.title, name, rubric, ws.meta.sections[`${phase.title} > ${name}`]),
      });
    }
  }

  return {
    title: doc.title,
    slug: ws.slug,
    outline,
    rubric,
    openQuestions: ws.meta.openQuestions.filter((q) => !q.resolved),
    evidence: ws.evidence,
  };
}

/** Replace one section's body, preserving its subsections. */
export function writeSection(ws, path, markdown) {
  const doc = parseSpec(ws.spec, { normalize: true });
  const parts = String(path).split(">").map((p) => p.trim());
  const node = findSection(doc, parts);
  if (!node) throw new Error(`No such section: ${path}`);

  setSectionBody(node, markdown);
  ws.spec = serializeSpec(doc);
  ws.setSectionStatus(parts.join(" > "), "draft");
  ws.save();

  const rubric = viewModel(ws).rubric;
  return { written: parts.join(" > "), ready: rubric.ready, blocking: rubric.blocking };
}

/** Write the spec somewhere else. Refuses while blocking findings remain. */
export function exportSpec(ws, path, { force = false } = {}) {
  const rubric = viewModel(ws).rubric;
  if (!rubric.ready && !force) {
    return {
      exported: false,
      reason: "Spec has blocking findings. Fix them, or pass force: true.",
      blocking: rubric.blocking,
    };
  }

  const target = isAbsolute(path) ? path : join(REPO_ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, ws.spec, "utf8");

  const internal = ws.internalTexts().length;
  return {
    exported: true,
    path: target,
    warning: internal
      ? `${internal} internal-only note(s) exist; confirm this destination is Microsoft-internal.`
      : null,
  };
}
