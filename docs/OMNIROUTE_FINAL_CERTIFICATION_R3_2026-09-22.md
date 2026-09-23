# OmniRoute Final Production Certification R3

Date: 2026-09-22
Mission: `OMNIROUTE-M23B-RUNTIME-PROMOTION-AND-PARITY-CLOSURE-R1`
Project scope: OmniRoute only

## Result

The original M23/R3 blocker was runtime parity. The controlled local promotion
closed it without changing application configuration, provider credentials, or
any service other than the OmniRoute user service.

`M23B=PASS`
`R3=PASS`
`FINAL_VERDICT=PASS`

## Certified source and worktree

| Check                               | Evidence                                   |
| ----------------------------------- | ------------------------------------------ |
| Branch                              | `setup/image-provider-r2`                  |
| Certified source SHA                | `08879744625a76dc7af7290ce2f1c547231e3d46` |
| `origin/setup/image-provider-r2`    | `08879744625a76dc7af7290ce2f1c547231e3d46` |
| Source/remote parity                | `YES`                                      |
| Certification worktree              | `/home/dcima/omniroute-m23-final-cert-r3`  |
| Worktree clean before documentation | `YES`                                      |

## Original M23 evidence carried forward

The R2 source evidence remains authoritative:

- text routing is `FREE_ONLY=ON` and `TEXT_PAID_FALLBACK=NO`;
- image routing is free-first and paid image fallback is default-disabled;
- the paid-image regression suite uses synthetic adapters and zero-fetch
  assertions; no real paid inference was performed;
- the canary baseline was healthy on `127.0.0.1:20128` with runtime
  `3.8.50 / 7e5a2d80b`;
- M23 source, policy, health, authentication, and free-catalog checks passed;
  the sole final-certification gate left open was `RUNTIME_PARITY=FAIL`.

Supporting source evidence: `OMNIROUTE_IMAGE_PAID_FALLBACK_R2_2026-09-22.md`
and `OMNIROUTE_IMAGE_PAID_FALLBACK_CANARY_R1_1_2026-09-22.md`.

## Rollback proof captured before mutation

| Check                      | Evidence                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Old runtime                | `3.8.50`                                                                                               |
| Old runtime `BUILD_SHA`    | `7e5a2d80b`                                                                                            |
| Service                    | systemd user `omniroute.service`                                                                       |
| Unit file                  | `/home/dcima/.config/systemd/user/omniroute.service`                                                   |
| ExecStart wrapper          | `/home/dcima/.local/bin/omniroute-systemd-run`                                                         |
| Package topology           | pnpm global package, exact local tarball install                                                       |
| Rollback artifact          | `/home/dcima/.cache/omniroute-m23b-rollback.shrzVb/omniroute-3.8.50-old.tgz`                           |
| Rollback artifact SHA-256  | `8f7e89600dd30bc6bef254d0ac82cd4f6d6c90be71f9fb5d8f9340c207f65b28`                                     |
| Rollback artifact identity | version `3.8.50`, `dist/BUILD_SHA=7e5a2d80b`                                                           |
| Rollback command           | `pnpm add --global --save-exact <rollback-artifact>` then `systemctl --user restart omniroute.service` |

`ROLLBACK_PLAN=PROVEN`
`ROLLBACK_ARTIFACT=AVAILABLE`
`ROLLBACK_TARGET_SHA=7e5a2d80b`

The promoted runtime remained healthy, so the rollback was not unnecessarily
executed. The artifact and exact target were revalidated after promotion:
`ROLLBACK_READY=YES`.

## Certified release artifact

| Check                       | Result                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| `npm run build:release`     | `PASS` (exit `0`)                                                  |
| Release `dist/BUILD_SHA`    | `088797446`                                                        |
| `npm pack`                  | `PASS`                                                             |
| Local artifact              | `/home/dcima/omniroute-m23-final-cert-r3/omniroute-3.8.50.tgz`     |
| Artifact SHA-256            | `1083ac49aa3628effb5d86a9b0327396e50f331cdb5a100614c952cbd85ee7b5` |
| Artifact package version    | `3.8.50`                                                           |
| Artifact `dist/BUILD_SHA`   | `088797446`                                                        |
| R2 paid-image files present | `12`                                                               |
| `npm run check:pack-boot`   | `PASS`                                                             |

