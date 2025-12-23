/**
 * Organize command - main file organization functionality
 *
 * Implements the propose-and-apply pattern:
 * 1. Scan directory for files
 * 2. Analyze with AI
 * 3. Display proposed organization
 * 4. Confirm with user
 * 5. Execute moves
 */

import * as p from "@clack/prompts";
import { homedir } from "os";
import { isAbsolute, resolve } from "path";
import color from "picocolors";
import {
	expandPath,
	initGlobalConfig,
	parseModelString,
	resolveConfig,
} from "../lib/config.ts";
import { analyzeFiles, cleanup } from "../lib/opencode.ts";
import { scanDirectory } from "../lib/scanner.ts";
import type {
	FileMoveProposal,
	MoveResult,
	OrganizationProposal,
	OrganizeOptions,
} from "../types/organizer.ts";
import { fileExists, formatFileSize, moveFile } from "../utils/files.ts";
import {
	getCategoryIcon,
	getFileIcon,
	getStatusIndicator,
} from "../utils/icons.ts";

/**
 * Display a single proposal
 */
function displayProposal(proposal: FileMoveProposal, index: number): void {
	const icon = getFileIcon(proposal.file.name);
	const size = color.dim(`(${formatFileSize(proposal.file.size)})`);
	const confidence = Math.round(proposal.category.confidence * 100);
	const confidenceColor =
		confidence >= 80
			? color.green
			: confidence >= 50
				? color.yellow
				: color.red;

	const conflictWarning = proposal.conflictExists
		? color.yellow(" ⚠ exists")
		: "";

	p.log.message(
		`${color.cyan(`[${index + 1}]`)} ${icon} ${color.bold(proposal.file.name)} ${size}${conflictWarning}\n` +
			`    → ${color.dim(proposal.destination)}\n` +
			`    ${getCategoryIcon(proposal.category.name)} ${proposal.category.name}${proposal.category.subcategory ? `/${proposal.category.subcategory}` : ""} ${confidenceColor(`${confidence}%`)}\n` +
			`    ${color.dim(proposal.category.reasoning)}`,
	);
}

/**
 * Display all proposals grouped by category
 */
function displayAllProposals(proposal: OrganizationProposal): void {
	p.log.info(
		color.bold(
			`\nProposed organization for ${proposal.proposals.length} files:\n`,
		),
	);

	if (proposal.strategy) {
		p.log.message(color.dim(`Strategy: ${proposal.strategy}\n`));
	}

	// Group by category
	const byCategory = new Map<string, FileMoveProposal[]>();
	for (const prop of proposal.proposals) {
		const cat = prop.category.name;
		if (!byCategory.has(cat)) {
			byCategory.set(cat, []);
		}
		byCategory.get(cat)!.push(prop);
	}

	let index = 0;
	for (const [category, props] of byCategory) {
		p.log.info(
			`${getCategoryIcon(category)} ${color.bold(category)} (${props.length} files)`,
		);
		for (const prop of props) {
			displayProposal(prop, index++);
		}
		console.log();
	}

	// Show uncategorized files if any
	if (proposal.uncategorized.length > 0) {
		p.log.warn(
			color.yellow(
				`\n${proposal.uncategorized.length} files could not be categorized:`,
			),
		);
		for (const file of proposal.uncategorized) {
			p.log.message(`  ${getFileIcon(file.name)} ${file.name}`);
		}
	}

	// Show conflict summary
	const conflicts = proposal.proposals.filter((p) => p.conflictExists);
	if (conflicts.length > 0) {
		p.log.warn(
			color.yellow(
				`\n⚠ ${conflicts.length} files have conflicts (destination exists)`,
			),
		);
	}
}

/**
 * Execute all proposals
 */
async function executeProposals(
	proposals: FileMoveProposal[],
): Promise<MoveResult[]> {
	const results: MoveResult[] = [];
	const s = p.spinner();

	for (let i = 0; i < proposals.length; i++) {
		const prop = proposals[i];
		s.start(`Moving ${i + 1}/${proposals.length}: ${prop.file.name}`);

		const result = await moveFile(prop.sourcePath, prop.destination, {
			overwrite: false,
			backup: false,
		});

		results.push(result);

		if (result.status === "completed") {
			s.stop(
				`${color.green("✓")} ${i + 1}/${proposals.length}: ${prop.file.name}`,
			);
		} else if (result.status === "failed") {
			s.stop(
				`${color.red("✗")} ${i + 1}/${proposals.length}: ${prop.file.name} - ${result.error}`,
			);
		} else {
			s.stop(
				`${getStatusIndicator(result.status)} ${i + 1}/${proposals.length}: ${prop.file.name}`,
			);
		}
	}

	// Summary
	const completed = results.filter((r) => r.status === "completed").length;
	const failed = results.filter((r) => r.status === "failed").length;
	const skipped = results.filter((r) => r.status === "skipped").length;

	p.log.success(
		`\nMoved ${completed} files` +
			(failed > 0 ? color.red(`, ${failed} failed`) : "") +
			(skipped > 0 ? color.yellow(`, ${skipped} skipped`) : ""),
	);

	return results;
}

/**
 * View details of a specific proposal
 */
