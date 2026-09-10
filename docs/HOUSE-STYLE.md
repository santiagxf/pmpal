# The house style

This is the voice of the AI Gateway spec, reverse-engineered from a real
shipped spec and encoded as mechanical checks in
[`lib/rubric.mjs`](../.github/extensions/pmpal/lib/rubric.mjs).

Every rule below is illustrated with a line from `tests/fixtures/house-style-sample.md`,
the golden fixture the rubric is calibrated against. That fixture is a **redacted
stand-in**: the real spec it was derived from is Microsoft-confidential, so the
product is fictional while the structure, the sentence shapes, and the voice are
reproduced exactly. Each rule names the rubric id that enforces it, so a finding
in the panel traces back to a paragraph here.

**Severity.** `blocking` rules gate `export_spec`; `advisory` rules are reported
and ignored. A rule is only blocking when a machine can tell right from wrong
without taste. Judging whether a Goal is *the right* goal is your job. Judging
whether it contains a number is the rubric's.

---

## The shape

```
# <Feature title>

**Scenario:** / **PM Owner:** / **Target Milestone:** / **Offerings:**

## Understand      what is true today and who is hurt by it
### Goal
### Who We're Solving For
### Market Landscape

## Identify        what we are going to do about it
### Solution
### Hero Scenarios

## Execute         how it lands
### Phasing
```

Understand → Identify → Execute is the argument. Understand earns the right to
propose; Identify earns the right to schedule. A Solution written before the Goal
quantifies anything is a solution looking for a problem.

`metadata-complete` (blocking) requires all four metadata keys.
`sections-written` (blocking) requires every section above to hold real content —
template guidance comments and unfilled `<placeholders>` are stripped before the
check, so a fresh template scores 4/13, not 9/13. `no-placeholders` (blocking)
catches leftover slots anywhere in the document.

---

## Rule 1 — The Goal quantifies today's cost

> Today a quota attaches to a single node. **A site of forty nodes is forty
> writes**, and the forty-first node is ungoverned until someone remembers. A
> shared cap has no expression at all: per-node limits multiply, so **forty nodes
> at 50 TB each is 2 PB of egress written as a 50 TB quota**.

Two numbers, and they do different work. *Forty writes* measures toil. *2 PB
written as 50 TB* measures danger — it's the sentence that makes this urgent
rather than nice. Neither is a benchmark; both are arithmetic on the current
product.

A Goal with no number is a wish. It can't be argued with, so it can't be
prioritised against anything.

`goal-quantified` (blocking) — the Goal must contain a digit.

---

## Rule 2 — Persona needs are first-person and carry a reason

> - I want an egress cap that covers the whole fleet, **so** a site created next
>   month is governed the day it exists **rather than** the day someone notices
>   it.
> - I want an ambiguous quota rejected on write **rather than** silently
>   interpreted, **so** a budget never means something other than what I read.

Every need is `I want X, <so | rather than | instead of | without> Y`. The first
half is the ask; the second half is why it matters. Drop the second half and you
have a feature request with a persona's name on it — and no way to tell whether a
different feature would serve the same person better.

The `rather than` construction is the sharpest of the four, because it names the
alternative being rejected. *Rejected on write rather than silently interpreted*
is a design decision hiding in a user need.

Personas get a bolded name and an italic role line:

> **Fleet Owner**
>
> *Provisions and manages the fleet. Ensures organization-wide compliance for
> edge capacity.*

`needs-first-person` (blocking) — every bullet under Who We're Solving For must
start in first person, contain a reason marker, and run to at least eight words
after placeholders are stripped. The length floor exists because
`- I want <outcome>, so <why it matters>.` is structurally perfect and says
nothing.

---

## Rule 3 — The Solution shows the real contract

> ```jsonc
> // PUT .../platform/{fleet}?api-version=2099-01-01-preview
> // If-Match: W/"0x8DC5F1A2B3C4D5E"     <- ETag from the GET
> ```

Method, path, `api-version`, and the concurrency header. Not pseudocode, not
`POST /quotas`. The `If-Match` line is doing real work: it says this is a
read-modify-write on a versioned resource, which is a fact an implementer needs
and a paragraph would have buried.

Real payloads also catch design errors early. You cannot write the JSON for a
half-decided contract.

`solution-has-contract` (blocking) — the Solution must contain a fenced block
with an `api-version=` bearing an actual value.

---

## Rule 4 — Write rules are bolded assertions

> - **A missing dimension value fails closed** — the request is rejected, never
>   counted as unpartitioned.
> - **The set is unordered and normalized on write.** Reordering a live budget
>   cannot reset it mid-period.
> - **`scope` defaults to the attachment level.** A quota attached to a fleet
>   defaults to `fleet`; one attached to a site defaults to `site`.

One rule per bullet. The bolded clause is the whole rule, standing alone. The
sentence after it explains or bounds — it never introduces a second rule.

This is the section an engineer reads at 4pm on a Thursday to answer one
question. Bolding the assertion means they can scan for it. Burying it in the
second half of a sentence means they can't.

`write-rules-bolded` (blocking) — every bullet under `#### Write rules` must open
with `**bolded text**`.

---

## Rule 5 — Ambiguity is resolved with a table, not a paragraph

