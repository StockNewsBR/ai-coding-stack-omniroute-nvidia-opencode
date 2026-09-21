# Free AI Stack Audit — Kilo + OmniRoute + OpenCode/OMO

Date: 2026-09-21
Host: Linux WSL2 (`Linux DayTrader`, x86_64)
Mission: `KILO_OMNIROUTE_OPENCODE_OMO_FREE_ONLY`

## Result

```text
STATUS=FAIL
FREE_AI_STACK=FAIL
FREE_ONLY=TRUE (client configuration)
PAID_FALLBACK=FALSE (Kilo/OpenCode/OMO configuration)
ALLOW_PAID_MODELS=FALSE (Kilo/OpenCode/OMO configuration)
ALLOW_CREDIT_CONSUMPTION=FALSE
FAIL_CLOSED=TRUE
```

The stack is not globally `FREE_ONLY`: the existing OmniRoute instance still
contains pre-existing user/API combos with non-free targets, and the active
OmniRoute build does not persist the `hideAutoCombos` setting through its
settings API. Those routes were not deleted or changed because one is named
`STOCKNEWSBR-FREE-CODE` and may be used by production-adjacent tooling.

## Architecture

```text
Kilo ── explicit free Kilo models
OpenCode ── http://127.0.0.1:20128/v1 ── exactly two allowlisted free IDs
OMO ── explicit OmniRoute/free route ── no model/runtime fallback
```

OmniRoute settings changed through its local management API:

```text
freeAccessPolicy=strict
hidePaidModels=true
excludeTosAvoid=true
backgroundDegradation.enabled=false
```

The service remains bound to `127.0.0.1:20128`. No firewall, DNS, Docker,
PostgreSQL, IAMM, StockNewsBR, or Vloque runtime was changed.

## Versions and files

```text
Kilo=7.7.5
OpenCode=1.18.31
OmniRoute=3.8.50
OMO=active ~/.omo/omo.jsonc; version not exposed by the config
START_SHA=624e3d535ac16bae255441f7c0c7a975b238ac78
BRANCH=chore/upstream-lab-updates-2026-08-22
```

Repository files belonging to this mission:

```text
scripts/free-ai-audit
docs/FREE_AI_STACK_KILO_OMNIROUTE_OPENCODE_OMO_2026-09-21.md
```

Local tool configuration changed, with secrets preserved and never printed:

```text
~/.config/kilo/kilo.jsonc                 (new)
~/.opencode/opencode.json
~/.config/opencode/opencode.json
~/.omo/omo.jsonc
~/.omniroute/storage.sqlite               (settings API only)
```

Backups created before changes:

```text
~/.local/share/free-ai-stack/backups/2026-09-21/opencode-local.json
~/.local/share/free-ai-stack/backups/2026-09-21/opencode-global.json
~/.local/share/free-ai-stack/backups/2026-09-21/omo.jsonc
~/.local/share/free-ai-stack/backups/2026-09-21/omniroute-storage.sqlite
```

## Kilo

```text
KILO_INSTALLED=YES
KILO_MAIN_MODEL=kilo/kilo-auto/free
KILO_MAIN_FREE=PASS (kilo models --verbose: isFree=true)
KILO_SMALL_MODEL=kilo/cohere/north-mini-code:free
KILO_SMALL_FREE=PASS (kilo models --verbose: isFree=true)
KILO_COMPACTION_MODEL=kilo/cohere/north-mini-code:free
KILO_COMPACTION_FREE=PASS (kilo models --verbose: isFree=true)
KILO_AUTOCOMPLETE=DISABLED
KILO_AUTOCOMPLETE_FREE=DISABLED
KILO_AUTH=BLOCKED_EXTERNAL_CREDENTIAL (kilo auth list: 0 credentials)
```

The configuration also pins subagents and named utility agents to the same
verified free IDs. No Kilo model request was made because no authenticated
Kilo credential was available. No Mistral BYOK key was created or displayed.

Kilo documents `kilo-auto/free` as the free route and document that the
default Codestral autocomplete is billed unless the user supplies a free
Mistral BYOK route; autocomplete is therefore disabled here:

