#!/bin/sh
# Press warn, then release, on one vault, each as soon as the network takes it (one block apart).
# VAULT=<category> SOLIDCASH_MNEMONIC_MAINNET_FILE=… scripts/press-through.sh
cd "$(dirname "$0")/.."
out=$(mktemp)
for action in warn release; do
  tries=0
  while :; do
    ACTION=$action npx solidhat run scripts/press.ts --network mainnet --no-compile >"$out" 2>&1
    if grep -q "^$action: " "$out"; then grep "^$action: " "$out"; break; fi
    if ! grep -q "BIP68" "$out"; then echo "$action failed:"; tail -5 "$out"; exit 1; fi
    tries=$((tries + 1)); [ $tries -gt 90 ] && { echo "$action: no block in time"; exit 1; }
    sleep 45
  done
done
rm -f "$out"
