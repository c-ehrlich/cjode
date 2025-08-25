#!/bin/bash

set -e

echo "🔨 Building project..."
pnpm build

echo "📦 Installing globally..."

# Remove existing global installation if it exists
for cmd in cjode-dev cjode; do
  if command -v $cmd >/dev/null 2>&1; then
    echo "🗑️  Removing existing global $cmd..."
    
    # Try multiple removal methods
    timeout 10 npm uninstall -g $cmd 2>/dev/null || true
    
    # If still exists, try direct removal
    if command -v $cmd >/dev/null 2>&1; then
      echo "🔧 Force removing $cmd via direct unlink..."
      CMD_PATH=$(which $cmd)
      if [ -L "$CMD_PATH" ]; then
        rm -f "$CMD_PATH"
      fi
      
      # Also remove from npm global
      NPM_GLOBAL=$(npm config get prefix)
      rm -f "$NPM_GLOBAL/bin/$cmd" "$NPM_GLOBAL/lib/node_modules/$cmd" 2>/dev/null || true
    fi
  fi
done

# Link the CLI package globally using npm link
cd packages/cli
npm link
cd ../..

# Test if command is available
if command -v cjode-dev >/dev/null 2>&1; then
  echo "🔗 Global cjode-dev command linked successfully"
else
  echo "⚠️  Command 'cjode-dev' not found. You may need to add npm global bin to PATH"
  NPM_GLOBAL_BIN=$(npm config get prefix)/bin
  echo "   Try: export PATH=\"$NPM_GLOBAL_BIN:\$PATH\""
fi

echo "✅ Successfully installed! Usage:"
echo ""
echo "   cjode-dev           - Start full application (server + client)" 
echo "   cjode-dev init      - Set up global configuration"
echo "   cjode-dev chat      - Start client only"
echo ""
echo "ℹ️  This runs in PRODUCTION mode using global config (~/.config/cjode/.env)"
echo "   Make sure to run 'cjode-dev init' first to configure your API keys"
