# L3-B Known-ID Production Gate Closure Design

## Status

Approved direction: take the shortest path to make the existing six-case
`known_id` contract reachable through the production-seam Gate. This phase
changes only the live-evaluation harness and its deterministic coverage.

It does not authorize a Provider call, Orchestrator adoption, a Runtime-default
change, Prompt or schema changes, fixture changes, business execution, or a
database connection.

## Evidence and Root Cause

At HEAD `a1e0f9c1a5cdc2267c11ff29a8d8d305c3a53106`:

- `L3BProductionGateStage` includes `known_id`.
- `L3B_PRODUCTION_STAGE_CONTRACTS.known_id` contains the six canonical
  `L3B_KNOWN_ID_DIAGNOSTICS` cases and one round.
- `getL3BProductionStageCases("known_id")` returns those canonical objects.
- the production Gate aggregator has explicit `known_id` behavior.
- the existing contract tests pass `5/5`.
- `scripts/agent-production-seam-gate-eval.mjs` derives its accepted stages
  only from `REPORT_PATHS`, which omits `known_id`.
- a no-network preflight therefore exits before module loading with:

```json
{"failureCode":"INVALID_STAGE","preflight":null,"providerAttempts":0}
```

The root cause is a harness-only stage registry mismatch. The product contract
supports `known_id`; the CLI entry point does not.

## Goals

1. Make `known_id` a first-class production-seam Gate stage.
2. Give it a fixed, exclusive, mode-`0600` report path:
   `/tmp/l3b-r8-production-known-id.json`.
3. Preserve the existing clean-HEAD, accepted-config, no-database,
   Provider-approval, budget, report-retention, and fail-closed controls.
4. Add a CLI-level regression test that proves the real entry point reaches a
   ready no-network preflight for all six canonical cases.
5. Obtain the exact logical-call and Provider-attempt authorization budget from
   that preflight before requesting any live-data approval.

## Non-goals

- Do not change the six diagnostics, their contexts, ordering, or expectations.
- Do not change Full or Residual system rules, Structured Output schemas,
  Provider configuration, retry policy, timeout, model, or Gate thresholds.
- Do not modify LangChain or LangGraph business runtime behavior.
- Do not switch the default Orchestrator, Query, Router, or graph configuration.
- Do not enter Draft, Dry-run, Policy, Confirmation, Executor, Receipt, or
  Rollback.
- Do not connect to a database or call DeepSeek during implementation.
- Do not retain raw prompts, responses, arguments, reasoning, errors, stacks,
  workspace values, or secrets.
- Do not overwrite prior Acceptance, Focused, or Stability evidence.

## Considered Approaches

### 1. Extend the existing fixed report-path registry

Add the missing `known_id` entry beside the three existing production stages
and cover the actual CLI preflight. This reuses every current safety boundary,
changes one production mapping, and is the selected shortest path.

### 2. Create a new shared stage-metadata module

Move stage names and report paths into a new TypeScript module consumed by both
the contract and the JavaScript CLI. This could reduce future drift, but it
expands module loading and review scope solely to fix one omitted mapping. It is
not justified in this closure phase.

### 3. Reuse the older all-in-one canary script

The older script reaches Known-ID diagnostics only after a broader Acceptance
matrix. It cannot provide a bounded six-case production-seam Gate and would
repeat already completed Provider work. It is rejected.

## Architecture

The existing contract remains the source of fixture identity, order, rounds,
and stage budget. The CLI continues to derive its accepted stages from its
fixed report-path registry:

```text
known_id
  -> fixed report path
  -> existing preflight controls
  -> getL3BProductionStageCases("known_id")
  -> calculateProductionStageAuthorizedBudget(...)
  -> six production-seam observations
  -> existing sanitized aggregation and exclusive report write
```

The only production change is:

```js
known_id: "/tmp/l3b-r8-production-known-id.json"
```

No parallel schema, fixture list, budget constant, or evaluation path is added.

## Error and Safety Behavior

- Missing flags, wrong HEAD/config, a dirty worktree, an existing report path,
  or a configured database continue to fail before the first Provider attempt.
- Unknown stage names continue to return `INVALID_STAGE`.
- `known_id` preflight derives exactly six observations from canonical
  contract objects.
- Preflight-only mode needs no API key and performs zero Provider attempts.
- Live mode remains impossible until a separate, exact disclosure and request
  budget are approved.
- Report projection and retention checks remain unchanged.

## Deterministic Verification

The regression test must execute the real CLI in preflight-only mode and assert:

- process exit code is zero;
- `preflight.status` is `ready`;
- `preflight.stage` is `known_id`;
- `preflight.observationCount` is `6`;
- fixture IDs and round are canonical and deterministic;
- the report path is `/tmp/l3b-r8-production-known-id.json`;
- the derived logical-call and Provider-attempt maxima are positive and exact;
- `providerAttempts` remains `0`;
- no report file is written in preflight-only mode.

The test must use the current clean HEAD and repository-owned evaluation config
hash. It must not set `DEEPSEEK_API_KEY`, connect to a database, or invoke a
Provider.

After GREEN, run the focused contract/CLI tests, TypeScript typecheck, lint for
the changed files, `git diff --check`, and one manual no-network preflight. A
live Known-ID Gate requires a new explicit user authorization after the final
HEAD, config hash, fixture disclosure, and exact budgets are known.

## Exit Criteria

- the real production-seam CLI accepts `known_id`;
- no-network preflight is ready for the exact six canonical diagnostics;
- Provider attempts remain zero during implementation and verification;
- all focused deterministic checks pass;
- no Prompt, schema, fixture, retry, threshold, runtime-default, or business
  file changes;
- the work is committed independently and not pushed;
- the next action is an explicit six-case Provider authorization request, not
  an automatic live run.
