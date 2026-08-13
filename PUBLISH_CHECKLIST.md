# Pre-Publish Checklist

- [ ] Read the full README once from a fresh-user perspective.
- [ ] Confirm every model marked **Lab status: ✅** still returns a real completion.
- [ ] Re-run `./scripts/test-nvidia.sh` and `./scripts/test-omniroute.sh`.
- [ ] Run `./scripts/health-check.sh`.
- [ ] Replace any stale provider/model IDs with IDs returned by the current `/v1/models` endpoint.
- [ ] Confirm no `.env`, API key, auth token, account ID, database, cookie, or credential file is staged.
- [ ] Review every screenshot for usernames, local paths, browser profile data, tabs, account IDs, email addresses and tokens.
- [ ] Confirm all published screenshots are sanitized; this package uses cropped/redacted public-safe copies.
- [ ] Keep the disclaimer that star ratings are field ratings, not scientific benchmarks.
- [ ] Keep the warning that free tiers, quotas and limited-time models can change.
- [ ] Verify the current OmniRoute release and update the `Last verified` line.
- [ ] Verify current OpenCode Zen free models against the official `/zen/v1/models` endpoint/docs.
- [ ] Verify current Oh My OpenAgent install/doctor commands because the project is in a naming transition.
- [ ] Choose and add a LICENSE before publishing if you want others to reuse the guide/scripts.
- [ ] Run `git diff --check` after creating the repository.
- [ ] Run a secret scanner (for example, GitHub secret scanning if available or a local secret scanner) before first push.
