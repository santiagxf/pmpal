# Site and fleet level quotas

**Scenario:** Attach a quota to a site or fleet and choose whether it applies once at that level or independently to each site or node beneath it, including nodes registered later.

**PM Owner:** Dana Whitfield (dwhitfield)

**Target Milestone:** Public Preview

**Offerings:** Meridian Edge Platform

## Understand

### Goal

Let a fleet owner or engineer write **one** quota on a site or on the fleet, have it govern every node beneath it — including nodes registered later — and choose the level at which the quota applies.

Today a quota attaches to a single node. A site of forty nodes is forty writes, and the forty-first node is ungoverned until someone remembers. A shared cap has no expression at all: per-node limits multiply, so forty nodes at 50 TB each is 2 PB of egress written as a 50 TB quota.

### Who We're Solving For

**Fleet Owner**

*Provisions and manages the fleet. Ensures organization-wide compliance for edge capacity.*

- I want an egress cap that covers the whole fleet, so a site created next month is governed the day it exists rather than the day someone notices it.
- I want to say *each node gets 50 TB* once, instead of writing the same quota into every site.
- I want that cap to be a floor no team can relax, so delegating a site doesn't delegate the budget.

**Site Engineers**

*Add, manage, and publish edge nodes for consumption.*

- I want one quota to cover every node in my site, including the ones I add next week.
- I want to switch between *one shared pool* and *a cap per node* while preserving the same underlying egress configuration.
- I want to narrow a quota to specific nodes — two relays, one region's nodes — without splitting it into per-node writes.
- I want an ambiguous quota rejected on write rather than silently interpreted, so a budget never means something other than what I read.

**Developer**

*Discovers edge nodes from the registry and uses them to build and ship workloads.*

- I want to know which limits apply to the node I'm calling and whether I share that budget with anyone else, so I can size my workload against what I actually get.

### Market Landscape

## Identify

### Solution

Quotas gain an explicit `scope`. A quota written on a site or fleet may apply once at that container level or independently at a level beneath it. A container carries the same `quotas[]` array as any other object:

```jsonc
// PUT .../platform/{fleet}/sites/{site}?api-version=2099-01-01-preview
// If-Match: {etag from GET}
{
  "properties": {
    "quotas": [
        { "type": "egressLimit", "scope": "site", "amount": 50000, "period": "month", "partitionBy": ["tenant"] },
      { "type": "computeLimit", "scope": "node", "count": 10000, "period": "minute", "partitionBy": ["IPAddress"] },
        { "type": "requestRateLimit", "callsPerPeriod": 100, "periodSeconds": 60, "partitionBy": ["tenant"] },
        { "type": "imageScan", "scope": "node", "malwareSeverity": "Medium", "driftSeverity": "Medium", "rootkitSeverity": "High" }
    ]
  }
}
```

No new resource type or collection is introduced, and quotas already written on individual nodes are unchanged.

The `PUT` replaces the whole resource, so the body must carry the quotas read from the preceding `GET`. An entry dropped from a container's array withdraws governance from every node beneath it.

Entries in the array are keyed by `type` and `scope`, so the same quota type may apply at more than one level.

#### `partitionBy` is a dimension set

Each unique combination of values across the listed caller dimensions is a separate counter within one quota instance. **An empty set is one counter at the quota's effective scope.** For a site-scoped quota, that counter is shared by every compatible node in the site. For a node-scoped quota, every node has its own counter.

`partitionBy` is required on counting quotas at container scope, with no default. A limit written on a container is ambiguous until its dimensions are stated, so the write fails rather than guessing. `[]` is a valid value for `partitionBy`.

> **Breaking change**: The scalar form is invalid — `"Tenant"` must normalize to `["tenant"]`.

| Declaration | A 50 TB monthly budget on a site |
|---|---|
| `partitionBy: []` | One pool across every compatible node in the site |
| `partitionBy: ["tenant"]` | Each caller gets 50 TB, spendable across all compatible nodes in the site |

Omitting `scope` is equivalent to `scope: "site"` at site level, `scope: "fleet"` at fleet level, and `scope: "node"` at node level.

#### Dimension vocabulary

| Family | Dimensions |
|---|---|
| Caller | `tenant`, `key`, `ipAddress` |


#### Write rules

- **`scope` is one of `fleet`, `site`, or `node`.** It identifies the level at which independent quota instances are evaluated, not where the quota declaration is stored.
- **`scope` defaults to the attachment level.** A quota attached to a fleet defaults to `fleet`; one attached to a site defaults to `site`; and one attached to a node or relay defaults to `node`.
- **A quota may target its attachment level or a descendant level, never an ancestor.** A fleet attachment accepts `fleet`, `site`, or `node`; a site attachment accepts `site` or `node`; and a node attachment accepts only `node`.
- **Not every quota type supports every scope.** Counting quotas such as `egressLimit`, `computeLimit`, and `requestRateLimit` support container scopes because they define shared state at those levels. Quotas without a shared semantic, including `failover` and `imageScan`, support only `scope: "node"`. They may still be declared on a fleet or site with `scope: "node"`; omitting `scope` on those container attachments is rejected because the default scope is unsupported.
- **A descendant scope creates independent effective quota instances.** `scope: "site"` on a fleet creates one quota instance per site. `scope: "node"` on a fleet or site creates one quota instance per compatible node. Sites and nodes added later receive an instance automatically.
- **The set is unordered and normalized on write.** Reordering a live budget cannot reset it mid-period. Dimension names are case-insensitive — `["IPAddress"]` normalizes to `["ipAddress"]`.
- **A missing dimension value fails closed** — the request is rejected, never counted as unpartitioned.

