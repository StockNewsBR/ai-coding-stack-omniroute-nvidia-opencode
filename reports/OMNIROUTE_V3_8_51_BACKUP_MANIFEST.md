# OmniRoute v3.8.51 Upgrade — Backup Manifest

- Date: 2026-10-03 (UTC)
- Purpose: pre-upgrade safety gate for the v3.8.50 → v3.8.51 upgrade (VPS production + local workstation)
- Secrets: never printed; env/meta files are referenced by name/mode only and remain in private, mode-600 archives

## VPS production backup set

| Artifact | Path | Details |
|---|---|---|
| Full archive | `/var/backups/aimarketmaster/omniroute-pre-3.8.51-20261003T110926Z.tar.gz` | 2,029,042 bytes; **sha256 `36429c8583b1f35993f212be8293f979e1fdc89f304dbba4e7abe5e4df8dbad5`**; `sha256sum -c` = OK |
| Extracted set | same dir, `…-20261003T110926Z/` | `etc/` (aimm.env 640, omniroute.env 600, server.env 644, key id 600), `meta/` (sanitized + full docker inspect, sha256sums, versions), `unit/` (unit file + `systemctl show`), `storage.sqlite.hotbackup` |
| Hot DB backup | `…/storage.sqlite.hotbackup` | 13,635,584 bytes; python sqlite3 backup API; `PRAGMA quick_check` = ok; journal normalized DELETE; sha256 `a27d273f8c6635e8e2baa48a150028fae546920cc149de2673d5181805768bd0` |
| Live DB at backup time | `/var/lib/aimmarketmaster/omniroute/storage.sqlite` | sha256 `03ff1b8d04e5d7cde3351dd34f933bd8e3720389695d8180b8b3851a626bed44` |
| Pre-patch bootstrap script | `…/aimm-bootstrap-script-pre-3.8.51.tar.gz` | **sha256 `8f9bf6a529d600526fc5008055118ee216d437ed5653977e8e890abb37e52414`**; also `/root/omniroute-bootstrap.sh.pre-upgrade.bak` |
| Permissions | backup dir root-only 700 | archives 600 |

## Offsite copies (local workstation, verified)

- `/home/dcima/vps-backups/omniroute-pre-3.8.51/omniroute-pre-3.8.51-20261003T110926Z.tar.gz` (0600) — sha256 matches the VPS value above
- `/home/dcima/vps-backups/omniroute-pre-3.8.51/aimm-bootstrap-script-pre-3.8.51.tar.gz` — sha256 matches

## Local workstation backup

- `/mnt/c/Users/dcima/Empresa Omniroute - Backup 2026/omniroute-2026-10-03_081720.tar.gz` (397 MB), produced by `~/.local/bin/backup-omniroute-to-c`
- Covers `~/.omniroute` (hot sqlite backup + `quick_check`), inference/management credential files, OpenCode OmniRoute config, systemd unit + drop-ins, wrapper scripts.
- Wrapper rollback copy: `~/.local/bin/omniroute-systemd-run.bak-pre-v3851` (points back to Node 22.22.2 path).

## Restore / rollback procedure

1. VPS gateway package: restore the unit file from `unit/aimmarketmaster-omniroute.service` (or re-pin `085c57adf499…`, 3.8.50), `systemctl daemon-reload`, `systemctl restart aimmarketmaster-omniroute.service`. The 3.8.50 image remains in local Docker storage (do not prune).
2. Database (only if 3.8.51 migrations must be reverted): `systemctl stop` the unit, restore `storage.sqlite.hotbackup` over `/var/lib/aimmarketmaster/omniroute/storage.sqlite`, remove `-wal`/`-shm`, start the unit.
3. Local: restore the wrapper backup and reinstall `omniroute@3.8.50` (`pnpm add -g omniroute@3.8.50`), restart `omniroute.service`.

## Gate results

- BACKUP_VERIFIED = YES (sha256 recomputed and matched on both sides)
- RESTORE_PATH_KNOWN = YES
- ROLLBACK_READY = YES (old image digest retained; unit + DB restore documented)
