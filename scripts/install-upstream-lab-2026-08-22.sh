#!/usr/bin/env bash
set -euo pipefail

# Safe LAB installer for upstream Hermes + DeepSeek Harness updates.
# This intentionally avoids replacing the production Hermes/Harness installs.
# Run from WSL/Linux.

HERMES_LAB_ROOT="${HERMES_LAB_ROOT:-$HOME/.local/share/hermes-agent-lab}"
DSH_LAB_ROOT="${DSH_LAB_ROOT:-$HOME/.local/share/deepseek-harness-lab}"
DSH_VERSION="${DSH_VERSION:-0.1.0-rc.8}"
HERMES_REPO="https://github.com/NousResearch/hermes-agent.git"

say() { printf '\n==> %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }

need git
need node
need npm
need uv

say "Environment"
node --version
npm --version
uv --version
git --version

say "Install DeepSeek Harness ${DSH_VERSION} into isolated LAB"
mkdir -p "$DSH_LAB_ROOT"
if [ ! -f "$DSH_LAB_ROOT/package.json" ]; then
  npm init -y --prefix "$DSH_LAB_ROOT" >/dev/null 2>&1 || true
fi
npm install --prefix "$DSH_LAB_ROOT" "@deepseek-ai/dsh@${DSH_VERSION}"
DSH_BIN="$DSH_LAB_ROOT/node_modules/.bin/dsh"
if [ ! -x "$DSH_BIN" ]; then
  echo "Harness LAB binary not found: $DSH_BIN" >&2
  exit 1
fi
"$DSH_BIN" --version || true
"$DSH_BIN" --help >/dev/null
say "DeepSeek Harness LAB installed at $DSH_BIN"

say "Prepare isolated Hermes Agent LAB clone"
if [ -d "$HERMES_LAB_ROOT/.git" ]; then
  git -C "$HERMES_LAB_ROOT" fetch --tags --prune origin
  git -C "$HERMES_LAB_ROOT" reset --hard origin/main
  git -C "$HERMES_LAB_ROOT" submodule update --init --recursive
else
  rm -rf "$HERMES_LAB_ROOT"
  git clone --recurse-submodules "$HERMES_REPO" "$HERMES_LAB_ROOT"
fi

say "Create/update Hermes LAB virtualenv"
cd "$HERMES_LAB_ROOT"
uv venv venv --python 3.11
export VIRTUAL_ENV="$HERMES_LAB_ROOT/venv"
uv pip install -e '.[all]'

HERMES_BIN="$HERMES_LAB_ROOT/venv/bin/hermes"
if [ ! -x "$HERMES_BIN" ]; then
  echo "Hermes LAB binary not found: $HERMES_BIN" >&2
  exit 1
fi

say "Hermes LAB verification"
"$HERMES_BIN" version
"$HERMES_BIN" doctor || true

cat <<EOF

LAB INSTALL COMPLETE

Hermes LAB:
  $HERMES_BIN

DeepSeek Harness LAB:
  $DSH_BIN

Nothing in this script replaces the production Hermes install under ~/.hermes,
or the production Harness/Agent OS profile. Promote only after the existing
acceptance tests pass.

Suggested verification:
  $HERMES_BIN version
  $HERMES_BIN doctor
  $DSH_BIN --version

Rollback of LAB only:
  rm -rf "$HERMES_LAB_ROOT" "$DSH_LAB_ROOT"
EOF