#### Quota scope

The attachment identifies where the declaration is stored; `scope` identifies where the quota applies. When `scope` is omitted, the two are the same. For example, a 100 GB `egressLimit` attached to a site with no `scope` is one site-level limit consumed by every compatible node in that site.

Setting `scope` to a descendant level applies the same quota independently at every compatible descendant of that level:

```jsonc
{
  "type": "egressLimit",
  "scope": "node",
  "amount": 100,
  "period": "month",
  "partitionBy": []
}
```

When declared on a site, this quota gives every compatible node its own 100 GB limit. It also applies automatically to compatible nodes added later.

Examples:

| Type | Declaration | A 50 TB monthly budget on a site |
|---|---|---|
| `egressLimit` | `scope: "site"`, `partitionBy: []` | One pool across every compatible node in the site |
| `egressLimit` | `scope: "site"`, `partitionBy: ["tenant"]` | Each caller gets 50 TB, spendable across all compatible nodes in the site |
| `egressLimit` | `scope: "node"`, `partitionBy: []` | Each compatible node gets 50 TB |
| `egressLimit` | `scope: "node"`, `partitionBy: ["tenant"]` | Each caller gets 50 TB on each compatible node |

`scope` selects a level, not individual nodes. The quota applies to every compatible node at that level beneath the attachment.

#### Evaluation

Fleet-, site-, and node-scoped quota instances are independent gates evaluated in sequence; a request must pass every counter that applies to it. Gates carrying different dimension sets are not comparable in advance, so none can be named the binding one before evaluation.

**A container quota establishes a floor that no node beneath it can relax.**

### Hero Scenarios

#### Fleet Owner

##### Give every node the same budget

1. On the fleet, the owner writes a node-scoped `requestRateLimit`:

```jsonc
// PUT .../platform/{fleet}?api-version=2099-01-01-preview
// If-Match: W/"0x8DC5F1A2B3C4D5E"     <- ETag from the GET
{
  "properties": {
    "quotas": [
      {
        "type": "requestRateLimit",
        "scope": "node",
        "amount": 100000,
        "period": "month",
        "partitionBy": []
      }
    ]
  }
}
```

2. Every node in the fleet now has its own 100K requests, across every site. A node registered next month gets one on registration — no quota edit, no onboarding step.
3. A site may add a tighter cap of its own; it cannot raise this one. Both gates apply.

#### Site Engineers

##### One shared pool across a site's nodes

1. On the site, the engineer writes one shared quota and leaves `partitionBy` empty. The quota applies to every compatible node in the site:

```jsonc
// PUT .../platform/{fleet}/sites/engineering?api-version=2099-01-01-preview
{
  "properties": {
    "quotas": [
      { "type": "egressLimit", "amount": 1000, "period": "month", "partitionBy": [] }
    ]
  }
}
```

2. Every node in the site draws from the same 1,000 GB, including a node registered tomorrow. Relays are untouched.

##### Switch to a cap per node

1. The engineer changes the `egressLimit` scope to `node`:

```jsonc
{
  "type": "egressLimit",
  "scope": "node",
  "amount": 1000,
  "period": "month",
  "partitionBy": []
}
```

2. Each compatible node now has an independent 1,000 GB quota instance. The quota also applies automatically to compatible nodes registered later.

#### Developer

##### See what applies before building

1. The node's detail page lists the limits in force, where each was written, and whether the budget is the developer's own or shared.
2. A shared pool reads as shared, so the developer sizes a workload against the pool rather than against the number on the quota.

### Execute

#### Phasing

| Phase | Features bundled | Milestone | Customer value at this phase |
|-------|------------------|-----------|------------------------------|
| **Phase 1: Shared counters** | Change `partitionBy` from a scalar to an array of dimensions. Define `partitionBy: []` as one counter at the quota's attachment scope, shared by every compatible node governed by that quota. Reject the scalar form as a breaking contract change. | Public Preview | Customers can express one fleet- or site-level budget shared across all governed nodes, while continuing to partition counters by caller dimensions when needed. |
| **Phase 2: Explicit quota scope** | Introduce `scope` with `fleet`, `site`, and `node` values. Default it to the attachment level and allow declarations to target only that level or a descendant level. | Fast follow | Customers can declare shared fleet or site quotas and independent per-site or per-node quotas using one quota shape. |
| **Phase 3: Node-type discrimination** | Decide whether quotas need an additional property to identify the node types or resources they govern, and define its shape and validation rules if required. | Decision gate | Customers can target quotas where quota-type compatibility and level-based scope are not sufficiently precise, without adding this contract before the need is validated. |
