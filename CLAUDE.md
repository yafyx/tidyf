# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

tidyf is an AI-powered file organizer CLI that uses OpenCode.ai to intelligently categorize and organize files. It scans directories, sends file metadata to AI for analysis, and moves files to appropriate category-based subfolders.

## Development Commands

```bash
bun install          # Install dependencies
bun run dev          # Development mode with hot reload
bun run build        # Build for production (outputs to dist/)
bun run typecheck    # Run TypeScript type checking
bun run start        # Run the built CLI
```

## Architecture

### Entry Points
- `src/cli.ts` - CLI entry point using Commander.js, defines commands (organize, watch, config)
- `src/index.ts` - Library exports for programmatic usage

### Core Flow
1. **Scanner** (`src/lib/scanner.ts`) - Scans directories, collects file metadata (name, extension, size, MIME type, optional content preview)
2. **OpenCode Integration** (`src/lib/opencode.ts`) - Connects to OpenCode server, sends file metadata + rules prompt to AI, parses JSON response into `OrganizationProposal`
3. **File Operations** (`src/utils/files.ts`) - Handles file moves, conflict resolution, directory creation
4. **History** (`src/lib/history.ts`) - Tracks file operations for undo functionality
5. **Profiles** (`src/lib/profiles.ts`) - Manages named organization profiles with custom rules

### Configuration System
Configuration uses a two-tier merge strategy: global (`~/.tidy/`) merged with local (`.tidy/`), local takes precedence.

- `settings.json` - Model selection, source/target paths, ignore patterns
- `rules.md` - AI system prompt defining categories and organization logic

The rules prompt is fully customizable - edit `~/.tidy/rules.md` to change how AI categorizes files.

### Commands
| Command | Alias | Implementation |
|---------|-------|----------------|
| `tidyf [path]` | - | `src/commands/organize.ts` |
| `tidyf watch` | `w` | `src/commands/watch.ts` + `src/lib/watcher.ts` |
| `tidyf config` | `c` | `src/commands/config.ts` |
| `tidyf profile` | `pr` | `src/commands/profile.ts` + `src/lib/profiles.ts` |
| `tidyf undo` | `u` | `src/commands/undo.ts` + `src/lib/history.ts` |

### Key Types
- `FileMetadata` - Scanned file info passed to AI
- `OrganizationProposal` - AI response with categorized file move proposals
- `TidyConfig` - Settings structure for model, folders, ignore patterns

## OpenCode SDK Usage

The app uses `@opencode-ai/sdk` to communicate with AI:
1. Tries connecting to existing OpenCode server on `localhost:4096`
2. If no server, spawns a new one via `createOpencode()`
3. Creates a session and uses `session.prompt()` for AI calls
4. **CRITICAL**: Cleans up server on process exit to avoid orphaned processes

**NEVER** spawn multiple OpenCode instances - always check for existing server first.

## CLI Aliases

The tool installs with multiple command names: `tidyf`, `td`, `tidyfiles`

## Common CLI Options

| Option | Description |
|--------|-------------|
| `-d, --dry-run` | Preview changes without moving files |
| `-y, --yes` | Skip confirmation prompts and apply all |
| `-r, --recursive` | Scan subdirectories |
| `--depth <n>` | Max subdirectory depth (default: 1) |
| `-m, --model <id>` | Override model (provider/model format) |
| `-p, --profile <name>` | Use named profile |

## Raycast Extension

The project includes a Raycast extension in `extensions/raycast/` that provides a native macOS GUI for tidyf.

### Extension Commands
| Command | Mode | Description |
|---------|------|-------------|
| Organize Files | view | Interactive folder picker with AI model selection, shows proposals for review |
| Quick Tidy Downloads | no-view | Instantly organizes `~/Downloads` with high-confidence moves (>80%) |

### Raycast-Specific Architecture
- **Entry Point**: `src/raycast-index.ts` - Library exports for Raycast, **excludes** watcher and CLI commands to avoid native dependency issues (chokidar/fsevents)
- **OpenCode Client**: `src/lib/opencode.raycast.ts` - Ephemeral server pattern with PATH fixes for Raycast's limited environment
- **Core Bridge**: `extensions/raycast/src/utils/core-bridge.ts` - Safe wrappers around tidyf exports
- **Components**: `extensions/raycast/src/components/` - React components for Raycast UI

### Development Commands (from `extensions/raycast/`)
```bash
npm run dev          # ray develop - development mode with hot reload
npm run build        # ray build -e dist - production build
npm run lint         # ray lint - check for issues
npm run fix-lint     # ray lint --fix - auto-fix issues
```

### Key Considerations
- **PATH Issues**: Raycast has a limited PATH; `fix-path` and explicit path additions in `opencode.raycast.ts` handle this
- **No Native Dependencies**: The Raycast build cannot use `chokidar` or other fsevents-based modules
- **Model Selection**: Uses grouped dropdown by provider, persists selection with `storeValue`

## Code Conventions

- **Commands**: Export a single async function named `{command}Command` (e.g., `organizeCommand`)
- **Types**: Define in `src/types/` directory, export from `src/index.ts`
- **Interactive prompts**: Use `@clack/prompts` for all CLI interactions
- **Colors**: Use `picocolors` for terminal output styling
- **File watching**: Use `chokidar` for filesystem monitoring
