#!/usr/bin/env bash
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/examples/systemd/omniroute.service.example"
dst="$HOME/.config/systemd/user/omniroute.service"

mkdir -p "$(dirname "$dst")"
cp "$src" "$dst"
systemctl --user daemon-reload

echo "Installed example service to $dst"
echo "Review ExecStart first, then run:"
echo "  systemctl --user enable --now omniroute.service"
