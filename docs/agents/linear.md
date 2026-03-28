# Linear Guidance

Use the `linear` CLI (alias `li`) with `--json` by default for Linear work. Only fall back to another integration when the CLI cannot do what is needed.

When implementation work starts on an issue, move that issue to `In Progress`.

When creating a working branch or PR branch for a Linear issue, use the issue's `branchName` from Linear instead of hand-crafting the branch name.

Use conventional commit format for commit messages.

Every commit related to an issue should include the relevant Linear issue ID so Linear links the work automatically.

When the intent is to auto-close an issue on merge, use a closing keyword with the issue ID in the commit message or PR description, for example `Closes LAB-114`.

Prefer putting the closing keyword in the commit-message footer or PR description footer, for example `Completes LAB-114`.

Use the repo commit template at `.gitmessage.txt` and the GitHub PR template in `.github/pull_request_template.md` as the default shapes for commits and PRs.

Do not manually move issues to `Done` when the git and PR integration is expected to update Linear automatically through linked branches, commits, and closing keywords.
