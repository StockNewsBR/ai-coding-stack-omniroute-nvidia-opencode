# Troubleshooting

## OmniRoute is not listening

```bash
ss -ltnp | grep ':20128'
systemctl --user status omniroute.service --no-pager
journalctl --user -u omniroute.service -n 100 --no-pager
```

Manual run:

```bash
omniroute
```

## Find what is using a port

```bash
sudo lsof -i -P -n | grep LISTEN
```

Or without sudo for your own processes:

```bash
ss -ltnp
```

## `/v1/models` works, completion fails

This is common.

Possible causes:

- provider quota;
- model removed;
- provider-specific account metadata missing;
- model requires different API shape;
- temporary upstream cooldown;
- stale model ID.

Test the provider directly.

## NVIDIA direct works, OmniRoute fails

Your API key and NVIDIA entitlement are probably fine.

Inspect:

1. OmniRoute provider connection;
2. selected model ID;
3. request logs;
4. combo route order;
5. provider cooldown state.

## Cloudflare 404 / 502

One important failure we hit was missing/invalid provider-specific `accountId` data.

Use the actual Cloudflare Account ID and reconnect/refresh the provider.

## NVIDIA model suddenly returns 410 / gone

Do not keep retrying forever. Check whether the model has been removed/deprecated.

Move the route out of the combo and replace it.

This is why the fallback stack exists.

## OpenCode says “Connect a provider” even though you configured one

Check:

```bash
opencode --version
which opencode
```

Make sure you did not accidentally replace the normal OpenCode binary with a preview/fork that has a different CLI/provider system.

Also verify:

```text
~/.config/opencode/opencode.json
~/.local/share/opencode/auth.json
```

Back up before deleting auth/config state.

## Graphify is installed but ignored

Prefer project-local install:

```bash
graphify install --project --platform opencode
graphify opencode install --project
```

Then inspect the project for Graphify's generated `AGENTS.md`/OpenCode integration files.

## Multiple OpenCode terminals appear to mirror each other

We reproduced and fixed this in a custom tmux launcher. The confirmed root cause was **not OmniRoute, CWD or SQLite**: the recovery wrapper could attach a new terminal to an `oc-*` tmux session that was already attached elsewhere.

The critical guard was:

```bash
if [[ "$attached" != "0" ]]; then
  continue
fi
```

Fresh launches should also use a unique tmux session name, for example:

```bash
tmux new-session -s "oc-${PROJECT}-$$"
```

After fixing tmux mirroring, we added a second hardening layer: **one SQLite DB per OpenCode session via `OPENCODE_DB`**, and made the token/context HUD read that exact same DB.

The acceptance rule is:

```text
same project + same OMO config
unique tmux session + unique OPENCODE_DB + HUD DB == process DB
= independent terminals and honest per-session counters
```

Run:

```bash
bash scripts/verify-opencode-session-isolation.sh
```

See [OpenCode Multi-Session Isolation](13-opencode-session-isolation.md) for the complete fix, process/HUD verification, diagrams and failure modes.

## High CPU / too many helper processes

Inventory first:

```bash
ps aux --sort=-%cpu | head -30
ss -ltnp
```

Disable MCPs/plugins you do not use continuously. Browser automation, indexing, language servers and gateways all cost resources.

## Provider catalog is huge

Use OpenCode provider whitelist/blacklist features or create a custom provider that exposes only the routes you actually use.

The best model picker is a short model picker.

## Version-specific note: v3.8.49 long-context combo 503s

The OmniRoute project has a closed issue documenting a v3.8.49 regression where long `/v1/responses` conversations could end in:

```text
503 Maximum combo retry limit reached
```

If you are on v3.8.49 and see this after a conversation grows:

1. record your exact OmniRoute version;
2. test the same provider/model directly outside the combo;
3. test `auto` or another combo;
4. update to the current release line and retest before patching source code;
5. inspect the current upstream issue/release notes because resilience behavior changes quickly.

Do not assume every `Maximum combo retry limit reached` error has the same cause. Provider quota, proxy failure, cooldown and stale model routes can produce superficially similar symptoms.
