# PMPal

A GitHub Copilot **canvas extension** for writing Azure AI Gateway product specs —
the research and benchmarking as much as the writing.

The problem it addresses shows up in real specs: a strong, shipped-quality document
with a **completely empty `### Market Landscape` section**. The part of a spec that
needs external research is the part that doesn't get written, because it's the part
that isn't writing.

PMPal puts the spec outline, its readiness rubric, and (from Phase 2) the evidence
behind every external claim into one side panel, and refuses to call a section done
while its claims are unsourced.

---

## Status

**Phase 1 complete** — the Spec canvas, the house-style parser, and the rubric.
46 tests passing.

| | |
|---|---|
| ✅ Phase 1 | House template, parser, 13-rule rubric, workspace state, confidentiality layer, Spec canvas |
| ⬜ Phase 2 | Benchmark + Discovery canvases; the cited-evidence research loop |
| ⬜ Phase 3 | Positioning canvas; generated Market Landscape; export to the specs repo |

Phase 1 has not yet been run inside the Copilot desktop app — see
[Verifying it live](#verifying-it-live).

---

## Install

The extension is discovered from `.github/extensions/`, so cloning this repo into a
workspace you open with Copilot is most of the install. **The dependency step is not
optional** — `node_modules/` is git-ignored, so a fresh clone cannot load until you run:

```bash
npm install --prefix .github/extensions/pmpal   # pulls @github/copilot-sdk
npm run validate                                # confirm it will load
```

`npm run validate` must print `OK ... safe to install`. Then, in the Copilot app:
**Customize → Canvas → PMPal Spec**.

Don't use `copilot plugin install` yet — it stores files under `installed-plugins/`,
which may not participate in `extension.mjs` discovery
([copilot-cli#3023](https://github.com/github/copilot-cli/issues/3023)).

## Troubleshooting: it fails to load and there's nothing in the logs

That is the expected symptom of *every* load-time crash, and it is worth understanding
because it will happen again.

The host forks `extension.mjs` as a child process and speaks JSON-RPC over its **stdout**.
Anything that throws while the module is loading writes to **stderr** — which the host
discards. So the extension simply never appears, with no error anywhere. A missing
`node_modules/` produces exactly this: `ERR_MODULE_NOT_FOUND` on stderr, silence in the UI.

GitHub documents no pre-install check, no log file, and no troubleshooting path for this.
So run the preflight instead:

```bash
npm run validate
```

It does what the host does, where you can see it:

| Check | Catches |
|---|---|
| `extension.mjs` present, `type: module`, `main` correct | the file the host looks for isn't there |
| `@github/copilot-sdk/extension` resolves | **the missing-`node_modules` silent death** |
| no `console.log` in any source file | stdout writes that corrupt the JSON-RPC stream |
| loads `extension.mjs` against a stubbed SDK | any throw during module load |
| `joinSession()` called once, with every canvas | a canvas created but never registered |
| action names unique, no reserved `canvas.` prefix | actions the host silently rejects |
| `inputSchema` is an object; every `required` key exists | schemas the agent can't call |
| `open()` returns a URL that serves HTML | a dead panel |

The stub (`scripts/sdk-stub.mjs`, swapped in by a module resolution hook) exists because
the real `joinSession()` throws unless the process was forked by the Copilot CLI — so
`node extension.mjs` can never get past it on its own.

## Use

Talk to the agent; watch the panel.

> *"Start a spec for gateway-level rate limit inheritance. I'm the PM owner, target
> Public Preview."*

The panel then shows each section's status and every rubric finding. Four buttons hand
structured work back to the agent: **Draft Market Landscape**, **Sharpen the Goal**,
**Fix blocking findings**, and **Critique this spec** — the last of which asks the agent
to review as a demanding reader rather than a supportive one, and to log open questions
instead of rewriting.

Your spec lives at `workspaces/<slug>/spec.md` as plain, committable markdown.
`export_spec` writes it wherever you want, matching the
`specs/<date>-<slug>/spec-<name>.md` convention. It refuses while blocking findings
remain unless you pass `force`.

## What the rubric checks

Thirteen rules derived from a real spec, not from a generic PRD notion — a Goal that
quantifies today's cost, first-person needs that carry a reason, real API contracts
rather than pseudocode, bolded write rules, phasing rows that state customer value.

Each is documented with a worked example in **[docs/HOUSE-STYLE.md](docs/HOUSE-STYLE.md)**,
which is itself checked by `tests/docs.test.mjs` so it can't drift from the code.

The calibration target: `tests/fixtures/house-style-sample.md` must produce **exactly
one** blocking failure — the empty Market Landscape. More would mean the rubric is over-strict and wrong about
the house style; fewer would mean it isn't checking anything. A blank template scores
4/13, so the template's own guidance text can't fake a finished spec.

## Confidentiality

The specs PMPal is built for are confidential before they ship, and Market Landscape —
the one section that wants to search the web — is exactly where that leaks. Handling
that is the point of the tool.

**This repository is public and contains no unreleased product detail.** The rubric was
calibrated against a real internal spec; the fixture checked in here,
`tests/fixtures/house-style-sample.md`, is a fictional stand-in — same structure, same
sentence shapes, same voice, invented product. Keep it that way: no real contract,
milestone, or `api-version` belongs in this repo. Your own drafts live in
`workspaces/`, which is git-ignored.

Outbound research prompts are **constructed, never interpolated**. `research_competitor`
assembles a query from a fixed vendor list and a generic capability vocabulary; no text
from your spec is ever placed into one, and an unknown vendor is refused rather than
passed through. A second layer rejects any four-consecutive-word window shared with
internal-flagged content.

The defence is construction, not filtering — a filter you can describe is a filter that
can be evaded.

---

## Layout

```
.github/extensions/pmpal/
  extension.mjs        canvas registration + actions (the only SDK-aware file)
  lib/
    template.mjs       parse ⇄ serialize house-style markdown, losslessly
    rubric.mjs         the 13 rules
    state.mjs          workspace on disk: spec.md + JSON sidecars
    confidential.mjs   whitelist prompt construction + leak assertion
    server.mjs         loopback HTTP + SSE for the panel
    actions.mjs        the logic behind the canvas actions
    ui/spec.mjs        the panel document
scripts/validate.mjs   preflight: load + registration + panel checks
templates/spec-template.md
docs/HOUSE-STYLE.md
workspaces/<slug>/     spec.md, evidence.json, benchmark.json, state.json
tests/
```

**Markdown is the source of truth.** `spec.md` is always a valid house-style document;
the JSON sidecars hold only what markdown can't express (citation dates, confidence,
section status). If PMPal disappears, you still have your spec.

Everything under `lib/` except `extension.mjs` is plain Node with no SDK import. The
canvas API is `@experimental` and will change; when it does, one file breaks.

## Develop

```bash
npm test                       # 46 tests, no SDK install needed
npm run validate               # preflight the extension against a stubbed SDK
```

The rubric, parser, confidentiality layer, and HTTP surface are all testable without the
Copilot runtime. `extension.mjs` is a thin adapter over `lib/actions.mjs`, so the tests
exercise the same code path the canvas actions do.

**Never call `console.log` in the extension** — stdout carries JSON-RPC and writing to it
corrupts the stream silently. Use `session.log()`.

## Verifying it live

Requires the Copilot desktop app:

1. `extensions_manage({ operation: "list" })` — confirm `pmpal` is discovered.
2. `extensions_reload({})` after edits (extensions also reload on `/clear`).
3. Open **PMPal Spec**; ask the agent to start a spec; confirm sections appear in the
   panel and `spec.md` lands on disk.
4. `run_rubric` — confirm it blocks on the unsourced Market Landscape.
