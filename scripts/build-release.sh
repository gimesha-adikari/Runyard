#!/usr/bin/env bash
set -euo pipefail

# Determine repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== [Runyard] Canonical Release Build ==="
echo "Repository root: ${REPO_ROOT}"
cd "${REPO_ROOT}"

echo "Step 1: Running frontend tests..."
npm test

echo "Step 2: Running Rust test suite..."
cargo test --manifest-path src-tauri/Cargo.toml

echo "Step 3: Building production frontend and Tauri release bundle..."
# Note: npm run tauri build automatically runs beforeBuildCommand ("npm run build"),
# strips devUrl, codegens production web assets into src-tauri, and links them into the binary.
# Plain 'cargo build --release' must NEVER be used to package or install the desktop application.
npm run tauri build

RELEASE_BIN="${REPO_ROOT}/src-tauri/target/release/runyard"
if [[ ! -f "${RELEASE_BIN}" ]]; then
  echo "Error: Release binary was not found at ${RELEASE_BIN}" >&2
  exit 1
fi

echo "=== Release Build Succeeded ==="
echo "Binary: ${RELEASE_BIN}"
echo "Size:   $(stat -c%s "${RELEASE_BIN}") bytes"
echo "SHA256: $(sha256sum "${RELEASE_BIN}" | awk '{print $1}')"
