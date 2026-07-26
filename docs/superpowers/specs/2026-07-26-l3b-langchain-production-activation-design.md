# L3-B LangChain Production Activation Design

## Status

Approved approach: activate the authoritative LangChain Orchestrator through
an explicit production environment variable after integrating the validated
candidate branch. The source-code default remains Legacy.

This activation does not make the entire Agent LangChain-native. LangGraph
continues to own workflow state, while deterministic code continues to own
facts, resource validation, policy, confirmation, execution, receipts, and
rollback.

## Validated Candidate

The validated runtime candidate is:

```text
phase/l3b-r4a-query-boundary
18882408fdc11a36c65cf47adf79e289e979299b
```

The Production Seam evaluation evidence for this lineage is:

- Focused 15: passed;
- Acceptance 33: passed;
- Known-ID 6: passed;
- Stability 99: passed;
- Stability semantic matches: 99/99;
- Stability usable results: 99/99;
- Stability timeout attempts: 0/102;
- Stability zero-tolerance safety counters: all zero.

The latest Stability report is retained outside the repository at:

```text
/tmp/l3b-r8-production-stability.json
```

## Integration Strategy

At design time, `main` is an ancestor of the validated candidate and is
117 commits behind it. Integration therefore uses a fast-forward from `main`
to the candidate lineage. It must not use selective cherry-picks or synthesize
a parallel implementation.

The existing primary checkout is on an unrelated audit branch and contains an
untracked `outputs/` directory. Integration must occur in the isolated L3-B
worktree and must not modify or remove those user-owned files.

No push is authorized by this design.

## Activation Contract

Production activation is external configuration, not a source-code default
change:

```text
AGENT_ORCHESTRATOR_RUNTIME=langchain
AGENT_GRAPH_RUNTIME=langgraph
AGENT_QUERY_RUNTIME=legacy
AGENT_QUERY_ADOPTION=off
AGENT_ROUTER_SHADOW=off
```

`AGENT_ORCHESTRATOR_SHADOW` must remain unset or use a value other than `1`.

The application must be restarted after changing the environment. Before the
production target is known and its configuration is explicitly authorized,
the repository work only prepares the validated code for activation.

## Runtime and Failure Semantics

An unset `AGENT_ORCHESTRATOR_RUNTIME` continues to resolve to `legacy`.
Explicit `legacy` also resolves to Legacy. Unknown values continue to resolve
to Legacy with a warning.

When explicitly set to `langchain`, the LangChain Orchestrator is
authoritative. A Provider or structured-output failure remains fail-closed and
projects to the existing safe unavailable or clarification behavior. It does
not automatically invoke the Legacy Orchestrator for the same turn.

The bounded Full Orchestrator timeout contract remains:

- first attempt: 30 seconds;
- at most one timeout recovery attempt: 10 seconds;
- total logical-call upper bound: 40 seconds;
- caller cancellation: no retry.

## Rollback

Operational rollback is:

```text
AGENT_ORCHESTRATOR_RUNTIME=legacy
```

followed by an application restart.

Rollback does not require a database rollback, Receipt, or business-data
mutation because activation changes only orchestration selection. Legacy code
must remain present until a later, separately approved retirement phase.

## Verification

After fast-forward integration, run the deterministic baseline without a
database or Provider:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

Verification must also confirm:

- `main` contains the candidate lineage;
- the worktree is clean;
- the runtime default remains Legacy when the environment is unset;
- explicit `langchain` selects LangChain;
- explicit `legacy` provides immediate rollback;
- Query adoption and Router Shadow defaults remain off;
- no Provider call, database connection, task execution, or business mutation
  occurs during integration.

## Non-Goals

- No source-code default switch to LangChain.
- No automatic Legacy fallback inside a LangChain turn.
- No Query Runtime adoption.
- No Router adoption or Shadow enablement.
- No Legacy deletion.
- No Prompt, schema, fixture, Provider, timeout, or retry change.
- No Draft, Dry-run, Policy Guard, Confirmation, Executor, Receipt, Rollback,
  Payload schema, migration, checkpoint, or LangGraph topology change.
- No Provider evaluation.
- No push.

## Exit Criteria

This integration phase is complete when:

1. the written activation contract is committed;
2. `main` is fast-forwarded to the candidate lineage;
3. the deterministic baseline passes on the integrated tree;
4. the worktree is clean;
5. Legacy remains the source-code default;
6. exact production activation and rollback environment values are reported;
7. no external deployment change or push is made without separate authority.
