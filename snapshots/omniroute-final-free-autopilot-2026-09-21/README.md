# Certified candidate snapshot — OmniRoute Free Autopilot (2026-09-21)

Preserved **before** live promotion. This directory contains the complete certified
candidate as reviewable Git patches plus its provenance.

## Provenance

- UPSTREAM_BASE_SHA=dea6bb8b6b64d3a3d9f639a044625c3452442c56
- R1_SHA=864ddc1d57871827ab2be3a9235bab5f8c12bc48
- R2_SHA=af44c10b595cbe36d3e1168a9918d7f857ce5862
- R3_SHA=309ae65f6976947ec74ac5998343d92ddf4e755e
- R4_SHA=f7f739e661919452bd0fe8355e629ef223a33d51
- FINAL_SOURCE_HEAD=7e5a2d80b23ea2e10b588581236abad1614a04a7
- FINAL_SOURCE_TREE=e83f412187bf46256fbe5429a6a80e85a16acb8e
- CERTIFICATION_COMMIT=bd994e3c1b8dd0c887fc6d988b785a083b753e3a

Snapshot branch: `final/free-autopilot-2026-09-21`
Snapshot branch HEAD: `bd994e3c1b8dd0c887fc6d988b785a083b753e3a`
Snapshot branch tree: `45a9effd3418a4128cf975aec249e84ad7af51c7`

> `SOURCE_TREE.txt` holds the tree hash of the snapshot branch HEAD.
> `FINAL_SOURCE_TREE` above is the tree of the **certified source** commit
> `7e5a2d80b` (the commit that was built and certified; the certification report
> commit `bd994e3c1` only adds documentation on top of it).

## Contents

- `FINAL.patch` — `git format-patch --stdout dea6bb8b6b64d3a3d9f639a044625c3452442c56..HEAD`
  (all 11 commits as one reviewable diff, commit messages included)
- `series/` — the same commits as 11 individual patches (`0001` … `0011`)
- `COMMITS.txt` — branch name, HEAD SHA and the exact 11-commit list
- `SOURCE_TREE.txt` — tree hash of the snapshot branch HEAD

## Scope / exclusions

No `node_modules`, `dist`, `.env`, databases, logs, tmp files, secrets, auth files
or OpenCode files are included. The patch set contains source code, tests and
mission reports only.

## Secret scan

The entire snapshot (`FINAL.patch`, `series/`, and the metadata files) was
secret-scanned before staging: no real credentials were found. Test fixtures
intentionally use obviously fake placeholders (e.g. `canary-fake-…`,
`sk-no-key-required`).
