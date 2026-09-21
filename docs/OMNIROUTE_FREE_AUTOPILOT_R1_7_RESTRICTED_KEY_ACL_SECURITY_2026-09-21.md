# OmniRoute Free Autopilot R1.7 — Restricted-Key ACL and Secret Containment

Date: 2026-09-21
Mission result: BLOCKED_ROTATION_REQUIRED
Candidate: 95e714773bc37b6eed863b93bb6d16cbd3d0c3a4

Implementation source: `/home/dcima/omniroute-lab-r1-v3.8.50`
LAB HEAD: `95e714773bc37b6eed863b93bb6d16cbd3d0c3a4`
R1.7 code changes: none

## Scope and safety result

This mission diagnosed the authenticated catalog failure and proved the
smallest compatible ACL repair in an isolated synthetic canary. It did not
modify the real API key, live OmniRoute, or any client.

The exact intended identity remains zai/glm-4.7-flash. No alias, provider,
model, or client migration was introduced. The model remains FREE_UNKNOWN and
is still denied from automatic/free admission.

## Live state

| Field | Evidence |
|---|---|
| Version | 3.8.50 |
| Service | omniroute.service, active, MainPID 440 |
| Endpoint | 127.0.0.1:20128 listening |
| Health | HTTP 200 |
| Package build marker | dea6bb8 |
| Live package manifest SHA256 | 46394660a338155902350761999849bfa539e6fdc5aef74d7b69765a6ba788a2 |
| Live free policy | freeAccessPolicy="off" (unchanged) |
| Live package/config | unchanged |

The live restricted catalog was rechecked after the canary. It still returns
HTTP 200 with three rows for the Harness/OpenCode key, including the two
existing allowed models, and does not advertise zai/glm-4.7-flash.

## Actual client/key topology

The relevant chain is:

~~~
DeepSeek Harness -> StockNewsBR A2A bridge :9901 -> DeepSeek Harness :3080
                -> OmniRoute :20128
OpenCode        ---------------------------------> OmniRoute :20128/v1
Hermes          ---------------------------------> OmniRoute :20128
~~~

The Harness/OpenCode credential is the OmniRoute record:

| Safe metadata | Value |
|---|---|
| Key ID | 153ee506-842a-4730-be58-a637b995ce03 |
| Key name | OpenCode |
| Fingerprint | sha256:5eef5d97e296 (truncated safe identifier) |
| Model access mode | restricted |
| Allowed model count | 2 |
| Blocked model count | 0 |
| Allowed combo count | 0 |
| Allowed connection count | 0 |
| Allowed quota count | 0 |

The OpenCode key file, both OpenCode configuration locations, and the
StockNewsBR bridge environment resolve to this same key fingerprint. No raw
value is recorded here.

Hermes uses a separate credential, not the Harness/OpenCode record:

| Safe metadata | Value |
|---|---|
| Key ID | 8c858d32-1627-4c86-8d7a-920e22b1d134 |
| Key name | OPENCODE WSL |
| Fingerprint | sha256:013299ca4485 (truncated safe identifier) |
| Relevant Hermes model | zai/glm-4.7-flash |

The two configured credentials are distinct. The R1.6 statement that they
were one shared key was corrected by this safe fingerprint-to-record check.

## v3.8.50 ACL semantics

The actual compatible v3.8.50 source uses these API-key policy fields:

- modelAccessMode: all or restricted;
- allowedModels: exact or wildcard model patterns;
- blockedModels: deny patterns with precedence over allow patterns;
- allowedCombos: combo access rules;
- allowedConnections: connection IDs, when non-empty;
- allowedQuotas: quota-pool restrictions;
- disableNonPublicModels: an additional discovery/publicness gate.

Relevant source evidence in the exact R1 LAB tree:

- src/app/api/v1/models/catalog.ts:1847-1886 filters each catalog entry by
  isModelAllowedForKey(apiKey, m.id) or its raw m.root model;
- src/lib/db/apiKeys.ts:1486-1554 implements blocked-pattern precedence,
  restricted empty-list denial, and allow-pattern matching;
