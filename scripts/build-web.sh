#!/bin/sh
# Builds the demo page's script into web/js: the app and the SDK, split in chunks (one esbuild bundle deadlocks on
# the SDK's top-level awaits inside import cycles; native modules load fine). web/vaults.json comes from
# scripts/export-vaults.ts.
set -e
cd "$(dirname "$0")/.."
npx -y rolldown@1.2.19 web/src/app.ts --format esm --platform browser --dir web/js --cleanDir --minify
