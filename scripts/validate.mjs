#!/usr/bin/env node
/**
 * Preflight for the canvas extension: everything the Copilot host will do to
 * this code, done here where the errors are visible.
 *
 * The host forks `extension.mjs` as a child process and speaks JSON-RPC over its
 * stdout. A crash during module load therefore writes to stderr, which the host
 * discards -- the extension simply never appears, with nothing in the logs. That
 * failure mode is invisible by construction, so it has to be caught before
 * install rather than debugged after.
 *
 *   node scripts/validate.mjs        (or: npm run validate)
 *
 * Exits non-zero on any FAIL.
 */

import { register } from "node:module";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const EXT_DIR = join(REPO, ".github", "extensions", "pmpal");
const ENTRY = join(EXT_DIR, "extension.mjs");

let failures = 0;
let warnings = 0;

const pass = (m, d) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}${d ? `\n          ${d}` : ""}`);
const warn = (m, d) => (warnings++, console.log(`  \x1b[33mWARN\x1b[0m  ${m}${d ? `\n          ${d}` : ""}`));
const fail = (m, d) => (failures++, console.log(`  \x1b[31mFAIL\x1b[0m  ${m}${d ? `\n          ${d}` : ""}`));
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const check = (cond, ok, bad, detail) => (cond ? pass(ok) : fail(bad, detail));

// --- 0. Node.js version -----------------------------------------------------

section("Runtime");

{
  const [major, minor] = process.versions.node.split(".").map(Number);
  const ok = (major === 20 && minor >= 19) || major >= 22;
  check(
    ok,
    `Node.js ${process.versions.node} meets the SDK requirement (^20.19.0 || >=22.12.0)`,
    `Node.js ${process.versions.node} is too old -- the SDK requires ^20.19.0 || >=22.12.0`,
    "The Copilot host bundles its own Node.js; this check reflects the version you would use\n          for npm install and npm run validate. Upgrade if npm install fails.",
  );
  pass(`Platform: ${process.platform} ${process.arch}`);
}

// --- 1. Layout -------------------------------------------------------------

section("Layout");

check(
  existsSync(ENTRY),
  "extension.mjs exists at the discovered path",
  "extension.mjs is missing",
  `expected ${relative(REPO, ENTRY)} -- the host only discovers a file with this exact name`,
);

let pkg = null;
try {
  pkg = JSON.parse(readFileSync(join(EXT_DIR, "package.json"), "utf8"));
  pass("package.json parses");
} catch (err) {
  fail("package.json is missing or invalid", err.message);
}

if (pkg) {
  check(pkg.type === "module", '"type": "module"', `"type" is ${JSON.stringify(pkg.type)}, must be "module"`, "extension.mjs uses ESM syntax; without this Node parses it as CommonJS");
  check(pkg.main === "extension.mjs", '"main": "extension.mjs"', `"main" is ${JSON.stringify(pkg.main)}`);

  const dep = pkg.dependencies?.["@github/copilot-sdk"];
  if (!dep) {
    fail("@github/copilot-sdk is not a declared dependency");
  } else if (dep === "latest" || dep === "*") {
    warn(
      `@github/copilot-sdk is pinned to "${dep}"`,
      "the canvas API is @experimental -- an unattended upgrade can break the extension silently. Prefer a caret range.",
    );
  } else {
    pass(`@github/copilot-sdk pinned to "${dep}"`);
  }
}

// --- 2. Dependencies actually installed ------------------------------------
// This is the failure that produces "fails to load, nothing in the logs".

section("Dependencies");

const require = createRequire(join(EXT_DIR, "package.json"));

// Probe the subpath the extension actually imports. Don't probe
// "@github/copilot-sdk/package.json" -- the package's `exports` map does not
// expose it, so that reports "not installed" for a perfectly good install.
let resolved = null;
try {
  resolved = require.resolve("@github/copilot-sdk/extension");
  pass("@github/copilot-sdk/extension resolves");
} catch (err) {
  fail(
    err.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
      ? "@github/copilot-sdk is installed but no longer exports /extension"
      : "@github/copilot-sdk is NOT installed",
    err.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
      ? "the SDK moved this subpath -- check its release notes"
      : `the extension will die at import with ERR_MODULE_NOT_FOUND, on stderr, which the host discards.\n          Fix: npm install --prefix ${relative(REPO, EXT_DIR)}`,
  );
}

if (resolved) {
  // Read version off disk: `exports` blocks require()-ing the manifest.
  const manifest = join(EXT_DIR, "node_modules", "@github", "copilot-sdk", "package.json");
  if (existsSync(manifest)) {
    const v = JSON.parse(readFileSync(manifest, "utf8")).version;
    pass(`installed version ${v}`);
    if (pkg?.dependencies?.["@github/copilot-sdk"] === "latest") {
      warn(`"latest" resolved to ${v} here`, "a different machine can resolve a different version");
    }
  }
}

// --- 3. stdout discipline ---------------------------------------------------

section("stdout discipline");

const sourceFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".mjs") || p.endsWith(".js")) sourceFiles.push(p);
  }
})(EXT_DIR);

const offenders = [];
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    if (/(^|[^.\w])console\.(log|info|debug)\s*\(/.test(line) && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) {
      offenders.push(`${relative(REPO, file)}:${i + 1}`);
    }
  });
}
check(
  offenders.length === 0,
  `no console.log in ${sourceFiles.length} source files`,
  `console.log writes to stdout, which carries JSON-RPC -- this corrupts the stream silently`,
  offenders.join("\n          ") + "\n          Use session.log() instead.",
);

// --- 4. Load it the way the host does --------------------------------------

section("Module load");

register(pathToFileURL(join(HERE, "stub-loader.mjs")));

let loadError = null;
try {
  await import(pathToFileURL(ENTRY).href);
  pass("extension.mjs loads without throwing");
} catch (err) {
  loadError = err;
  fail("extension.mjs threw during load", `${err.code ? err.code + ": " : ""}${err.message}`);
}

const reg = globalThis.__pmpalValidation ?? { canvases: [], sessionOptions: [], logs: [], sends: [] };

if (!loadError) {
  check(reg.sessionOptions.length === 1, "joinSession() was called exactly once", `joinSession() was called ${reg.sessionOptions.length} times`);
}

// --- 5. Canvas contract -----------------------------------------------------

section("Canvas registration");

const declared = reg.sessionOptions[0]?.canvases ?? [];
check(reg.canvases.length > 0, `${reg.canvases.length} canvas(es) created`, "no canvas was created");
check(
  declared.length === reg.canvases.length,
  `all ${reg.canvases.length} passed to joinSession({ canvases })`,
  `${reg.canvases.length} created but ${declared.length} handed to joinSession -- a canvas that is never registered will not appear`,
);

for (const canvas of reg.canvases) {
  const label = canvas.id ?? "(no id)";
  if (!canvas.id) fail("canvas has no id");
  if (!canvas.displayName) fail(`${label}: no displayName`, "the canvas has no label in the Copilot UI");
  if (!canvas.description) warn(`${label}: no description`, "the agent uses this to decide when the canvas is relevant");
  if (typeof canvas.open !== "function") fail(`${label}: open() is not a function`);

  const actions = canvas.actions ?? [];
  if (actions.length === 0) warn(`${label}: registers no actions`);

  const names = new Set();
  for (const a of actions) {
    const an = `${label}.${a?.name ?? "(unnamed)"}`;
    if (!a?.name) fail(`${label}: an action has no name`);
    // The host reserves this prefix for its own built-in canvas verbs.
    else if (a.name.startsWith("canvas.")) fail(`${an}: action names must not start with "canvas." (reserved)`);
    else if (names.has(a.name)) fail(`${an}: duplicate action name`);
    else names.add(a.name);

    if (typeof a?.handler !== "function") fail(`${an}: handler is not a function`);
    if (!a?.description) warn(`${an}: no description`, "the agent is choosing this action blind");

    const schema = a?.inputSchema;
    if (schema) {
      if (schema.type !== "object") fail(`${an}: inputSchema.type must be "object"`);
      for (const req of schema.required ?? []) {
        if (!schema.properties?.[req]) fail(`${an}: "${req}" is required but not defined in properties`);
      }
    }
  }
  if (actions.length && names.size === actions.length) pass(`${label}: ${actions.length} actions, names valid and unique`);
}

// --- 6. The panel actually serves ------------------------------------------

section("Panel");

for (const canvas of reg.canvases) {
  let opened;
  try {
    opened = await canvas.open({});
  } catch (err) {
    fail(`${canvas.id}: open() threw`, err.message);
    continue;
  }

  if (!opened?.url) {
    fail(`${canvas.id}: open() returned no url`, JSON.stringify(opened));
    continue;
  }

  try {
    const res = await fetch(opened.url, { signal: AbortSignal.timeout(5000) });
    const body = await res.text();
    check(
      res.ok && /<html/i.test(body),
      `${canvas.id}: ${opened.url} serves HTML (${res.status}, ${body.length} bytes)`,
      `${canvas.id}: ${opened.url} returned ${res.status}`,
    );
  } catch (err) {
    fail(`${canvas.id}: could not reach ${opened.url}`, err.message);
  }
}

// --- Verdict ----------------------------------------------------------------

console.log(
  `\n${failures === 0 ? "\x1b[32mOK\x1b[0m" : "\x1b[31mFAILED\x1b[0m"}  ` +
    `${failures} failure(s), ${warnings} warning(s)` +
    (failures === 0 ? " -- safe to install.\n" : " -- fix before installing.\n"),
);

process.exit(failures === 0 ? 0 : 1);
