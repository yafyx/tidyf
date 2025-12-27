#!/usr/bin/env node

/**
 * tidy - AI-powered file organizer CLI
 */

import { Command } from "commander";
import updateNotifier from "simple-update-notifier";
import { createRequire } from "module";
import { configCommand } from "./commands/config.ts";
import { organizeCommand } from "./commands/organize.ts";
import { profileCommand } from "./commands/profile.ts";
import { undoCommand } from "./commands/undo.ts";
import { watchCommand } from "./commands/watch.ts";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// Check for updates (non-blocking, cached for 1 day)
updateNotifier({ pkg });

const program = new Command();

program
	.name("tidyf")
	.description("AI-powered file organizer using opencode.ai")
	.version(pkg.version);

// Watch command - monitor folders for new files
program
	.command("watch")
	.alias("w")
	.description("Watch folders for new files and auto-organize")
	.argument("[paths...]", "Directories to watch")
	.option("-d, --delay <ms>", "Debounce delay in milliseconds", "3000")
	.option("-a, --auto", "Auto-apply without confirmation")
	.option("-q, --queue", "Queue files for review instead of auto-apply")
	.option("-m, --model <id>", "Override model (provider/model)")
	.option("-p, --profile <name>", "Use named profile")
	.action(async (paths, options) => {
		await watchCommand({ paths, ...options });
	});

// Profile command - manage organization profiles
program
	.command("profile [action]")
	.alias("pr")
	.description("Manage organization profiles")
	.argument("[name]", "Profile name for action")
	.argument("[extra]", "Extra argument (e.g., destination for copy)")
	.option("-c, --from-current", "Create from current effective config")
	.option("-f, --force", "Skip confirmation prompts")
	.action(async (action, name, extra, options) => {
		await profileCommand({ action, name, args: extra ? [extra] : [], ...options });
	});

// Config command - configure settings
program
	.command("config")
	.alias("c")
	.description("Configure AI models, target folders, and rules")
	.option("-l, --local", "Configure local settings (current directory)")
	.action(async (options) => {
		await configCommand(options);
	});

// Undo command - revert file organization
program
	.command("undo")
	.alias("u")
	.description("Undo the last file organization operation")
	.action(async () => {
		await undoCommand();
	});

// Default command - organize files (must be defined last to not intercept subcommands)
program
	.argument("[path]", "Directory to organize (default: ~/Downloads)")
	.option("-d, --dry-run", "Preview changes without moving files")
	.option("-y, --yes", "Skip confirmation prompts and apply all")
	.option("-r, --recursive", "Scan subdirectories")
	.option("--depth <n>", "Max subdirectory depth to scan", "1")
	.option("-s, --source <path>", "Source directory to organize")
	.option("-t, --target <path>", "Target directory for organized files")
	.option("-m, --model <id>", "Override model (provider/model)")
	.option("-p, --profile <name>", "Use named profile")
	.action(async (path, options) => {
		await organizeCommand({ path: path || options.source, ...options });
	});

// Handle errors gracefully
process.on("unhandledRejection", (error: Error) => {
	console.error("Error:", error.message);
	process.exit(1);
});

program.parse();
