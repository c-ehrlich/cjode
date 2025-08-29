#!/bin/bash
set -e

echo "🧪 Testing release workflow steps locally..."
echo

echo "📦 Step 1: Install dependencies"
pnpm install --frozen-lockfile

echo "🔨 Step 2: Build all packages"
pnpm -r run build

echo "✅ Step 3: Validate CLI bundle"
cd packages/cli

echo "  → Testing npm pack dry-run..."
npm pack --dry-run > /tmp/pack.txt

echo "  → Checking for leaked internal packages..."
if grep -q "node_modules/@cjode" /tmp/pack.txt; then
  echo "❌ Internal packages leaked!"
  exit 1
else
  echo "✅ No internal packages found"
fi

if grep -q "node_modules/@c-ehrlich/cjode-server" /tmp/pack.txt; then
  echo "❌ Server packages leaked!"  
  exit 1
else
  echo "✅ No server packages found"
fi

echo "  → Testing CLI functionality..."
if node dist/cjode.js --help > /tmp/cli_output.txt 2>&1; then
  echo "✅ CLI help command works"
else
  echo "❌ CLI help command failed!"
  echo "Output:"
  cat /tmp/cli_output.txt
  exit 1
fi

echo "  → Running publint validation..."
npx publint

echo
echo "🎉 All validation steps passed! Ready for release."