async function viewProposalDetails(
	proposals: FileMoveProposal[],
): Promise<void> {
	const options = proposals.map((p, i) => ({
		value: i,
		label: `[${i + 1}] ${p.file.name}`,
		hint: p.category.name,
	}));

	const selectedIndex = await p.select({
		message: "Which file to view?",
		options,
	});

	if (p.isCancel(selectedIndex)) {
		return;
	}

	const prop = proposals[selectedIndex as number];

	console.log();
	p.log.info(color.bold(`File: ${prop.file.name}`));
	p.log.message(`  Path: ${prop.file.path}`);
	p.log.message(`  Size: ${formatFileSize(prop.file.size)}`);
	p.log.message(`  Type: ${prop.file.mimeType || "unknown"}`);
	p.log.message(`  Modified: ${prop.file.modifiedAt.toLocaleString()}`);
	console.log();
	p.log.info(color.bold("Proposed destination:"));
	p.log.message(`  ${prop.destination}`);
	console.log();
	p.log.info(color.bold("Categorization:"));
	p.log.message(`  Category: ${prop.category.name}`);
	p.log.message(`  Subcategory: ${prop.category.subcategory || "none"}`);
	p.log.message(`  Confidence: ${Math.round(prop.category.confidence * 100)}%`);
	p.log.message(`  Reasoning: ${prop.category.reasoning}`);

	if (prop.conflictExists) {
		p.log.warn(color.yellow("\n⚠ A file already exists at the destination"));
	}

	console.log();
}

/**
 * Resolve path with home directory expansion
 */
function resolvePath(inputPath: string): string {
	const expanded = expandPath(inputPath);
	return isAbsolute(expanded) ? expanded : resolve(expanded);
}

/**
 * Main organize command
 */
export async function organizeCommand(options: OrganizeOptions): Promise<void> {
	p.intro(color.bgGreen(color.black(" tidyf ")));

	// Initialize global config if needed
	initGlobalConfig();

	// Resolve configuration
	const config = resolveConfig();

	// Determine source directory
	const sourcePath = resolvePath(
		options.path || config.defaultSource || config.folders?.[0]?.sources?.[0] || "~/Downloads",
	);

	// Determine target directory
	const targetPath = resolvePath(
		options.target ||
			config.folders?.[0]?.target ||
			config.defaultTarget ||
			"~/Documents/Organized",
	);

	p.log.info(`Source: ${color.cyan(sourcePath)}`);
	p.log.info(`Target: ${color.cyan(targetPath)}`);

	// Scan directory
	const spinner = p.spinner();
	spinner.start("Scanning directory...");

	const files = await scanDirectory(sourcePath, {
		recursive: options.recursive,
		maxDepth: parseInt(options.depth || "1"),
		ignore: config.ignore,
		readContent: config.readContent,
		maxContentSize: config.maxContentSize,
	});

	spinner.stop(`Found ${color.bold(String(files.length))} files`);

	if (files.length === 0) {
		p.outro(color.yellow("No files to organize"));
		return;
	}

	// Show file summary
	p.log.info(
		`Total size: ${formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}`,
	);

	// Analyze with AI
	spinner.start("Analyzing files with AI...");

	let proposal: OrganizationProposal;
	try {
		proposal = await analyzeFiles({
			files,
			targetDir: targetPath,
			model: parseModelString(options.model),
		});
		spinner.stop("Analysis complete");
	} catch (error: any) {
		spinner.stop("Analysis failed");
		p.cancel(error.message);
		cleanup();
		process.exit(1);
	}

	// Display proposals
	displayAllProposals(proposal);

	// Dry run mode
	if (options.dryRun) {
		p.outro(color.cyan("Dry run complete. No files moved."));
		cleanup();
		return;
	}

	// If no proposals, exit
	if (proposal.proposals.length === 0) {
		p.outro(color.yellow("No files to organize"));
		cleanup();
		return;
	}

	// Interactive confirmation loop
	let done = false;
	while (!done) {
		if (options.yes) {
			// Auto-apply all
			await executeProposals(proposal.proposals);
			done = true;
		} else {
			const action = await p.select({
				message: "What would you like to do?",
				options: [
					{
						value: "apply_all",
						label: `Apply all ${proposal.proposals.length} moves`,
						hint: "Organize files as proposed",
					},
					{
						value: "view_details",
						label: "View file details",
						hint: "See more info about a file",
					},
					{
						value: "regenerate",
						label: "Regenerate analysis",
						hint: "Ask AI to re-analyze with different instructions",
					},
					{
						value: "cancel",
						label: "Cancel",
					},
				],
			});

			if (p.isCancel(action) || action === "cancel") {
				p.cancel("Aborted");
				cleanup();
				process.exit(0);
			}

			switch (action) {
				case "apply_all":
					await executeProposals(proposal.proposals);
					done = true;
					break;

				case "view_details":
					await viewProposalDetails(proposal.proposals);
					break;

				case "regenerate": {
					const newInstructions = await p.text({
						message:
							"Enter additional instructions for AI (or press Enter to retry):",
						placeholder: "e.g., Keep all PDFs together, sort images by date",
					});

					if (p.isCancel(newInstructions)) {
						break;
					}

					spinner.start("Re-analyzing files with AI...");
					try {
						proposal = await analyzeFiles({
							files,
							targetDir: targetPath,
							instructions: newInstructions || undefined,
							model: parseModelString(options.model),
						});
						spinner.stop("Analysis complete");
						displayAllProposals(proposal);
					} catch (error: any) {
						spinner.stop("Analysis failed");
						p.log.error(error.message);
					}
					break;
				}
			}
		}
	}

	p.outro(color.green("Done!"));
	cleanup();
}
