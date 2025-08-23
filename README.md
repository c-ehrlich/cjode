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
When developing in this monorepo, **ONLY** local `.env` is used:

```bash
# Copy the example file
cp .env.example .env

# Edit with your real API keys
ANTHROPIC_API_KEY=your_real_key_here
OPENAI_API_KEY=your_openai_key_here
CJODE_DEFAULT_MODEL=claude-3-sonnet
CJODE_SERVER_PORT=3001
CJODE_SERVER_HOST=127.0.0.1
```

**Development mode is detected when:**
- `NODE_ENV=development` is set (automatically set by dev scripts)

**In dev mode:**
- ✅ **ONLY** reads local `.env` file
- ❌ **Ignores** system environment variables
- ❌ **Ignores** global config (`~/.config/cjode/.env`)

You'll see this message in dev mode:
```
🔧 Development mode: using local .env file only
```

#### Production/Global Mode
When using the globally installed CLI, environment variables come from:

**Priority order:**
1. **System environment variables** (highest priority)
2. **Global config file** (fallback):
   - **Linux/macOS**: `~/.config/cjode/.env`
   - **Windows**: `%AppData%\Roaming\cjode\.env`

**Never reads local `.env` files in production mode.**

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
pnpm dev:server

# Start development client (in another terminal)
pnpm dev:client

# With custom port:
PORT=8080 pnpm dev:client

# OR start CLI directly (uses local .env automatically)
node packages/cli/bin/cjode.js server
```

### Testing the AI Chat

**Prerequisites:** Make sure you have a valid Anthropic API key configured:
```bash
# Check your environment
node packages/cli/bin/cjode.js env --validate

# If not configured, set it up
node packages/cli/bin/cjode.js env --setup
```

**Development Workflow:**

1. **Start the hot-reload server:**
   ```bash
   pnpm dev:server
   ```

2. **In another terminal, start the chat client:**
   ```bash
   pnpm dev:client
   
   # Or with custom port:
   PORT=8080 pnpm dev:client
   ```

3. **Test multi-turn conversations:**
   - Each new CLI session creates a fresh conversation
   - Within a session, conversation history is preserved
   - Ask follow-up questions to test context retention

**Manual Testing:**

4. **Test with curl (streaming AI response):**
   ```bash
   curl -X POST http://127.0.0.1:3001/chat \
     -H "Content-Type: application/json" \
     -H "Accept: text/event-stream" \
     -d '{"message": "Hello, can you help me with Python?"}' \
     --no-buffer
   ```

5. **Test with curl (JSON response):**
   ```bash
   curl -X POST http://127.0.0.1:3001/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "What is TypeScript?"}'
   ```

6. **View conversation debug info:**
   ```bash
   # List all conversations
   curl http://127.0.0.1:3001/conversations
   
   # View specific conversation
   curl http://127.0.0.1:3001/conversations/{conversation-id}
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
- **Real AI streaming**: Claude 3.5 Sonnet via Vercel AI SDK
- **Multi-turn conversations**: Conversation history preserved within sessions
- **SSE protocol**: Server-Sent Events for real-time streaming
- **Environment management**: Global and local configuration
- **Hot reload development**: Server restarts automatically on changes
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
