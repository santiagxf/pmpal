# <Feature title>

**Scenario:** <One sentence. What can someone do after this ships that they cannot do today?>

**PM Owner:** <Name (alias)>

**Target Milestone:** <Public Preview | GA>

**Offerings:** <SKU>

## Understand

### Goal

<!-- Rule 1: quantify today's cost. "A workspace of forty models is forty writes."
     "$4M of exposure written as a $100K policy." A Goal with no numbers is a wish. -->

### Who We're Solving For

<!-- Rule 2: one bold persona name, an italic role line, then first-person needs.
     Every need is "I want X, <so | rather than | instead of | without> Y" -- the
     second half carries the reason. A need without a reason is a feature request. -->

**<Persona>**

*<What they do. One or two sentences.>*

- I want <outcome>, so <why it matters>.

### Market Landscape

<!-- What competitors do today and where the gap is. Every external claim needs a
     URL and the date you read it. Uncited claims are assumptions -- label them. -->

## Identify

### Solution

<!-- Rule 3: show the real contract, not pseudocode. Method, path, api-version,
     If-Match. Rule 5: where a declaration could mean two things, resolve it with a
     declaration -> meaning table, not a paragraph. -->

```jsonc
// PUT .../service/{gw}/...?api-version=<version>
// If-Match: {etag from GET}
{
  "properties": {}
}
```

<!-- Rule 6: if anything breaks, say so here:
     > **Breaking change**: <what was valid before and is not now>. -->

#### Write rules

<!-- Rule 4: one bolded assertion per bullet, declarative, unhedged.
     "- **A missing dimension value fails closed** -- the request is rejected." -->

### Hero Scenarios

<!-- Rule 9: group by persona with `#### <Persona>`, then one `##### <what they
     accomplish>` per scenario. Numbered steps. End on what the customer now
     sees, not on a payload. -->

## Execute

### Phasing

<!-- Rule 7: every row states customer value at that phase. A phase that delivers
     nothing to a customer is not a phase. -->

| Phase | Features bundled | Milestone | Customer value at this phase |
|-------|------------------|-----------|------------------------------|
| **Phase 1: <name>** | <what ships> | <milestone> | <what a customer can now do> |
