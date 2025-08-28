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

# Get actual package versions
SERVER_VERSION=$(node -p "require('./packages/server/package.json').version")
CLI_PKG="packages/cli/package.json"

echo "▶ patching CLI package.json dependency (workspace:* → $SERVER_VERSION)"
# Patch CLI package - replace server dependency with actual server version
if command -v jq >/dev/null 2>&1; then
  tmp=$(mktemp)
  jq --arg v "$SERVER_VERSION" '.dependencies["@c-ehrlich/cjode-server"]=$v' "$CLI_PKG" > "$tmp"
  mv "$tmp" "$CLI_PKG"
else
  # Fallback to sed if jq not available (matches GitHub workflow exactly)  
  sed -i.bak "s/\"@c-ehrlich\/cjode-server\": \"workspace:\*\"/\"@c-ehrlich\/cjode-server\": \"$SERVER_VERSION\"/" "$CLI_PKG"
  rm -f "$CLI_PKG.bak"
fi

echo "▶ packing publishable tarballs"
mkdir -p "$DIST_DIR"
pushd packages/cli    > /dev/null;   npm pack --pack-destination "$ROOT/$DIST_DIR";    popd > /dev/null
pushd packages/server > /dev/null;   npm pack --pack-destination "$ROOT/$DIST_DIR";    popd > /dev/null

echo "▶ restoring workspace:* pointer (so git diff is clean)"
git checkout -- "$CLI_PKG"

echo -e "\n✅  Finished. Tarballs are in $DIST_DIR/"
ls -1 "$DIST_DIR"

CLI_VERSION=$(node -p "require('./packages/cli/package.json').version")
echo -e "\n📦  To test locally:"
echo "  mkdir /tmp/cjode-test && cd /tmp/cjode-test"
echo "  pnpm init"
echo "  pnpm add $ROOT/$DIST_DIR/c-ehrlich-cjode-$CLI_VERSION.tgz"
echo "  npx cjode init"
