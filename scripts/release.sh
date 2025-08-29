#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[RELEASE]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to ask for confirmation
confirm() {
    read -p "$(echo -e ${YELLOW}[CONFIRM]${NC} $1 [y/N]: )" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

# Function to get current version from CLI package
get_current_version() {
    node -p "require('./packages/cli/package.json').version"
}

# Function to bump version
bump_version() {
    local current=$1
    local bump_type=$2
    
    IFS='.' read -ra VERSION_PARTS <<< "$current"
    local major=${VERSION_PARTS[0]}
    local minor=${VERSION_PARTS[1]}
    local patch=${VERSION_PARTS[2]}
    
    case $bump_type in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            echo "$current"
            return
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Function to update package.json version
update_package_version() {
    local package_path=$1
    local version=$2
    
    # Use node to update the version in package.json
    node -e "
        const fs = require('fs');
        const path = '$package_path/package.json';
        const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
        pkg.version = '$version';
        fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
    "
}

# Main script starts here
print_status "Starting manual release process..."

# Load .env file if it exists
if [[ -f ".env" ]]; then
    print_status "Loading environment variables from .env..."
    set -a  # automatically export all variables
    source .env
    set +a  # stop automatically exporting
else
    print_warning "No .env file found"
fi

# Check for npm token early to avoid wasting time
if [[ -z "$NPM_TOKEN" ]] && [[ -z "$NODE_AUTH_TOKEN" ]]; then
    print_error "No NPM_TOKEN or NODE_AUTH_TOKEN found in environment"
    print_error "Add NPM_TOKEN to your .env file or set NODE_AUTH_TOKEN"
    print_error "Get your token from: https://www.npmjs.com/settings/tokens"
    exit 1
fi

print_status "Found npm authentication token ✓"

# Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -f "pnpm-workspace.yaml" ]]; then
    print_error "Must be run from project root directory"
    exit 1
fi

# Check if we're on main branch
current_branch=$(git branch --show-current)
if [[ "$current_branch" != "main" ]]; then
    print_error "Must be on main branch (currently on: $current_branch)"
    exit 1
fi

# Check if working directory is clean
if [[ -n $(git status --porcelain) ]]; then
    print_error "Working directory is not clean. Commit or stash changes first."
    git status --short
    exit 1
fi

# Pull latest changes
print_status "Pulling latest changes..."
git pull origin main

# Get current version
current_version=$(get_current_version)
print_status "Current version: $current_version"

# Ask for bump type
echo
echo "Select version bump type:"
echo "1) patch ($current_version -> $(bump_version $current_version patch))"
echo "2) minor ($current_version -> $(bump_version $current_version minor))"
echo "3) major ($current_version -> $(bump_version $current_version major))"
echo "4) custom"
echo "5) cancel"

read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        bump_type="patch"
        ;;
    2)
        bump_type="minor"
        ;;
    3)
        bump_type="major"
        ;;
    4)
        read -p "Enter custom version: " new_version
        if [[ ! $new_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            print_error "Invalid version format. Must be x.y.z"
            exit 1
        fi
        bump_type="custom"
        ;;
    5)
        print_status "Release cancelled"
        exit 0
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

if [[ $bump_type != "custom" ]]; then
    new_version=$(bump_version $current_version $bump_type)
fi

print_status "New version will be: $new_version"

if ! confirm "Continue with release?"; then
    print_status "Release cancelled"
    exit 0
fi

# Run tests and build
print_status "Running tests and build..."
pnpm install --no-frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build

print_success "All checks passed!"

# Update package versions
print_status "Updating package versions to $new_version..."
update_package_version "packages/cli" "$new_version"
update_package_version "packages/server" "$new_version"
update_package_version "packages/config" "$new_version"
update_package_version "packages/core" "$new_version"
update_package_version "packages/state" "$new_version"

# Update manifest file
echo "{
  \"packages/cli\": \"$new_version\",
  \"packages/server\": \"$new_version\",
  \"packages/config\": \"$new_version\",
  \"packages/core\": \"$new_version\",
  \"packages/state\": \"$new_version\"
}" > .release-please-manifest.json

print_success "Updated all package versions"

# Build again with new versions
print_status "Building with new versions..."
pnpm build

# Validate CLI package
print_status "Validating CLI package..."
cd packages/cli
npm pack --dry-run > /tmp/pack.txt
if grep -q "node_modules/@cjode" /tmp/pack.txt; then
    print_error "Internal packages leaked into CLI bundle"
    exit 1
fi
if grep -q "node_modules/@c-ehrlich/cjode-server" /tmp/pack.txt; then
    print_error "Server package leaked into CLI bundle"
    exit 1
