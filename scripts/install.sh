#!/bin/sh
# npm ci, with GitHub's ssh:// URLs fetched over https: a dependency of @solidcash/solidhat is
# ssh://git@github.com/mainnet-pat/libauth.git, which fails on a machine without a GitHub SSH key.
set -e
cd "$(dirname "$0")/.."
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf \
GIT_CONFIG_VALUE_0=ssh://git@github.com/ \
npm ci
