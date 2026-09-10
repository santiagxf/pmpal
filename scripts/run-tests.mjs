import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");

const wsDir = mkdtempSync(join(tmpdir(), "pmpal-tests-"));
process.env.PMPAL_WORKSPACES_DIR = wsDir;

const testFiles = readdirSync(join(REPO, "tests"))
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => join(REPO, "tests", f));

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
  cwd: REPO,
  env: process.env,
});

try {
  rmSync(wsDir, { recursive: true, force: true });
} catch {
  // best-effort cleanup
}

process.exit(result.status ?? 1);
