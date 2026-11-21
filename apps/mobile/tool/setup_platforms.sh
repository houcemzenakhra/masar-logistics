#!/usr/bin/env bash
# Creates the Android and iOS folders if they are missing, then adds what Masar needs:
# camera, location while on duty, notifications, links to the phone and maps apps.
# Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d android ] || [ ! -d ios ]; then
  flutter create . --platforms=android,ios --org dz.masar --project-name masar_mobile
fi
python3 tool/patch_platforms.py
