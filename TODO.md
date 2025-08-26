TOOLS

File Operations:

Read (path, optional read_range) - read files
create_file (path, content) - create/overwrite files
edit_file (path, old_str, new_str, optional replace_all) - edit files
undo_edit (path) - undo last edit
format_file (path) - format with VS Code
list_directory (path) - list directory contents
Search & Discovery:

codebase_search_agent (query) - intelligent codebase search
Grep (pattern, optional caseSensitive/path/glob) - text pattern search
glob (filePattern, optional limit/offset) - find files by pattern
get_diagnostics (path) - get errors/warnings
Web & External:

web_search (query, optional num_results) - search web
read_web_page (url, optional prompt/raw) - read web content
read_mcp_resource (server, uri) - read MCP resources
Development:

Bash (cmd, optional cwd) - run shell commands
summarize_git_diff (gitDiffCommand, optional includeUntracked) - review git changes
AI Assistants:

oracle (task, optional context/files) - AI advisor for planning/reviews
Task (prompt, description) - run subagent for complex tasks
Task Management:

todo_read () - read current todos
todo_write (todos array) - update todo list
Visualization:

mermaid (code) - render diagrams
Browser Tools:

Multiple mcp__playwright__browser_* functions for web automation