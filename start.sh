#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -P "$(dirname "$0")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3.11+ is required. Install Python from https://www.python.org/downloads/' >&2
  exit 1
fi
exec python3 run.py "$@"