- src/lib/db/apiKeys.ts:1561-1573 applies group model permissions before
  returning the final decision;
- src/shared/utils/apiKeyPolicy.ts:515-551 enforces the same model policy on
  explicit request dispatch;
- src/shared/validation/schemas/keys.ts:96-139 validates the permission
  update fields and prevents a non-empty allow-list with modelAccessMode=all.

## Exact drift diagnosis

| Predicate | Result | Evidence |
|---|---|---|
| Unrestricted candidate contains model | YES | R1.5/R1.6 candidate catalog and regression test |
| Restricted Harness/OpenCode view contains model | NO | Live authenticated /v1/models, HTTP 200 |
| Model matches allowedModels | NO | Current list has two other exact IDs |
| Model matches blockedModels | NO | Current blocked list is empty |
| Provider connection is allowed | YES | allowedConnections is empty; exact local canary dispatch succeeded |
| Dispatch allowed by current real key | NO | Same allow-list predicate rejects the explicit model |
| Catalog advertisement allowed by current real key | NO | Catalog row is removed before response serialization |
| Model free classification | FREE_UNKNOWN | R1 strict policy classification |

Root cause: OMNIROUTE_CATALOG_OMISSION caused by the restricted key's
allow-list. More precisely, modelAccessMode=restricted is combined with an
allowedModels list that does not contain zai/glm-4.7-flash; the model is
therefore removed from /v1/models and rejected by explicit dispatch. It is not
a provider-connection ACL, blocked-model rule, alias failure, or retired
upstream model.

## Minimum ACL delta

The legitimate repair is one exact model entry only:

~~~
ALLOWED_MODELS_COUNT_BEFORE=2
ALLOWED_MODELS_COUNT_AFTER=3
MODEL_ADDED=zai/glm-4.7-flash
ACL_SCOPE_BROADENING=EXACT_MODEL_ONLY
~~~

No wildcard, provider-wide rule, modelAccessMode=all, combo rule, connection
rule, blocked-list change, or unrelated permission was added. The real key
remains at count 2; this delta was applied only to a synthetic canary copy.

## ACL backup and rollback

A mode-600 metadata-only backup was created before canary ACL mutation:

~~~
ACL_BACKUP_PATH=/tmp/omniroute-r1-7-acl-backup-Q21usR/metadata.json
ACL_BACKUP_MODE=600
RAW_SECRET_INCLUDED=NO
KEY_HASH_INCLUDED=NO
~~~

The backup contains the key ID/name, access mode, model/combo/connection/quota
lists, rate/usage/endpoint metadata, lifecycle flags, and schedule fields. It
contains no bearer value and no raw secret.

ACL_ROLLBACK_PROVEN=YES: in a fresh isolated candidate state, the synthetic
key was tested with the original two-entry list, with the exact third model
added, and after restoring the original list. The final authenticated catalog
again omitted zai/glm-4.7-flash while retaining the representative existing
allowed model.

## Synthetic restricted-key canary

The canary used the packaged R1/R1.5 candidate, not the live installation.
The temporary state and synthetic credential were isolated and removed after
the test.

| Check | Result |
|---|---|
| Canary port | 40865 |
| Canary version | 3.8.50 |
| Canary build/source marker | 95e7147 / candidate SHA above |
| Authenticated catalog before ACL delta | HTTP 200; exact row absent |
| Authenticated catalog after ACL delta | HTTP 200; exact row present |
| Existing representative model | oc/deepseek-v4-flash-free remained present |
| Pinned request | HTTP 200 to a local Z.AI-shaped mock |
| Mock-observed upstream model | glm-4.7-flash |
| Provider substitution | NO |
| Model substitution | NO |
| Auto/free request after exact ACL addition | HTTP 400; no mock upstream request |
| ACL inverse/rollback | PASS |

This is authorization/identity proof only. No real Z.AI inference, paid
inference, quota burn, or external provider request was made by the canary.

## FREE_ONLY preservation

The exact model remains visible only when the explicit client key permits it;
that does not change its free classification:

