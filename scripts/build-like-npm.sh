#!/usr/bin/env bash
set -euo pipefail

#------------- configuration -------------
NODE_LTS=20                     # must match release-please.yml
PNPM_VER=8.15.0
DIST_DIR="${DIST_DIR:-dist-local}"  # where .tgz files will be written
#-----------------------------------------

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

echo "▶ ensuring correct node version"
NODE_VERSION=$(node --version)
if [[ ! "$NODE_VERSION" =~ ^v20\. ]]; then
  echo "❌ Need Node 20.x for identical build"
  echo "Current: $NODE_VERSION"
  exit 1
fi
echo "✓ Node version: $NODE_VERSION"

echo "▶ cleaning workspace"
git clean -xfdq         # nuke anything untracked
rm -rf node_modules     # explicit, for paranoia

echo "▶ ensuring correct pnpm version"
corepack enable
corepack prepare "pnpm@${PNPM_VER}" --activate > /dev/null

echo "▶ installing deps (frozen lockfile)"
pnpm install --frozen-lockfile

echo "▶ building all packages"
pnpm run build          # turbo build ➜ tsup ➜ dist/

echo "▶ packing publishable tarballs (pnpm auto-resolves workspace:*)"
mkdir -p "$DIST_DIR"
pushd packages/cli    > /dev/null;   pnpm pack --pack-destination "$ROOT/$DIST_DIR";    popd > /dev/null
pushd packages/server > /dev/null;   pnpm pack --pack-destination "$ROOT/$DIST_DIR";    popd > /dev/null

echo -e "\n✅  Finished. Tarballs are in $DIST_DIR/"
ls -1 "$DIST_DIR"

CLI_VERSION=$(node -p "require('./packages/cli/package.json').version")
echo -e "\n📦  To test locally:"
echo "  mkdir /tmp/cjode-test && cd /tmp/cjode-test"
echo "  pnpm init"
echo "  pnpm add $ROOT/$DIST_DIR/c-ehrlich-cjode-$CLI_VERSION.tgz"
echo "  npx cjode init"