The first strict `check:pack-artifact` run stopped at the repository's
release-line ancestry check because the certified feature SHA is not an
ancestor of `origin/main`. The repository-defined, explicit canary mechanism
was then used:
`OMNIROUTE_ALLOW_CANARY_BUILD=1 npm run check:pack-artifact` → `PASS`.
No integrity or policy check was suppressed. This is recorded as a
non-blocking provenance finding, not hidden as a release-line build.

## Security advisory classification

No dependency was upgraded in this mission. `npm audit --json` reported
`CRITICAL=1` and `HIGH=7`; `SECURITY_ADVISORIES_REVIEWED=YES`.

| Package/path                                                                     | Severity | Fix classification                               | Classification for this promotion                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | -------: | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct `next@16.3.1`                                                             | Critical | Fix available (`16.3.6`); not applied            | `GHSA-p293-qw3h-jr36` targets Windows-hosted servers; `GHSA-2xp9-vwfh-vxw4` targets AVIF image optimization. The deployed runtime is Linux, `images.unoptimized=true`, loopback-only, and authenticated. Non-blocking for this narrow deployment. |
| Direct optional `@huggingface/transformers@4.2.0` via `onnxruntime-node`/`sharp` |     High | Fix available; not applied                       | Optional/native image path; no paid image call or public listener. Non-blocking.                                                                                                                                                                  |
| Transitive `@xmldom/xmldom@0.9.10` via `httpyac`                                 |     High | Fix available; not applied                       | Dev/test path. Non-blocking.                                                                                                                                                                                                                      |
| Transitive optional `adm-zip@0.6.0` via `onnxruntime-node`                       |     High | Fix available via dependency update; not applied | Optional native dependency path. Non-blocking.                                                                                                                                                                                                    |
| Transitive `browserslist@4.28.2` via Babel/Next tooling                          |     High | Fix available; not applied                       | Build/dev-only. Non-blocking.                                                                                                                                                                                                                     |
| Transitive `fast-uri@3.1.5` via `ajv`/MCP dependencies                           |     High | Fix available; not applied                       | Production dependency, but current authenticated loopback deployment does not expose the affected remote attack surface. Non-blocking.                                                                                                            |
| Transitive dev `js-yaml@4.3.1`                                                   |     High | Fix available; not applied                       | Dev-only vulnerable path; runtime direct `js-yaml@5.3.0` is outside the affected range. Non-blocking.                                                                                                                                             |
| Direct `sharp@0.35.3`                                                            |     High | Fix available; not applied                       | Native image dependency; paid image routing remains disabled and no paid image request was made. Non-blocking.                                                                                                                                    |

`SECURITY_BLOCKER=NO`. Dependency remediation remains outside M23B.

## Controlled local promotion and live proof

Only the locally generated certified tarball was installed. No registry,
floating tag, Docker image, or remote VM was used.

| Check                         | Result                                            |
| ----------------------------- | ------------------------------------------------- |
| Install source                | local `omniroute-3.8.50.tgz` only                 |
| `LOCAL_ARTIFACT_ONLY`         | `YES`                                             |
| Restart scope                 | only `systemctl --user restart omniroute.service` |
| Service active                | `YES`                                             |
| Restart loop                  | `NO` (`NRestarts=0`)                              |
| Listener                      | exactly `127.0.0.1:20128`                         |
| Loopback-only                 | `YES`                                             |
| Health                        | `PASS` (`/api/health` returned `ok`)              |
| Installed runtime version     | `3.8.50`                                          |
| Installed runtime `BUILD_SHA` | `088797446`                                       |
| Runtime/source parity         | `PASS`                                            |
| R2 paid-image modules         | present in installed package and artifact         |

The runtime identity was read from the exact installed pnpm package used by the
systemd wrapper. The health endpoint itself does not expose the build SHA.

## Safe authenticated probes and policy proof

- Authenticated `GET /v1/models`: HTTP `200`, catalog count `646` →
  `AUTH=PASS`, `MODEL_CATALOG=PASS`.
