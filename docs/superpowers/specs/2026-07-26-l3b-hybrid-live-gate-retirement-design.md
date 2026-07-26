# L3-B Hybrid Live Gate Retirement Design

## Status

Approved approach: retire the obsolete one-time Hybrid focused live entry and
make the Production Seam Gate the only executable L3-B Provider gate.

This phase is deterministic only. It does not call a Provider, connect to a
database, change the default runtime, or adopt LangChain decisions.

## Problem

The historical R4 Hybrid focused gate freezes a four-fixture, three-round
contract and describes itself as a one-time evaluation. Its executable script
accepts a generic data-approval flag plus an exact Git HEAD, then loads
Provider-capable modules before validating the old preflight.

The current runtime deliberately changed the evaluation configuration and
Residual Planner protocol. The historical frozen hashes therefore reject the
current contract. Refreshing those literals would make the old live entry
executable again even though it lacks the exact disclosure-manifest binding
now required by the Production Seam Gate.

## Decision

Do not refresh the historical Hybrid frozen hashes.

Keep the old script path as a compatibility tombstone, but make it terminate
immediately with the typed code `HYBRID_FOCUSED_GATE_RETIRED`. The terminal
record must be sanitized, report `providerAttempts: 0`, and identify
`production_seam_focused` as the replacement. It must terminate before reading
an API key, checking live-approval flags, loading model/evaluation modules, or
creating a report.

The historical preflight assertion becomes a fail-closed retirement boundary.
Calling it always throws the typed retirement code before comparing any frozen
hash. The historical runner continues to call that assertion before its
evaluation loop, which proves that no evaluation callback can start.

The following product code remains active and unchanged:

- deterministic Query Boundary;
- Hybrid Composer and Candidate Validator;
- production Hybrid evaluator and observation classification;
- Full and Residual LangChain planners;
- report sanitization and model-call authorization;
- Legacy runtime and all default feature flags.

The Production Seam Gate `focused` stage is the sole executable replacement.
It retains the current five-fixture, three-round contract, exact disclosure
manifest, current Full/Residual fingerprints, fixed report path, and pre-call
logical/Provider ceilings.

## Compatibility Boundary

The old filenames remain present so an operator or automation receives an
explicit safe retirement result instead of a missing-file or ambiguous error.
No compatibility path may redirect automatically into the Production Seam
Gate, because that would bypass the replacement gate's explicit stage,
manifest, HEAD, budget, and data-disclosure approval.

Historical fixture definitions, report readers, and aggregation helpers may
remain where current deterministic tests or production evaluation reuse them.
They must not constitute a second executable live path.

## Error and Data Handling

The retired script emits only bounded metadata:

```json
{
  "errorCode": "HYBRID_FOCUSED_GATE_RETIRED",
  "passed": false,
  "providerAttempts": 0,
  "replacement": "production_seam_focused"
}
```

It exits non-zero. It does not emit fixture text, workspace context, prompts,
schemas, responses, reasoning, secrets, stack traces, or resource IDs.

The preflight error class adds `HYBRID_FOCUSED_GATE_RETIRED` to its typed code
union. The error message is exactly the code and has no cause or raw detail.

## Deterministic Test Contract

Tests must prove:

1. the old script returns the typed retirement terminal without approval
   flags or an API key;
2. the script performs zero Provider attempts and does not import
   Provider-capable production evaluation modules;
3. the old preflight assertion always rejects with the retirement code;
4. the old runner invokes zero evaluation callbacks;
5. no test refreshes or treats the historical frozen hashes as current;
6. the Production Seam focused stage remains 15 ordered observations;
7. the Production Seam manifest remains the only live disclosure contract;
8. `tests/TEST_MAP.md` marks the old live entry as historical/superseded;
9. default Orchestrator runtime remains `legacy`;
10. no Provider, database, task execution, or business mutation occurs.

Run the focused retirement and Production Seam contract tests first, followed
by typecheck, the standard deterministic Agent/planning/schedule/content
suites, lint, and `git diff --check`.

## Non-Goals

- No Provider call or live report.
- No new dependency.
- No Prompt, schema, fixture, retry, timeout, threshold, or model change.
- No update to historical Hybrid frozen hashes.
- No change to Production Seam manifests or stage sizes.
- No default runtime switch or LangChain adoption.
- No deletion of Legacy Router, Legacy Orchestrator, compatibility facade, or
  business execution paths.

## Exit Criteria

The phase is complete when the old Hybrid live entry is provably
non-executable, the Production Seam focused stage is the only live path, all
listed deterministic checks pass, the worktree is clean, and the change is in
an independent commit.

After this phase, generate fresh no-network Production Seam manifests on the
final HEAD. Each Provider stage still requires a separate exact disclosure
approval before any live request.