~~~
ZAI_GLM47_CATALOG_ACCESS=ALLOWED_FOR_EXPLICIT_CLIENT
ZAI_GLM47_PINNED_ACCESS=ALLOWED_IF_KEY_ACL_PERMITS
ZAI_GLM47_FREE_STATUS=FREE_UNKNOWN
ZAI_GLM47_AUTO_FREE_ALLOWED=NO
FREE_UNKNOWN_AUTO_ADMISSION=DENY
PAID_FALLBACK=DISABLED
~~~

The focused R1 candidate run passed 75/75 tests, including:

- verified-free and self-hosted admission;
- paid, unknown-cost, null-cost, and credit-backed denial;
- auth/health/cooldown/open-circuit denial;
- probe failure versus probe success;
- no paid fallback when strict-free candidates are exhausted;
- exact R1.5 catalog identity;
- exact R1.5 identity remaining excluded from strict-free admission;
- API-key policy and auto-combo catalog tests.

## Provider-health distinction

If a later explicit request reaches the real Z.AI service and receives the
known 529/429 condition, that is an external provider-health result. It is not
evidence of ACL denial after this exact-model permission is applied. The repair
must never silently reroute the pinned request.

## Secret exposure and containment

R1.6 recorded an unintentional local tool-output exposure:

~~~
SECRETS_EXPOSED=YES_UNINTENTIONAL_LOCAL_TOOL_OUTPUT
~~~

The raw values are not repeated. Safe identity mapping is:

~~~
PRIMARY_EXPOSED_KEY_ID=153ee506-842a-4730-be58-a637b995ce03
PRIMARY_EXPOSED_KEY_NAME=OpenCode
PRIMARY_EXPOSED_KEY_FINGERPRINT=sha256:5eef5d97e296
PRIMARY_EXPOSED_KEY_CLIENTS=DeepSeek Harness via StockNewsBR bridge, OpenCode

SECONDARY_EXPOSED_KEY_ID=8c858d32-1627-4c86-8d7a-920e22b1d134
SECONDARY_EXPOSED_KEY_NAME=OPENCODE WSL
SECONDARY_EXPOSED_KEY_FINGERPRINT=sha256:013299ca4485
SECONDARY_EXPOSED_KEY_CLIENTS=Hermes
~~~

The raw values were not found in the repository or shell history. Temporary
R1.6 synthetic key/header files were confirmed not to match either production
credential and were removed. No file, client configuration, network request,
or live ACL was changed to contain the incident. The already-emitted local
tool transcript cannot be retroactively revoked by this audit, so rotation is
required.

## Rotation plan — not executed

~~~
KEY_ROTATION_REQUIRED=YES
REAL_KEY_ACL_CHANGE_READY=YES
REAL_KEY_ACL_CHANGE_APPLIED=NO
~~~

After explicit operator approval and coordinated client access, rotate both
exposed credential records independently:

1. Create a replacement for the OpenCode/Harness key.
2. Clone its current restricted ACL, rate limits, endpoint restrictions,
   connection restrictions, lifecycle settings, and existing two models.
3. Add exactly zai/glm-4.7-flash to the replacement allow-list; keep the model
   classified FREE_UNKNOWN for auto/free policy.
4. Update the StockNewsBR bridge/Harness path and OpenCode one client at a
   time, validating authenticated catalog and normal requests after each.
5. Create and cut over a replacement for the separate OPENCODE WSL Hermes
   key, preserving its own current permissions; update Hermes only during the
   approved rotation window.
6. Verify traffic and logs no longer use the old credentials.
7. Revoke the old credentials and verify they return authentication failure.
8. Re-run the authenticated catalog, pinned identity, client, and FREE_ONLY
   gates before any R1 promotion.

No client configuration or secret was changed in R1.7.

## Promotion decision

R1.7 does not promote R1. The exact ACL repair is proven and ready, but the
real key must not be changed while the exposed credential remains active and
rotation requires coordinated client updates.

~~~
PROMOTION_PERFORMED=NO
R1_SECURITY_GATE=BLOCKED_ROTATION_REQUIRED
R1_PROMOTION_READY=NO
NEXT_ACTION=ROTATE_KEY_AND_PROMOTE
~~~

