# Production Dead-Code Retirement Design

**Date:** 2026-07-27

**Status:** Approved design awaiting written-spec review

## Goal

Audit all tracked production code, prove which code is unreachable or no longer
part of the authorized product contract, and delete only those confirmed
candidates without weakening SunnyPanel's current behavior or safety
boundaries.

The explicitly authorized retirement includes the top-level
`AGENT_GRAPH_RUNTIME=legacy` emergency rollback path. It does not authorize
blanket deletion of every module, option, or comment containing the word
`legacy`.

## Docs Reviewed

- `docs/README.md`: defines `docs/` as the VibeCoding constraint pack.
- `docs/product-map.md`: defines P0 product surfaces and read/write boundaries.
- `docs/feature-index.md`: protects P0 workflow behavior from cleanup-driven
  regression.
- `docs/agent-workflow-v1.md`: freezes Draft, Dry-run, Policy Guard,
  confirmation, execute, receipt, and rollback contracts.
- `docs/safety-model.md`: defines protected deterministic and data-safety
  boundaries.
- `docs/system-architecture.md`: defines runtime, persistence, and guarded Query
  ownership.
- `docs/query-runtime-v1.md`: requires the guarded Query Legacy path and its
  current default-off adoption gates.
- `docs/testing-strategy.md`: defines protected test groups and verification
  layers.
- `tests/TEST_MAP.md`: records protected runtime, workflow, Query, planning, and
  schedule contracts.

## Docs Conflicts

`docs/query-runtime-v1.md` explicitly says Query Legacy removal is not
authorized and remains required when the guarded Query adoption gate rejects.
This does not conflict with retiring the separate top-level
`AGENT_GRAPH_RUNTIME=legacy` graph rollback switch.

Resolution:

- Retire only the top-level graph runtime rollback path explicitly authorized
  by the user.
- Preserve `AGENT_QUERY_RUNTIME=legacy`, Query gate rejection behavior,
  `AGENT_REQUIRE_LLM` compatibility behavior, Orchestrator runtime gates, and
  other still-contracted compatibility paths unless the reachability audit
  proves that a particular implementation is independent of those contracts.
- Classify code by its real caller and product responsibility, never by the
  presence of `legacy` in its name.

## Scope

### Included

- Tracked production TypeScript and JavaScript under `src/`.
- Production entrypoints and configuration in `package.json`,
  `payload.config.ts`, `next.config.ts`, and `.env.example`.
- Tracked scripts when they are production, build, deployment, migration
  invocation, or verification entrypoints.
- Stale configuration branches and documentation statements that describe the
  retired top-level graph rollback switch.
- Exports, files, and dependencies proven unreachable from every valid
  production root.

### Excluded and Protected

- `src/migrations/**` and all database migration history.
- Framework-generated files and generated type/import-map output.
- Tests and test fixtures as independent deletion candidates.
- `outputs/**`, which is currently untracked and user-owned.
- `docs/**`, `CLAUDE.md`, `CLAUDE.*`, and `.claude/**` as deletion candidates.
- Nested local worktrees under `.claude/**`.
- Payload schema and database structure unless a separate explicit request
  authorizes them.
- Protected safety, workflow, Query, planning, schedule, receipt, rollback, and
  checkpoint behavior.

Documentation may be updated when necessary to remove a false instruction
about the retired top-level graph rollback switch, but no VibeCoding-related
document may be deleted.

Tests may be updated only where a confirmed production deletion invalidates an
obsolete assertion. Protected tests may not be deleted or weakened. Any removed
test assertion must have replacement coverage for the current path.

## Production Roots

The audit will construct reachability from these roots:

- Next.js App Router conventions: routes, layouts, pages, error/loading
  boundaries, metadata, and route handlers.
- Payload configuration, collections, globals, hooks, access functions, admin
  components, and import-map references.
- `package.json` scripts and their transitive imports.
- Explicit static and dynamic imports.
- Configuration-selected modules, registries, and string-keyed dispatch tables.
- Build, deployment, checkpoint setup, seed, smoke, and supported evaluation
  scripts.

