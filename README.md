# Cjode - Agentic Coding CLI

A TypeScript monorepo for an agentic coding assistant with streaming AI responses, built with Turborepo.

## 🚀 Quick Start

### Prerequisites

- Node.js 20.9.0 or higher
- pnpm package manager

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd cjode
   pnpm install
   ```

2. **Build the project:**
   ```bash
   pnpm build
   ```

3. **Set up environment variables:**
   ```bash
   node packages/cli/bin/cjode.js env --setup
   ```

   You'll be prompted to enter:
   - **ANTHROPIC_API_KEY** (required) - Get from [Anthropic Console](https://console.anthropic.com/)
   - **OPENAI_API_KEY** (optional) - Get from [OpenAI Platform](https://platform.openai.com/api-keys)

4. **Test the setup:**
   ```bash
   # Check environment configuration
   node packages/cli/bin/cjode.js env --validate
   
   # Start the server
   node packages/cli/bin/cjode.js server
   
   # In another terminal, test the chat (with mock streaming)
   node packages/cli/bin/cjode.js chat
   ```

## 🛠️ Development

### Environment Variables

The system supports multiple levels of environment configuration:

#### Development Mode (Local Development)
When developing in this monorepo, create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env

# Edit with your values
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_openai_key_here
CJODE_DEFAULT_MODEL=claude-3-sonnet
CJODE_SERVER_PORT=3001
CJODE_SERVER_HOST=127.0.0.1
```

**Development mode is automatically detected when:**
- `NODE_ENV=development` is set, OR
- Running from the monorepo directory (detects `turbo.json` + `pnpm-workspace.yaml`)

**In dev mode, local `.env` takes priority over global config.**

You'll see this message when local .env is loaded:
```
🔧 Loaded local .env file (development mode)
```

#### Production/Global Mode
For global CLI usage, environment variables are stored in:
- **Linux/macOS**: `~/.config/cjode/.env`
- **Windows**: `%AppData%\Roaming\cjode\.env`

Use the CLI commands to manage global configuration:
```bash
# Interactive setup
cjode env --setup

# Set individual variables
cjode env --set ANTHROPIC_API_KEY

# View current configuration  
cjode env

# Validate setup
cjode env --validate
```

### Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run linter
pnpm lint

# Run type checker
pnpm typecheck

# Start development server with hot reload (rebuilds + restarts on changes)
pnpm --filter=@cjode/server dev

# Start development client (in another terminal)
pnpm dev:client

# With custom port:
PORT=8080 pnpm dev:client

# OR start CLI directly (uses local .env automatically)
node packages/cli/bin/cjode.js server
```

### Testing the Streaming

1. **Start the server:**
   ```bash
   node packages/cli/bin/cjode.js server
   ```

2. **Test with CLI client:**
   ```bash
   node packages/cli/bin/cjode.js chat
   ```

3. **Test with curl (streaming):**
   ```bash
   curl -X POST http://127.0.0.1:3001/chat \
     -H "Content-Type: application/json" \
     -H "Accept: text/event-stream" \
     -d '{"message": "hello"}' \
     --no-buffer
   ```

4. **Test with curl (JSON):**
   ```bash
   curl -X POST http://127.0.0.1:3001/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "hello"}'
   ```

## 📁 Project Structure

```
cjode/
├── apps/
│   └── server/           # HTTP/WebSocket server
├── packages/
│   ├── core/             # Agent logic + shared types
│   ├── state/            # Configuration + data persistence  
│   └── cli/              # Global CLI interface
├── .env.example          # Environment template
├── turbo.json            # Turborepo configuration
└── pnpm-workspace.yaml   # Workspace definition
```

## 🔧 CLI Commands

### Server Management
```bash
cjode server              # Start server on default port (3001)
cjode server --port 8080  # Start server on custom port
```

### Chat Interface  
```bash
cjode chat                        # Connect to default server
cjode chat --server http://...:...  # Connect to custom server
```

### Environment Variables
```bash
cjode env                 # Show configuration status
cjode env --setup         # Interactive setup
cjode env --list          # List all variables
cjode env --set KEY       # Set a variable
cjode env --unset KEY     # Remove a variable
cjode env --validate      # Validate configuration
```

## 🏗️ Architecture

### Key Design Principles
- **Local-first**: All processing happens locally
- **Streaming responses**: Real-time AI output via Server-Sent Events
- **Multiple interfaces**: CLI now, TUI/VSCode/web later
- **Event-driven**: Central EventBus for real-time updates
- **Type-safe**: Full TypeScript with proper module boundaries

### Current Implementation
- **Mock streaming**: Outputs "foo bar baz" with 1-second delays
- **SSE protocol**: Ready for real AI model integration
- **Environment management**: Global and local configuration
- **Server/client architecture**: Foundation for multiple UIs

### Streaming Protocol
The server supports both JSON and Server-Sent Events:

**SSE Format** (set `Accept: text/event-stream`):
```
event: start
data: {"conversationId":"..."}

event: token  
data: {"content":"foo","type":"text"}

event: token
data: {"content":"bar","type":"text"}

event: done
data: {"conversationId":"..."}
```

**JSON Format** (default):
```json
{
  "response": "pong",
  "conversationId": "..."
}
```

## 🚧 Roadmap

### Phase 1 (Current)
- ✅ Turborepo monorepo setup
- ✅ Basic server with mock streaming
- ✅ CLI with environment management
- ✅ Server-Sent Events protocol

### Phase 2 (Next)
- [ ] Real AI integration with Vercel AI SDK
- [ ] Conversation persistence with SQLite
- [ ] Cost tracking and usage analytics

### Phase 3 (Future)
- [ ] WebSocket support for real-time collaboration
- [ ] TUI interface
- [ ] VSCode extension
- [ ] Web interface

## 🤝 Contributing

1. **Setup development environment:**
   ```bash
   git clone <repo>
   cd cjode
   pnpm install
   pnpm build
   ```

2. **Create local environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Run tests:**
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm build
   ```

4. **Test the CLI:**
   ```bash
   node packages/cli/bin/cjode.js env --validate
   node packages/cli/bin/cjode.js server &
   node packages/cli/bin/cjode.js chat
   ```

## 📄 License

MIT License - see LICENSE file for details.