> | Declaration | A 50 TB monthly budget on a site |
> |---|---|
> | `partitionBy: []` | One pool across every compatible node in the site |
> | `partitionBy: ["tenant"]` | Each caller gets 50 TB, spendable across all compatible nodes |
> | `scope: "node"`, `partitionBy: []` | Each compatible node gets 50 TB |

Where one declaration could mean two things, enumerate. The left column is
exactly what someone types; the right column is exactly what they get. Prose
describing a combinatorial space always leaves a cell unwritten, and the
unwritten cell is the bug.

Note the header: *A 50 TB monthly budget on a site* fixes the scenario so every
row varies only the declaration.

`ambiguity-table` (blocking) — the Solution must contain a table. This is the
strictest rule in the set, and it is blocking on purpose: enumerating is the
house style's most distinctive move, and the specs that skip it are the ones that
generate review questions. If a Solution genuinely has no combinatorial contract,
`export_spec({ force: true })` is the escape hatch — a deliberate override, not a
silent pass.

---

## Rule 6 — Breaking changes are blockquoted

> **Breaking change**: The scalar form is invalid — `"Tenant"` must normalize to
> `["tenant"]`.

One line, set apart, saying what was valid before and is not now. It sits
directly under the design it breaks, not in an appendix, because the reader who
needs it is the one reading that paragraph.

`breaking-change-callout` — severity is conditional. A spec that never says
"breaking change" passes advisory. A spec that mentions one in prose without the
blockquote form fails **blocking**: you knew, and you buried it. The rule cannot
detect a breaking change you didn't disclose at all.

---

## Rule 7 — Every phasing row states customer value

> | **Phase 1: Shared counters** | Change `partitionBy` from a scalar to an array
> of dimensions… | Public Preview | Customers can express one fleet- or site-level
> budget shared across all governed nodes, while continuing to partition counters
> by caller dimensions when needed. |

The fourth column is the point of the table. *Features bundled* is what we build;
*customer value at this phase* is what someone can now do. A phase that delivers
nothing to a customer is not a phase — it's a work breakdown, and it belongs in
the engineering plan.

Phase 3 in the fixture is exemplary because its milestone is `Decision gate` and
its value is *"Customers can target quotas… without adding this contract before
the need is validated."* Deliberately not building something, on the record, is a
legitimate phase outcome.

`phasing-customer-value` (blocking) — every row needs a non-empty fourth column
with real words in it.

---

## Rule 8 — No hedging

> A limit written on a container is ambiguous until its dimensions are stated, so
> **the write fails rather than guessing**.

Not *the write may be rejected*. Not *we would likely reject*. The spec is the
decision; if it hedges, the decision hasn't been made and the section isn't
ready.

The check is deliberately narrow. Bare *may* is **not** flagged, because the
house style uses it correctly for permission:

> **A quota may target its attachment level or a descendant level, never an
> ancestor.**

That's a contract statement about what callers are allowed to do. Flagging it
would train you to ignore the rule. `no-hedging` (advisory) targets only
constructions that soften a commitment — *might*, *probably*, *we think*, *should
be able to*, *may be able to*.

---

## Rule 9 — Hero Scenarios end on what the customer sees

Grouped by persona at `####`, one scenario each at `#####`, numbered steps.

> 2. A shared pool reads as shared, so the developer sizes a workload against the
>    pool rather than against the number on the quota.

The last step is the payoff, and it's written from the customer's side of the
API. Ending on *"the PUT returns 200"* describes the system succeeding. Ending on
*"the developer sizes a workload against the pool"* describes the person
succeeding — which is the thing the phase was justified by.

`hero-scenario-outcome` (blocking) — every scenario needs numbered steps and a
final step that reads as an outcome rather than a payload.

---

## Rule 10 — Market Landscape is cited or it is labelled

This rule is not derived from the fixture. It's derived from the fixture's
**empty `### Market Landscape` section** — the one part of a strong spec that
research, not writing, was needed for, and so the part that didn't get written.

Every external claim carries a URL and the date it was read. Vendor behaviour
changes between your reading and your reviewer's; an undated citation is an
assertion with a link stapled to it.

Anything you cannot source is written as an explicit assumption to validate, not
as a fact. That is a real option, not a failure — a labelled assumption is
honest, and it tells the reader exactly which sentence to challenge.

`market-landscape-sourced` (blocking) — the section must be non-empty and must
carry either a URL or an explicit assumption label. `add_citation` refuses a
claim with no `url` or no `accessed` date, so the evidence sidecar cannot fill up
with undated links.

---

## Confidentiality

The specs PMPal is built for are confidential before they ship, and Market
Landscape — the one section that wants to search the web — is exactly where that
leaks. The guardrails below are a feature of the tool, not a disclaimer on this
repository, which is public and holds no unreleased product detail.

Outbound research prompts are **constructed, never interpolated**. `research_competitor`
assembles a query from a fixed vendor list and a generic capability vocabulary in
[`lib/confidential.mjs`](../.github/extensions/pmpal/lib/confidential.mjs); no
text from your spec is ever placed into one. An unknown vendor or capability is
refused rather than passed through. `assertNoLeak` is a second layer that also
rejects any four-consecutive-word window shared with internal-flagged content.

The defence is construction, not filtering — a filter you can describe is a
filter that can be evaded. Mark roadmap detail with `add_open_question({ internal: true })`
and `export_spec` will warn before that content leaves the workspace.
