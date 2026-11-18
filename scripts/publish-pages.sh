#!/bin/sh
# Copies the built page to ../next-of-kin-pages (the gh-pages checkout, under the same includeIf identity) and pushes.
set -e
cd "$(dirname "$0")/.."
site=../next-of-kin-pages
cp web/index.html web/vaults.json "$site/"
cp -r web/js "$site/"
cd "$site"
[ "$(git config user.name)" = "mythos-builds" ] || { echo "wrong git identity in $site"; exit 1; }
git add -A
git commit -q -m "Demo page (from main $(git -C ../next-of-kin rev-parse --short HEAD))" || { echo "nothing to publish"; exit 0; }
git push -q origin gh-pages
echo "published"