## Final report

~~~
OMNIROUTE_FREE_AUTOPILOT_R1_7_RESTRICTED_KEY_ACL_AND_SECRET_CONTAINMENT

LIVE_VERSION=3.8.50
LIVE_HEALTH=200
LIVE_UNCHANGED=YES

CANDIDATE_SHA=95e714773bc37b6eed863b93bb6d16cbd3d0c3a4

HARNESS_KEY_ID=153ee506-842a-4730-be58-a637b995ce03
HARNESS_KEY_NAME=OpenCode
HARNESS_KEY_FINGERPRINT=sha256:5eef5d97e296
HARNESS_KEY_MODEL_ACCESS_MODE=restricted
HARNESS_KEY_ALLOWED_MODELS_COUNT=2
HARNESS_KEY_BLOCKED_MODELS_COUNT=0
HARNESS_KEY_ALLOWED_COMBOS_COUNT=0
HARNESS_KEY_ALLOWED_CONNECTIONS_COUNT=0

CATALOG_ACL_ROOT_CAUSE=OMNIROUTE_CATALOG_OMISSION:restricted_allowedModels_excludes_exact_model

MODEL_ADDED_REQUIRED=zai/glm-4.7-flash
ACL_SCOPE_BROADENING=EXACT_MODEL_ONLY
ALLOWED_MODELS_COUNT_BEFORE=2
ALLOWED_MODELS_COUNT_AFTER=3

ACL_BACKUP_PATH=/tmp/omniroute-r1-7-acl-backup-Q21usR/metadata.json
ACL_ROLLBACK_PROVEN=YES

RESTRICTED_CANARY_CATALOG_ROW=PASS
RESTRICTED_CATALOG_DISPATCH_PARITY=PASS
PINNED_MODEL_RESOLUTION=PASS
PINNED_PROVIDER_RESOLUTION=PASS
PROVIDER_SUBSTITUTION=NO
MODEL_SUBSTITUTION=NO

ZAI_GLM47_FREE_STATUS=FREE_UNKNOWN
ZAI_GLM47_AUTO_FREE_ALLOWED=NO

FREE_ONLY=PASS
UNKNOWN_COST_DENY=PASS
PAID_FALLBACK=DISABLED
PAID_SPEND_TRIGGERED=NO

EXPOSED_KEY_ID=153ee506-842a-4730-be58-a637b995ce03
EXPOSED_KEY_NAME=OpenCode
EXPOSED_KEY_FINGERPRINT=sha256:5eef5d97e296
EXPOSED_KEY_IDENTITY=CONFIRMED_HARNESS_OPENCODE_KEY;SEPARATE_HERMES_KEY_ALSO_EXPOSED
SECONDARY_EXPOSED_KEY_ID=8c858d32-1627-4c86-8d7a-920e22b1d134
SECONDARY_EXPOSED_KEY_NAME=OPENCODE WSL
SECONDARY_EXPOSED_KEY_FINGERPRINT=sha256:013299ca4485

KEY_ROTATION_REQUIRED=YES
KEY_ROTATION_CLIENTS=DeepSeek Harness via StockNewsBR bridge, OpenCode, Hermes
REAL_KEY_ACL_CHANGE_READY=YES
REAL_KEY_ACL_CHANGE_APPLIED=NO

CLIENT_CONFIG_CHANGED=NO
DEEPSEEK_HARNESS_CONFIG_CHANGED=NO
OPENCODE_CONFIG_CHANGED=NO
HERMES_CONFIG_CHANGED=NO

LIVE_PACKAGE_UNCHANGED=YES
PROMOTION_PERFORMED=NO

R1_SECURITY_GATE=BLOCKED_ROTATION_REQUIRED
R1_PROMOTION_READY=NO
NEXT_ACTION=ROTATE_KEY_AND_PROMOTE

COMMIT=NOT_CREATED_DIRTY_REPO
PUSH=NOT_ATTEMPTED

FINAL_RESULT=BLOCKED
~~~
