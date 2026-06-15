# Branch Consolidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all feature branches into `main` so there is one source of truth, then clean up stale branches.

**Architecture:** `codex/latest-integrated` (at `6978fd1`) is already a merge commit that combines `codex/dashboard-content-studio` + `refactor/dashboard-orphan-cleanup` + all of `claude-code/development`. It contains every commit from every other branch. The plan commits the 77-file working-tree diff on `codex/dashboard-content-studio`, merges that into `codex/latest-integrated`, fast-forwards `main` to it, pushes, and prunes the feature branches.

**Tech Stack:** Git CLI only — no build or test steps needed (pure branch operations).

---

## Pre-Flight State

```
Branches (5 local):
  main                              7ca7f5f  origin/main (synced)
  codex/dashboard-content-studio    710407b  HEAD, 77 uncommitted files (+3254/-835)
  refactor/dashboard-orphan-cleanup d2fefa9  dashboard agent workspace updates
  codex/latest-integrated           6978fd1  merge: integrates ALL branches
  claude-code/development           cd3f8fd  origin/claude-code/development (synced)

Worktrees: .worktrees/dashboard-content-studio → codex/latest-integrated
Stashes:   1 on main ("pre-existing working tree changes before style unification")
```

**Key fact:** `codex/latest-integrated` already contains every commit from all other branches. Main is a direct ancestor — it can fast-forward cleanly.

---

### Task 1: Commit uncommitted changes on codex/dashboard-content-studio

**Files:** (77 modified files — already staged as working-tree changes)

- [ ] **Step 1: Review the diff one final time**

```bash
git diff --stat
```

Expected: 77 files, +3254/-835 lines. Spot-check a few files if desired.

- [ ] **Step 2: Stage and commit all changes**

```bash
git add -A
git commit -m "feat: finalize dashboard content studio and agent pipeline integration

Includes writing editor, content API, agent orchestration, rich content
utilities, dashboard UI polish, and schedule/memory/checklist features.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **Step 3: Verify the commit**

```bash
git log --oneline -3
```

Expected: New commit is the HEAD of `codex/dashboard-content-studio`.

---

### Task 2: Update codex/latest-integrated with the new commit

**Files:** No file changes — git merge operation only.

- [ ] **Step 1: Switch to codex/latest-integrated**

```bash
git checkout codex/latest-integrated
```

- [ ] **Step 2: Merge codex/dashboard-content-studio into it**

```bash
git merge codex/dashboard-content-studio -m "merge: incorporate final dashboard content studio changes

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: Fast-forward or simple merge. If conflicts arise (unlikely since it's a direct descendant), resolve them.

- [ ] **Step 3: Verify all branches are now contained**

```bash
echo "=== branches NOT in codex/latest-integrated ==="
for b in main refactor/dashboard-orphan-cleanup codex/dashboard-content-studio claude-code/development; do
  ahead=$(git log codex/latest-integrated..$b --oneline | wc -l | tr -d ' ')
  echo "$b: $ahead commits not merged"
done
```

Expected: `0` for every branch.

---

### Task 3: Fast-forward main to codex/latest-integrated

**Files:** No file changes — git merge operation only.

- [ ] **Step 1: Switch to main**

```bash
git checkout main
```

- [ ] **Step 2: Fast-forward merge**

```bash
git merge codex/latest-integrated --ff-only
```

Expected: `Updating 7ca7f5f..<new-hash>  Fast-forward`

If `--ff-only` fails for any reason, stop and investigate (it shouldn't — main is a direct ancestor).

- [ ] **Step 3: Verify main is at the same commit as codex/latest-integrated**

```bash
git rev-parse main codex/latest-integrated
```

Expected: Both print the same commit hash.

- [ ] **Step 4: Push main to origin**

```bash
git push origin main
```

Expected: `main: 7ca7f5f..<new-hash>`

---

### Task 4: Clean up stale local branches

**Files:** No file changes — branch deletion only.

- [ ] **Step 1: Delete merged feature branches**

```bash
git branch -d codex/dashboard-content-studio
git branch -d refactor/dashboard-orphan-cleanup
git branch -d codex/latest-integrated
```

Expected: `Deleted branch ... (was <hash>).` for each.

`claude-code/development` has a remote tracking branch — decide whether to keep it:

- [ ] **Step 2: Decide on claude-code/development**

Option A (keep): Skip deletion — it tracks `origin/claude-code/development`.
Option B (delete): `git branch -d claude-code/development` (safe since it's merged).

Recommendation: Keep it if the remote is still active; delete if not.

- [ ] **Step 3: Prune remote-tracking refs for deleted branches**

```bash
git remote prune origin
```

Expected: Removes `origin/refactor/dashboard-orphan-cleanup` and any other stale remote refs.

---

### Task 5: Handle stash and worktree

**Files:** No file changes — cleanup only.

- [ ] **Step 1: Handle the stash on main**

```bash
git stash list
```

The stash contains README.md and payload.config.ts doc updates. Options:
- **Apply it:** `git stash pop` (if the changes are still relevant)
- **Drop it:** `git stash drop stash@{0}` (if superseded by committed work)
- **Leave it:** Skip this step

Recommendation: Pop it and review — it's documentation improvements that may still apply.

- [ ] **Step 2: Clean up the worktree**

```bash
git worktree list
```

If the worktree at `.worktrees/dashboard-content-studio` is no longer needed:

```bash
git worktree remove .worktrees/dashboard-content-studio
```

- [ ] **Step 3: Final verification**

```bash
git branch -a
git status
```

Expected: Only `main` (and optionally `claude-code/development`) as local branches. Working tree clean. On `main`.

---

## Post-Consolidation State

```
Branches (1-2 local):
  main                        <new-hash>  origin/main (synced)
  claude-code/development     cd3f8fd     (optional, keep if remote active)

Worktrees: (none)
Stashes:   (none, or 1 popped)
Working tree: clean
```

All features from all branches are now on `main` and pushed to origin.
