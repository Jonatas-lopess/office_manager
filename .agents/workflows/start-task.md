---
description: A Git Branch Organizer workflow to start a new feature.
---

# Workflow: Start Task

**Trigger:** `/start-task <description>`

**Steps:**

1. **Name Generation:** Suggest a branch name based on `<description>` (e.g., `feat/ui-refactor`).
2. **User Approval:** Pause and ask: "Should I create the branch [name] and a TODO list?"
3. **Execute (On Approval):**
   - Run `git checkout main` and `git pull`.
   - Run `git checkout -b <name>`.
   - Create a `TODO.md` with a checklist derived from the task description.
4. **Final Check:** Stop and wait for the user to confirm the workspace is ready.

**Constraints:** - You are PROHIBITED from running `git commit`.

- You MUST ask for permission before running any `git` command.
