# Workflow Guidance

Do not make git mutations like `git add`, `git commit`, `git push`, or similar review-advancing steps unless the user explicitly asks for them or a requested workflow specifically requires them.

Prefer repo commands over tool-specific one-offs:
- `pnpm check` for Biome autofix
- `pnpm test` for unit tests
- `pnpm build` for production verification
- `pnpm qc` for the combined quality pass
- `pnpm commit:check` to validate recent commit messages

Keep workflow guidance here focused on repo habits. Linear-specific process belongs in [linear.md](./linear.md).

If you want Git to prefill the repo's commit template locally, run `git config commit.template .gitmessage.txt`.