- <https://kilo.ai/docs/getting-started/using-kilo-for-free>
- <https://kilo.ai/docs/code-with-ai/agents/model-selection>
- <https://kilo.ai/docs/code-with-ai/features/autocomplete>

## OpenCode and OMO

Both active OpenCode configs have:

```text
enabled_providers=[omniroute]
baseURL=http://localhost:20128/v1
model=omniroute/oc/deepseek-v4-flash-free
small_model=omniroute/openrouter/cohere/north-mini-code:free
provider.whitelist=[
  oc/deepseek-v4-flash-free,
  openrouter/cohere/north-mini-code:free
]
```

All OMO agent/category model entries use
`omniroute/oc/deepseek-v4-flash-free`. OMO `model_fallback` and
`runtime_fallback.enabled` are both `false`.

```text
OPENCODE_FREE_ONLY=PASS
OMO_FREE_ONLY=PASS
```

OpenCode request evidence:

```text
provider=omniroute
route=http://localhost:20128/v1
model=openrouter/cohere/north-mini-code:free
cost_classification=FREE (live /v1/models pricing input/output=0)
result=FREE_TEST_OK
```

The first explicitly selected free model, `oc/deepseek-v4-flash-free`,
returned `Model is unavailable`; OpenCode stopped and did not switch models.
The second explicitly selected free model succeeded. No paid request was
executed.

## OmniRoute inventory and blocker

```text
OMNIROUTE_STATUS=PASS
OMNIROUTE_ENDPOINT=http://127.0.0.1:20128/v1
OMNIROUTE_FREE_MODELS=
  oc/deepseek-v4-flash-free,
  openrouter/cohere/north-mini-code:free
```

Both allowlist entries were present in the live catalog with zero input and
output pricing at audit time. The client allowlist contains no paid model.

The global OmniRoute gate is not satisfied:

```text
OMNIROUTE_FREE_ONLY=FAIL
OMNIROUTE_PAID_FALLBACK=NO (background degradation disabled)
OMNIROUTE_UNSAFE_COMBO_TARGETS=56
```

The active settings schema accepts `freeAccessPolicy` and `hidePaidModels`
but drops `hideAutoCombos`; its effective value remains `false`. The live
catalog and persisted combo data therefore cannot be proved globally free.
Existing combos were audited but not deleted or rewritten. In particular,
the pre-existing `STOCKNEWSBR-FREE-CODE` combo includes
`nvidia/nvidia/nemotron-3-super-120b-a12b`, whose live pricing is non-zero.

## Tests

| Test | Result | Evidence |
|---|---|---|
| OmniRoute reachable | PASS | `GET /v1/models` on loopback returned HTTP 200 |
| Free inventory | PASS | allowlist has 2 live zero-price models |
| OpenCode free request | PASS | explicit free route returned `FREE_TEST_OK` |
| Kilo free request | BLOCKED | no authenticated Kilo credential; no request sent |
| Fail closed | PASS | isolated audit fixture raised `NO FREE MODEL AVAILABLE` |
| Paid fallback | PASS | no fallback observed after free model unavailability |
| Paid requests | PASS | `0` |

The reusable auditor is:

```bash
scripts/free-ai-audit
```

It exits non-zero and prints `FREE_AI_STACK=FAIL` until the OmniRoute global
blocker is resolved without touching production-adjacent combos.

## Privacy and credential handling

Do not automatically send any of the following to a free endpoint:

```text
.env files
API keys and access tokens
Stripe secrets
AWS credentials
database passwords
customer PII
private authentication tokens
production secrets
```

The existing repository ignore rules already cover common secret files; no
destructive `.gitignore` change was made. Secrets in existing configuration
were preserved and were not printed in command output or this document.

## Limitations and blockers

1. Kilo has zero authenticated credentials, so its runtime request test is
   blocked by `BLOCKED_EXTERNAL_CREDENTIAL`.
2. OmniRoute's active settings API does not persist `hideAutoCombos`.
3. OmniRoute retains pre-existing combos containing paid/unknown targets;
   changing them could affect production-adjacent tooling and was intentionally
   not performed.
4. Therefore the required global claim `FREE_AI_STACK=PASS` is not made.
