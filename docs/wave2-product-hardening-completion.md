# Wave 2 Product Hardening Completion

## Status

Wave 2 is a finite product-hardening release slice based on
`main@c6c543af26f2a27f515bd0862a9954235e1a00cc`. It closes safe writing version
restore, Agent operation reliability visibility, narrow Query ownership and
default adoption, Dashboard navigation/retry consistency, and production
release evidence. It does not claim full LangChain-native migration.

## Delivered Scope

### Safe writing version restore

- Restoring history first preserves the current document as a recoverable version.
- The API checks the expected update timestamp and returns `409` when another
  window has changed the document.
- The editor keeps the newer server content and presents a recoverable conflict
  state instead of silently overwriting it.

### Agent operation reliability

- Agent Ops reports execute and rollback reliability separately.
- Pending and indeterminate operations remain visible rather than being counted
  as successes or failures.
- An empty completed sample produces no invented success percentage.
- Recent Receipt samples are explicitly bounded.

### Query ownership and default activation

- Every active Query intent has one named owner; active Legacy Query model calls
  are locked to zero.
- Only deterministic Boundary-owned `query_progress` and positive-ID
  `query_plan_progress` can enter the LangChain commentary path.
- Canonical facts are loaded and rendered deterministically before optional
  Provider commentary.
- The Provider receives only a static protocol and an enum-only projection; it
  never receives the request, workspace text, IDs, names, numbers, or dates.
- Unset configuration now resolves to `langchain/admin` for this narrow path.
- LLM-owned, null-source, unknown-source, unsupported, non-admin, write, and
  compound requests cannot enter this Query Provider path.
- Either `AGENT_QUERY_RUNTIME=legacy` or `AGENT_QUERY_ADOPTION=off` disables it
  on the next request.

### Dashboard and retry consistency

- Plan links remain inside the supported Agent workspace route and open the
  plans inspector instead of producing an invalid Dashboard mode.
- Returning from Memory synchronizes both the selected view and URL.
- Mobile retry preserves earlier persisted history while excluding partial
  assistant output and avoiding a duplicate current user message.
- Browser coverage includes narrow/mobile navigation, partial retry, writing
  version conflict, plan linkage, schedule linkage, and rollback.

### Production protocol and release readiness

- JSON and SSE Agent release checks require exactly one successful terminal;
  `done` must precede it, and no events may follow it.
- The deterministic release Provider accepts streaming only for the exact
  enum-only Query commentary protocol.
- CI exercises the unset Query defaults in a production container rather than
  injecting enabled values.

## Provider Gate

The one-time default-activation Gate ran at
`5ab37485f8fc608ee99e5f4b37ce6d4c9d85b6d1` with the approved static protocol
and 13 enum-only synthetic projections.

- 24/24 observations completed;
- 14 eligible canonical answers completed with 0 factual mismatch;
- 13/13 Provider observations used one logical call and one attempt;
- commentary accepted / omitted: 6 / 7;
- all omissions were bounded first-token timeouts;
- maximum facts loads: 1;
- duplicate calls, boundary failures, unsafe output acceptance, partial output,
  post-Provider Legacy fallback, tool/task execution, and database mutation: 0;
- no raw workspace text, user request, resource ID, numeric fact, date, or free
  text reached the Provider;
- final latency P50 / observed upper tail: 8002 / 8032 ms;
- TTFT P50 / observed upper tail: 5122 / 7918 ms;
- Provider usage and cost: N/A.

The formal safety gate passed. The separate 70% optional-commentary product
threshold did not pass: acceptance was 46.2%. The feature therefore guarantees
the canonical deterministic answer, not commentary availability or an 8-second
latency SLA.

## Verification Evidence

Before default activation:

- complete deterministic baseline passed;
- TypeScript passed;
- lint completed with no errors and 78 pre-existing warnings;
- an isolated PostgreSQL 17 release rehearsal passed migration, checkpoint
  setup, migration verification, idempotent seed, readiness, production build,
  production container, Agent JSON/SSE E2E, Agent smoke, and 20/20 browser flows;
- the rehearsal used a local deterministic Provider and no real Provider calls.

After default activation:

- the focused runtime, boundary, production seam, and CI contract suite passed
  41/41;
- the complete deterministic baseline and TypeScript checks passed;
- lint completed with 0 errors and 78 pre-existing warnings;
- production and migration images built successfully;
- a fresh isolated PostgreSQL 17 database passed all registered migrations,
  checkpoint setup, read-only migration verification, and two idempotent seed
  runs;
- the production container ran with both Query variables unset and passed
  readiness, Agent JSON/SSE E2E, Agent smoke, and 20/20 release browser flows;
- the E2E marker proved default aggregate Query commentary appeared exactly once;
- the local deterministic Provider made no external request;
- all temporary application/database containers, the test network, and the
  local Provider process were removed after verification.

## Commits

- `c185d88` safe historical version restore
- `1151bf9` Receipt reliability visibility
- `c2fb95c` deterministic Query ownership gate
- `b56dd1d` active Legacy Query model ownership retirement
- `489bdd0` Dashboard navigation consistency
- `f7b1888` retry and navigation browser coverage
- `3053793` production protocol seams
- `6950e54` product contract documentation
- `ecc7fb7` production Query commentary gate
- `5ab3748` isolated mobile retry assertions
- `e4d8935` narrow Boundary-owned Query default activation

## Rollback

Operational rollback is immediate and does not require a code deployment:

```text
AGENT_QUERY_RUNTIME=legacy
AGENT_QUERY_ADOPTION=off
```

Either value independently disables new Query commentary work. For code
rollback, use `git revert` in reverse commit order; do not use destructive reset.

## Deferred Work

- L3-D through L3-G Specialist and full LangChain-native migration;
- broader Query allowlists, writes, or compound adoption;
- multi-user RBAC and durable enterprise telemetry/SLOs;
- full mobile redesign, external calendar integration, and full Notion parity;
- dependency vulnerability remediation reported by the current image build.

Legacy compatibility for the narrow Query kill switch remains intentionally
installed. No Router, write workflow, Executor, Receipt, Rollback, Payload
schema, or LangGraph topology was changed by Query default activation.