- A request-level text probe used `nvidia/openai/gpt-oss-20b`, whose live
  catalog pricing is input `0` / output `0`; it returned HTTP `200` with one
  choice. A second zero-priced OpenRouter route also returned HTTP `200`.
  No paid model was selected → `FREE_TEXT_PROBE=PASS`.
- The R2 text wall remains `TEXT_FREE_ONLY=YES` and
  `TEXT_PAID_FALLBACK=NO`.
- `DEFAULT_PAID_IMAGE_POLICY.imagePaidFallbackEnabled=false` is present in the
  installed runtime. No paid-image enable flag was present in the service
  environment → `PAID_IMAGE_DEFAULT_DISABLED=YES`, `PAID_IMAGE_ENABLED=NO`.
- No image-generation request was made; `REAL_PAID_IMAGE_CALLS=0`.
- No secret was printed, rotated, revoked, or created;
  `REAL_SECRET_ROTATIONS=0`.
- No public listener appeared after the probes.

## Scope protection

Only this certification document is being changed for closure. The following
remain unchanged:

`IAMM_CHANGED=NO`
`STOCKNEWSBR_CHANGED=NO`
`OPENCODE_CHANGED=NO`
`HARNESS_CHANGED=NO`
`HERMES_CHANGED=NO`

No secrets are included in this document.

## Closure fields

```text
MISSION=OMNIROUTE-M23B-RUNTIME-PROMOTION-AND-PARITY-CLOSURE-R1
SOURCE_SHA=08879744625a76dc7af7290ce2f1c547231e3d46
REMOTE_SHA=08879744625a76dc7af7290ce2f1c547231e3d46
SOURCE_REMOTE_PARITY=YES
WORKTREE_CLEAN=YES

OLD_RUNTIME_VERSION=3.8.50
OLD_RUNTIME_BUILD_SHA=7e5a2d80b
ROLLBACK_PLAN=PROVEN
ROLLBACK_ARTIFACT=AVAILABLE
ROLLBACK_TARGET_SHA=7e5a2d80b
ROLLBACK_READY=YES

RELEASE_BUILD=PASS
RELEASE_BUILD_EXIT=0
ARTIFACT_BUILD_SHA=088797446
PACK_ARTIFACT=PASS
PACK_BOOT=PASS

SECURITY_ADVISORIES_REVIEWED=YES
CRITICAL=1
HIGH=7
SECURITY_BLOCKER=NO

INSTALL_SOURCE=LOCAL_CERTIFIED_TARBALL
LOCAL_ARTIFACT_ONLY=YES
SERVICE_ACTIVE=YES
RESTART_LOOP=NO
LISTENER=127.0.0.1:20128
LOOPBACK_ONLY=YES
HEALTH=PASS

RUNTIME_VERSION=3.8.50
RUNTIME_SOURCE_SHA=088797446
RUNTIME_PARITY=PASS

AUTH=PASS
MODEL_CATALOG=PASS
FREE_TEXT_PROBE=PASS
TEXT_FREE_ONLY=YES
TEXT_PAID_FALLBACK=NO
TEXT_PAID_CALLS=0
PAID_IMAGE_DEFAULT_DISABLED=YES
PAID_IMAGE_ENABLED=NO
REAL_PAID_IMAGE_CALLS=0
REAL_SECRET_ROTATIONS=0

ROLLBACK_EXECUTED=NO
ROLLBACK_RESULT=N/A

IAMM_CHANGED=NO
STOCKNEWSBR_CHANGED=NO
OPENCODE_CHANGED=NO
HARNESS_CHANGED=NO
HERMES_CHANGED=NO

CODE_BLOCKERS=NONE
CONFIG_BLOCKERS=NONE
EXTERNAL_BLOCKERS=NONE
NON_BLOCKING_FINDINGS=EXPLICIT_CANARY_PROVENANCE_OVERRIDE; npm audit 1 critical/7 high classified non-blocking

M23B=PASS
R3=PASS
FINAL_VERDICT=PASS
NEXT_GATE=OMNIROUTE-M24-KEY-ROTATION-R1
```

M24 is not executed by this mission.
