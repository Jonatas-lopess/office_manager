---
description: A Git Branch Organizer that finish and integrate new features.
---

# Workflow: Integrate Feature

**Trigger:** `/finish-task`

**Steps:**

1. **Prerequisite Check:**
   - If any tasks were skipped or deferred, move them to a "Future" section.
   - Scan all modified files for "TODO" comments, console logs, or debug markers you might have left.
2. **Syncing Main:**
   - Run `git checkout main` and `git pull origin main`.
   - Run `git checkout -` (returns to feature branch).
3. **The "Pre-Merge" Rebase/Merge:**
   - Suggest: "Should I merge `main` into your feature branch to ensure there are no conflicts?"
   - **Action:** If approved, run `git merge main`.
   - **Constraint:** If a merge conflict occurs, the agent MUST STOP and say: "Conflict detected in [files]. Please resolve manually before we integrate."
4. **Final Integration Proposal:**
   - Provide a 3-sentence summary of the feature for your merge commit.
   - Ask: "Everything is synced and tested. Should I switch to main and merge this feature branch?"
5. **Cleanup (On Approval):**
   - Run `git checkout main`.
   - Run `git merge --no-ff <feature-branch-name>`.
   - Run `git branch -d <feature-branch-name>` (Deletes the local feature branch).

**Constraints:**

- NEVER run `git push`.
- ALWAYS ask before switching branches or deleting them.
