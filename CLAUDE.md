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

### Configuration System
Configuration uses a two-tier merge strategy: global (`~/.tidy/`) merged with local (`.tidy/`), local takes precedence.

- `settings.json` - Model selection, source/target paths, ignore patterns
- `rules.md` - AI system prompt defining categories and organization logic

The rules prompt is fully customizable - edit `~/.tidy/rules.md` to change how AI categorizes files.

### Commands
| Command | Implementation |
|---------|----------------|
| `tidyf [path]` | `src/commands/organize.ts` |
| `tidyf watch` | `src/commands/watch.ts` + `src/lib/watcher.ts` |
| `tidyf config` | `src/commands/config.ts` |

### Key Types
- `FileMetadata` - Scanned file info passed to AI
- `OrganizationProposal` - AI response with categorized file move proposals
- `TidyConfig` - Settings structure for model, folders, ignore patterns

## OpenCode SDK Usage

The app uses `@opencode-ai/sdk` to communicate with AI:
1. Tries connecting to existing OpenCode server on `localhost:4096`
2. If no server, spawns a new one via `createOpencode()`
3. Creates a session and uses `session.prompt()` for AI calls
4. Cleans up server on process exit

## CLI Aliases

The tool installs with multiple command names: `tidyf`, `td`, `tidyfiles`