fi

# Test CLI
if ! node dist/cjode.js --help > /tmp/cli_output.txt 2>&1; then
    print_error "CLI failed to run:"
    cat /tmp/cli_output.txt
    exit 1
fi

# Run publint
npx publint
cd ../..

print_success "CLI package validation passed"

# Commit changes
print_status "Committing version changes..."
git add .
git commit -m "chore: release v$new_version

- Bump all packages to $new_version
- Manual release via release script"

# Create git tag
print_status "Creating git tag v$new_version..."
git tag -a "v$new_version" -m "Release v$new_version"

# Push changes and tags
if confirm "Push changes and tags to GitHub?"; then
    print_status "Pushing to GitHub..."
    git push origin main
    git push origin "v$new_version"
    print_success "Pushed to GitHub"
    pushed_to_github=true
else
    print_warning "Skipped pushing to GitHub. Remember to push manually:"
    echo "  git push origin main"
    echo "  git push origin v$new_version"
    pushed_to_github=false
fi

# Publish to npm
if confirm "Publish CLI package to npm?"; then
    print_status "Publishing to npm..."
    cd packages/cli
    
    # Set up npm authentication
    if [[ -n "$NPM_TOKEN" ]]; then
        export NODE_AUTH_TOKEN="$NPM_TOKEN"
        print_status "Using NPM_TOKEN for authentication (token: ${NPM_TOKEN:0:8}...)"
        
        # Try to get user info for debugging
        if npm_user_debug=$(npm whoami 2>/dev/null); then
            print_status "Token belongs to npm user: $npm_user_debug"
        else
            print_status "Could not determine npm user from token (this might be normal)"
        fi
        
        # Check if we can see the existing package
        print_status "Checking if token can access @c-ehrlich/cjode..."
        if npm view @c-ehrlich/cjode version > /dev/null 2>&1; then
            current_published_version=$(npm view @c-ehrlich/cjode version 2>/dev/null)
            print_status "Found published version: $current_published_version"
        else
            print_warning "Token cannot view @c-ehrlich/cjode package info"
            print_warning "This may indicate a permission issue"
        fi
    else
        print_status "No NPM_TOKEN found, checking npm login status..."
        # Verify npm login authentication only if no token
        if ! npm whoami > /dev/null 2>&1; then
            print_error "Not authenticated with npm. Run 'npm login' or set NPM_TOKEN"
            exit 1
        fi
        npm_user=$(npm whoami)
        print_status "Authenticated as npm user: $npm_user"
    fi
    
    # First try dry run to test authentication
    print_status "Testing npm publish with --dry-run..."
    if [[ -n "$GITHUB_ACTIONS" ]]; then
        npm publish --dry-run --provenance --access public
    else
        npm publish --dry-run --access public
    fi
    
    if [[ $? -ne 0 ]]; then
        print_error "Dry run failed! Fix authentication issues first."
        exit 1
    fi
    
    print_success "Dry run passed! Token can publish to @c-ehrlich/cjode"
    
    if ! confirm "Dry run successful. Proceed with actual publish?"; then
        print_status "Skipped actual publish"
        cd ../..
        exit 0
    fi
    
    # Now do the real publish
    print_status "Publishing for real..."
    if [[ -n "$GITHUB_ACTIONS" ]]; then
        npm publish --provenance --access public
    else
        npm publish --access public
    fi
    cd ../..
    print_success "Published to npm!"
else
    print_warning "Skipped npm publish. To publish manually:"
    echo "  cd packages/cli"  
    echo "  NODE_AUTH_TOKEN=\$NPM_TOKEN npm publish --access public"
fi

# Create GitHub release
if [[ "$pushed_to_github" == true ]]; then
    if command -v gh &> /dev/null; then
        if confirm "Create GitHub release?"; then
            print_status "Creating GitHub release..."
            gh release create "v$new_version" \
                --title "Release v$new_version" \
                --generate-notes \
                --latest
            print_success "Created GitHub release"
        fi
    else
        print_warning "GitHub CLI not installed. Create release manually at:"
        echo "  https://github.com/c-ehrlich/cjode/releases/new?tag=v$new_version"
    fi
else
    print_status "Skipped GitHub release (changes not pushed)"
fi

print_success "Release completed successfully! 🎉"
print_status "Version $new_version has been:"
echo "  ✅ Built and tested"
echo "  ✅ Committed and tagged"
if [[ $? -eq 0 ]]; then
    echo "  ✅ Pushed to GitHub"
    echo "  ✅ Published to npm"
fi
