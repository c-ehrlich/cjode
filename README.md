# Cjode - (CJE Code Agent)

> **Note:** This package is published to npm as `@c-ehrlich/cjode`. After installing it, the command to run it is `cjode`.

## For Users

### Installation

Install globally via npm:
```bash
npm install -g @c-ehrlich/cjode
```

### Setup

Set up your API keys:
```bash
cjode env --setup
```

You'll need:
- **ANTHROPIC_API_KEY** (required) - Get from [Anthropic Console](https://console.anthropic.com/)
- **OPENAI_API_KEY** (optional) - Get from [OpenAI Platform](https://platform.openai.com/api-keys)

### Usage

Start the server:
```bash
cjode server
```

In another terminal, start chatting:
```bash
cjode chat
```

### Commands

```bash
# Server management
cjode server              # Start server on default port (3001)
cjode server --port 8080  # Start server on custom port

# Chat interface
cjode chat                        # Connect to default server
cjode chat --server http://...:...  # Connect to custom server

# Environment management
cjode env                 # Show configuration status
cjode env --setup         # Interactive setup
cjode env --list          # List all variables
cjode env --set KEY       # Set a variable
cjode env --unset KEY     # Remove a variable
cjode env --validate      # Validate configuration
```

## For Developers

### Prerequisites

- Node.js 20.9.0 or higher
- pnpm package manager

### Setup

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd cjode
   pnpm install
   ```

2. **Create local environment file:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Build the project:**
   ```bash
   pnpm build
   ```

### Development Commands

```bash
# Build all packages
pnpm build

# Run linter
pnpm lint

# Run type checker
pnpm typecheck

# Run tests
pnpm test

# Start development server (hot reload)
pnpm dev:server

# Start development client (in another terminal)
pnpm dev:client

# Clean build artifacts
pnpm clean

# Format code
pnpm format
```

### Testing

```bash
# Validate environment setup
node packages/cli/bin/cjode.js env --validate

# Start server manually
node packages/cli/bin/cjode.js server

# Test chat interface
node packages/cli/bin/cjode.js chat

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

### Environment Variables

In development, the system uses **only** the local `.env` file when `NODE_ENV=development` is set (automatically set by dev scripts).

Required variables:
```bash
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_openai_key_here
CJODE_DEFAULT_MODEL=claude-3-sonnet
CJODE_SERVER_PORT=3001
CJODE_SERVER_HOST=127.0.0.1
```

## License

MIT License - see LICENSE file for details.
