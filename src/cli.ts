#!/usr/bin/env node

/**
 * tidy - AI-powered file organizer CLI
 */

import { Command } from "commander";
import { configCommand } from "./commands/config.ts";
import { organizeCommand } from "./commands/organize.ts";
import { watchCommand } from "./commands/watch.ts";

const program = new Command();

program
	.name("tidyf")
	.description("AI-powered file organizer using opencode.ai")
	.version("1.0.0");

// Default command - organize files
program
	.argument("[path]", "Directory to organize (default: ~/Downloads)")
	.option("-d, --dry-run", "Preview changes without moving files")
	.option("-y, --yes", "Skip confirmation prompts and apply all")
	.option("-r, --recursive", "Scan subdirectories")
	.option("--depth <n>", "Max subdirectory depth to scan", "1")
	.option("-t, --target <path>", "Target directory for organized files")
	.option("-m, --model <id>", "Override model (provider/model)")
	.action(async (path, options) => {
		await organizeCommand({ path, ...options });
	});

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
	.action(async (paths, options) => {
		await watchCommand({ paths, ...options });
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

// Handle errors gracefully
process.on("unhandledRejection", (error: Error) => {
	console.error("Error:", error.message);
	process.exit(1);
});

program.parse();