A file with no ordinary static import is not dead when a framework convention,
registry, dynamic import, script entrypoint, configuration value, or side
effect loads it.

## Evidence Standard

A deletion candidate must satisfy all applicable conditions:

1. It is unreachable from all production roots after accounting for static
   imports, dynamic imports, registries, framework conventions, and scripts.
2. It is not required by an approved current product, safety, compatibility, or
   operational contract.
3. It is not a migration, generated artifact, VibeCoding document, test
   fixture, or user-owned untracked file.
4. Repository-wide search finds no string-keyed, environment-gated,
   reflection-based, or documentation-defined production entry.
5. Removing it leaves type checking and lint structurally valid.
6. Relevant targeted tests and the applicable full verification matrix pass.

Zero textual references alone are insufficient evidence.

## Audit and Deletion Flow

### 1. Baseline

- Record Git status and preserve unrelated changes.
- Run a fresh type-check baseline and capture any pre-existing failure.
- Inventory production roots, runtime switches, registries, dynamic imports,
  and package scripts.

### 2. Candidate Generation

- Use TypeScript and ESLint unused-symbol results for local identifiers.
- Build a file/export import graph for whole-file and unused-export candidates.
- Search configuration, environment, string registries, framework conventions,
  and script entrypoints to eliminate false positives.
- Group survivors by confidence and subsystem.

### 3. Candidate Classification

Each candidate receives one disposition:

- **Delete:** proven unreachable and outside every current contract.
- **Retain:** reachable, framework-discovered, dynamically loaded, or required
  by a current contract.
- **Defer:** evidence is incomplete, behavior is shared, or safe removal would
  require a separate migration.

Only **Delete** candidates are modified.

### 4. Top-Level Graph Legacy Retirement

- Remove the `AGENT_GRAPH_RUNTIME=legacy` selection from the top-level graph
  runtime configuration.
- Make the LangGraph full adapter the sole top-level Agent graph runtime.
- Remove dispatcher and handler branches used exclusively for that top-level
  rollback mode.
- Delete only modules and exports that become unreachable solely because of
  this retirement.
- Preserve shared conversation persistence, session coordination, safety
  gates, Query compatibility, confirmation, receipts, rollback, checkpoint,
  Activity, and Trace behavior.
- Remove the retired switch from `.env.example` and update non-VibeCoding
  operational instructions that would otherwise tell operators to use it.

### 5. General Dead-Code Deletion

- Delete in small subsystem-scoped batches.
- Re-run references, type checking, and targeted tests after every batch.
- Stop and reclassify a candidate if removal exposes a hidden contract or
  requires unrelated refactoring.
- Do not introduce a new dependency solely for permanent runtime behavior.

### 6. Final Verification

Run fresh:

```text
npm run typecheck
npm run lint
npm run test:agent
npm run test:agent:planning
npm run test:agent:schedule
npm run test:content
npm run build
git diff --check
```

Environment-dependent checkpoint, smoke, or browser tests are added only when
the changed code path requires them and a safe local environment is available.
Any environmental blocker is reported separately from code regressions.

## Safety and Data Impact

- No Payload collection or field changes.
- No migration creation, deletion, or rewrite.
- No database writes are part of the audit.
- No change may bypass Draft, Dry-run, Policy Guard, confirmation, execute,
  receipt, or rollback.
- No change may weaken Query read-only isolation or Provider data minimization.
- No change may alter checkpoint namespace, pending resume semantics, event
  replay, receipt idempotency, or rollback consistency unless separately
  reviewed and authorized.

## Success Criteria

- Every deleted production file/export has concrete reachability and contract
  evidence.
- The top-level `AGENT_GRAPH_RUNTIME=legacy` rollback is fully retired with no
  stale production selector or operator instruction.
- Still-contracted Query and deterministic safety paths remain reachable and
  covered.
- No protected VibeCoding document, migration, generated artifact, protected
  test, or `outputs/` file is deleted.
- The final diff contains no unrelated cleanup.
- All applicable fresh verification passes, or any blocker is precisely
  separated from regressions and leaves the affected deletion unclaimed.
