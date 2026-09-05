#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== [Runyard] Canonical Local Release Installation ==="
cd "${REPO_ROOT}"

SKIP_BUILD=0
for arg in "$@"; do
  if [[ "$arg" == "--skip-build" ]]; then
    SKIP_BUILD=1
  fi
done

if [[ ${SKIP_BUILD} -eq 0 ]]; then
  bash "${SCRIPT_DIR}/build-release.sh"
else
  echo "Skipping build step (--skip-build specified)."
fi

SRC_BIN="${REPO_ROOT}/src-tauri/target/release/runyard"
INSTALL_DIR="${HOME}/.local/bin"
DEST_BIN="${INSTALL_DIR}/runyard"

if [[ ! -f "${SRC_BIN}" ]]; then
  echo "Error: Release binary ${SRC_BIN} does not exist. Run without --skip-build first." >&2
  exit 1
fi

mkdir -p "${INSTALL_DIR}"
echo "Installing ${SRC_BIN} -> ${DEST_BIN}..."
install -m 755 "${SRC_BIN}" "${DEST_BIN}"

SRC_HASH=$(sha256sum "${SRC_BIN}" | awk '{print $1}')
DEST_HASH=$(sha256sum "${DEST_BIN}" | awk '{print $1}')

if [[ "${SRC_HASH}" != "${DEST_HASH}" ]]; then
  echo "Error: Hash mismatch after installation!" >&2
  echo "Source: ${SRC_HASH}" >&2
  echo "Dest:   ${DEST_HASH}" >&2
  exit 1
fi

echo "=== [Runyard] Installation Complete ==="
echo "Installed binary: ${DEST_BIN}"
echo "SHA256:           ${DEST_HASH}"
echo "Size:             $(stat -c%s "${DEST_BIN}") bytes"
