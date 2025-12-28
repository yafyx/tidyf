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
import { existsSync } from "fs";
import { isAbsolute, resolve } from "path";
import color from "picocolors";
import {
  expandPath,
  initGlobalConfig,
  parseModelString,
  resolveConfig,
  resolveConfigWithProfile,
  getRulesPromptWithProfile,
} from "../lib/config.ts";
import { analyzeFiles, cleanup } from "../lib/opencode.ts";
import { listProfiles, profileExists } from "../lib/profiles.ts";
import {
  addMoveToHistory,
  createHistoryEntry,
  saveHistoryEntry,
} from "../lib/history.ts";
import { scanDirectory, scanFolderStructure } from "../lib/scanner.ts";
import type {
  FileMetadata,
  FileMoveProposal,
  MoveResult,
  OrganizationProposal,
  OrganizeOptions,
  DuplicateGroup,
} from "../types/organizer.ts";
import { formatFileSize, generateUniqueName, getFileStats, moveFile, computeFileHash } from "../utils/files.ts";
import {
  getCategoryIcon,
  getFileIcon,
  getStatusIndicator,
} from "../utils/icons.ts";
import { pickModel } from "./modelPicker.ts";

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
 * Display file tree for proposals
 */
function displayFileTree(proposals: FileMoveProposal[]): void {
  const tree = new Map<string, FileMoveProposal[]>();

  for (const prop of proposals) {
    const parts = prop.destination.split(/[/\\]/);
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (i === parts.length - 1) {
        if (!tree.has(currentPath)) {
          tree.set(currentPath, []);
        }
        tree.get(currentPath)!.push(prop);
      }
    }
  }

  const sortedPaths = Array.from(tree.keys()).sort();
  const indent = "  ";

  p.log.info(color.bold("Folder structure:"));
  console.log();

  for (const path of sortedPaths) {
    const props = tree.get(path)!;
    const depth = path.split(/[/\\]/).length - 1;

    if (depth === 1) {
      console.log(`${color.cyan("├─")} ${color.bold(path)}`);
    } else {
      const parentPath = path.split(/[/\\]/).slice(0, -1).join("/");
      const parentProps = tree.get(parentPath);
      if (!parentProps) {
        console.log(`${"│ ".repeat(depth - 1)}├─ ${color.bold(path)}`);
      }
    }

    for (const prop of props) {
      const icon = getFileIcon(prop.file.name);
      const size = color.dim(`(${formatFileSize(prop.file.size)})`);
      console.log(`  ${"│ ".repeat(depth)}  ${icon} ${prop.file.name} ${size}`);
    }
  }

  console.log();
}

/**
 * Display all proposals grouped by category
 */
function displayAllProposals(proposal: OrganizationProposal, useTreeView: boolean = false): void {
  p.log.info(
    color.bold(
      `\nProposed organization for ${proposal.proposals.length} files:\n`,
    ),
  );

  if (proposal.strategy) {
    p.log.message(color.dim(`Strategy: ${proposal.strategy}\n`));
  }

  // Show tree view for large file sets
  if (useTreeView) {
    displayFileTree(proposal.proposals);
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

  if (!useTreeView) {
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
 * Display conflict details for a proposal
 */
async function displayConflictDetails(proposal: FileMoveProposal): Promise<void> {
  const sourceStats = await getFileStats(proposal.sourcePath);
  const destStats = await getFileStats(proposal.destination);

  console.log();
  p.log.info(color.bold(`Conflict: ${proposal.file.name}`));
  console.log();

  p.log.message(color.bold("Source file (to be moved):"));
  p.log.message(`  Path: ${proposal.sourcePath}`);
  p.log.message(`  Size: ${sourceStats ? color.green(formatFileSize(sourceStats.size)) : color.red("Unknown")}`);
  p.log.message(`  Modified: ${sourceStats ? color.cyan(sourceStats.mtime.toLocaleString()) : color.red("Unknown")}`);

  console.log();
  p.log.message(color.bold("Destination file (existing):"));
  p.log.message(`  Path: ${proposal.destination}`);
  p.log.message(`  Size: ${destStats ? color.yellow(formatFileSize(destStats.size)) : color.red("Unknown")}`);
  p.log.message(`  Modified: ${destStats ? color.cyan(destStats.mtime.toLocaleString()) : color.red("Unknown")}`);

  console.log();
  if (sourceStats && destStats) {
    const sizeDiff = sourceStats.size - destStats.size;
    const timeDiff = sourceStats.mtime.getTime() - destStats.mtime.getTime();

    p.log.info(color.bold("Comparison:"));
    p.log.message(`  Size difference: ${sizeDiff > 0 ? color.green("+" + formatFileSize(Math.abs(sizeDiff))) : sizeDiff < 0 ? color.red("-" + formatFileSize(Math.abs(sizeDiff))) : color.dim("Same size")}`);
    p.log.message(`  Age difference: ${timeDiff > 0 ? color.green("Source is newer") : timeDiff < 0 ? color.yellow("Destination is newer") : color.dim("Same age")}`);
  }

  console.log();
}

/**
 * Select specific files to move using multiselect
 */
async function selectFilesToMove(
  proposals: FileMoveProposal[],
): Promise<number[]> {
  const options = proposals.map((p, i) => ({
    value: i,
    label: p.file.name,
    hint: `${p.category.name}${p.category.subcategory ? "/" + p.category.subcategory : ""} ${formatFileSize(p.file.size)}`,
  }));

  const selected = await p.multiselect({
    message: "Select files to move (press Space to select/deselect, Enter to confirm):",
    options,
    required: false,
  });

  if (p.isCancel(selected)) {
    return [];
  }

  return selected as number[];
}

/**
 * Execute all proposals
 */
async function executeProposals(
  proposals: FileMoveProposal[],
  sourcePath: string,
  targetPath: string,
): Promise<MoveResult[]> {
  const results: MoveResult[] = [];
  const historyEntry = createHistoryEntry(sourcePath, targetPath);
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
      addMoveToHistory(historyEntry, prop.sourcePath, prop.destination);
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

  // Save history if any moves were successful
  const completed = results.filter((r) => r.status === "completed").length;
  if (completed > 0) {
    saveHistoryEntry(historyEntry);
  }

  // Summary
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
 * Execute all proposals quietly (for JSON mode)
 */
async function executeProposalsQuiet(
  proposals: FileMoveProposal[],
  sourcePath: string,
  targetPath: string,
): Promise<MoveResult[]> {
  const results: MoveResult[] = [];
  const historyEntry = createHistoryEntry(sourcePath, targetPath);

  for (const prop of proposals) {
    const result = await moveFile(prop.sourcePath, prop.destination, {
      overwrite: false,
      backup: false,
    });

    results.push(result);

    if (result.status === "completed") {
      addMoveToHistory(historyEntry, prop.sourcePath, prop.destination);
    }
  }

  const completed = results.filter((r) => r.status === "completed").length;
  if (completed > 0) {
    saveHistoryEntry(historyEntry);
  }

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
 * Convert proposal to JSON-serializable format
 */
function toJsonOutput(proposal: OrganizationProposal, results?: MoveResult[]): object {
  return {
    proposals: proposal.proposals.map(p => ({
      source: p.sourcePath,
      destination: p.destination,
      file: {
        name: p.file.name,
        extension: p.file.extension,
        size: p.file.size,
        mimeType: p.file.mimeType,
        hash: p.file.hash,
      },
      category: p.category,
      conflictExists: p.conflictExists,
    })),
    strategy: proposal.strategy,
    uncategorized: proposal.uncategorized.map(f => ({
      name: f.name,
      path: f.path,
      size: f.size,
    })),
    duplicates: proposal.duplicates?.map(d => ({
      hash: d.hash,
      files: d.files.map(f => ({ name: f.name, path: f.path, size: f.size })),
      wastedBytes: d.wastedBytes,
    })),
    analyzedAt: proposal.analyzedAt.toISOString(),
    results: results?.map(r => ({
      source: r.source,
      destination: r.destination,
      status: r.status,
      error: r.error,
    })),
  };
}

/**
 * Detect duplicate files by computing content hashes
 */
async function detectDuplicates(files: FileMetadata[]): Promise<DuplicateGroup[]> {
  const hashMap = new Map<string, FileMetadata[]>();

  for (const file of files) {
    if (file.hash) {
      const existing = hashMap.get(file.hash) || [];
      existing.push(file);
      hashMap.set(file.hash, existing);
    }
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [hash, groupFiles] of hashMap) {
    if (groupFiles.length > 1) {
      const totalSize = groupFiles.reduce((sum, f) => sum + f.size, 0);
      const wastedBytes = totalSize - groupFiles[0].size;
      duplicates.push({ hash, files: groupFiles, wastedBytes });
    }
  }

  return duplicates.sort((a, b) => b.wastedBytes - a.wastedBytes);
}

/**
 * Display duplicate file groups
 */
function displayDuplicates(duplicates: DuplicateGroup[]): void {
  if (duplicates.length === 0) return;

  const totalWasted = duplicates.reduce((sum, d) => sum + d.wastedBytes, 0);

  p.log.warn(color.yellow(`\n⚠ Found ${duplicates.length} duplicate groups (${formatFileSize(totalWasted)} wasted)`));

  for (const group of duplicates.slice(0, 5)) {
    p.log.message(`\n  ${color.dim(group.hash.slice(0, 8))} - ${group.files.length} copies (${formatFileSize(group.wastedBytes)} wasted)`);
    for (const file of group.files) {
      p.log.message(`    ${getFileIcon(file.name)} ${file.name} ${color.dim(`(${formatFileSize(file.size)})`)}`);
    }
  }

  if (duplicates.length > 5) {
    p.log.message(color.dim(`\n  ... and ${duplicates.length - 5} more duplicate groups`));
  }
}

/**
 * Main organize command
 */
export async function organizeCommand(options: OrganizeOptions): Promise<void> {
  const isJsonMode = options.json === true;

  if (!isJsonMode) {
    p.intro(color.bgGreen(color.black(" tidyf ")));
  }

  // Initialize global config if needed
  initGlobalConfig();

  // Validate and resolve profile if specified
  if (options.profile) {
    if (!profileExists(options.profile)) {
      if (isJsonMode) {
        console.log(JSON.stringify({ error: `Profile "${options.profile}" not found` }));
        process.exit(1);
      }
      p.log.error(`Profile "${options.profile}" not found`);
      const profiles = listProfiles();
      if (profiles.length > 0) {
        p.log.info("Available profiles:");
        profiles.forEach((pr) => p.log.message(`  - ${pr.name}`));
      }
      const create = await p.confirm({
        message: `Create profile "${options.profile}"?`,
        initialValue: false,
      });
      if (p.isCancel(create) || !create) {
        p.outro("Canceled");
        cleanup();
        process.exit(0);
      }
      // Redirect to profile creation
      const { profileCommand } = await import("./profile.ts");
      await profileCommand({ action: "create", name: options.profile });
      // Re-run organize with the now-existing profile
      p.log.info("Profile created. Continuing with organization...");
    }
    if (!isJsonMode) {
      p.log.info(`Profile: ${color.cyan(options.profile)}`);
    }
  }

  // Resolve configuration (with profile if specified)
  const config = options.profile
    ? resolveConfigWithProfile(options.profile)
    : resolveConfig();

  // Determine source directory
  const sourcePath = resolvePath(
    options.path ||
      config.defaultSource ||
      config.folders?.[0]?.sources?.[0] ||
      "~/Downloads",
  );

  // Determine target directory
  const targetPath = resolvePath(
    options.target ||
      config.defaultTarget ||
      config.folders?.[0]?.target ||
      "~/Documents/Organized",
  );

  if (!isJsonMode) {
    p.log.info(`Source: ${color.cyan(sourcePath)}`);
    p.log.info(`Target: ${color.cyan(targetPath)}`);
  }

  // Check if source directory exists
  if (!existsSync(sourcePath)) {
    if (isJsonMode) {
      console.log(JSON.stringify({ error: `Directory does not exist: ${sourcePath}` }));
      process.exit(1);
    }
    console.log();
    p.log.error(color.red("Directory does not exist"));

    console.log();
    p.log.message(`${color.cyan("Missing directory:")} ${sourcePath}`);

    console.log();

    const action = await p.select({
      message: "What would you like to do?",
      options: [
        {
          value: "create",
          label: "Create this directory",
        },
        {
          value: "change_path",
          label: "Choose a different directory",
        },
        {
          value: "exit",
          label: "Exit",
        },
      ],
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro("Canceled");
      cleanup();
      process.exit(0);
    }

    if (action === "create") {
      const { mkdir } = await import("fs/promises");
      try {
        await mkdir(sourcePath, { recursive: true });
        p.log.success(`Created directory: ${color.cyan(sourcePath)}`);
      } catch (error: any) {
        p.log.error(`Failed to create directory: ${error.message}`);
        p.outro("Canceled");
        cleanup();
        process.exit(0);
      }
    }

    if (action === "change_path") {
      console.log();
      const newPath = await p.text({
        message: "Enter directory path to scan:",
        placeholder: "~/Downloads",
      });

      if (!p.isCancel(newPath) && newPath.trim()) {
        await organizeCommand({
          ...options,
          path: newPath.trim(),
        });
        return;
      } else {
        p.outro("Canceled");
        cleanup();
        process.exit(0);
      }
    }
  }

  // Scan directory
  let spinner: ReturnType<typeof p.spinner> | null = null;
  if (!isJsonMode) {
    spinner = p.spinner();
    spinner.start("Scanning directory...");
  }

  let files = await scanDirectory(sourcePath, {
    recursive: options.recursive,
    maxDepth: parseInt(options.depth || "1"),
    ignore: config.ignore,
    readContent: config.readContent,
    maxContentSize: config.maxContentSize,
  });

  // Compute file hashes for duplicate detection if requested
  if (options.detectDuplicates) {
    for (const file of files) {
      file.hash = await computeFileHash(file.path) || undefined;
    }
  }

  if (!isJsonMode && spinner) {
    spinner.stop(`Found ${color.bold(String(files.length))} files`);
  }

  if (files.length === 0) {
    if (isJsonMode) {
      console.log(JSON.stringify({ proposals: [], strategy: "No files found", uncategorized: [], analyzedAt: new Date().toISOString() }));
      cleanup();
      return;
    }
    console.log();
    p.log.warn(color.yellow("No files to organize"));

    console.log();
    p.log.message(`${color.cyan("Scanned directory:")} ${sourcePath}`);

    console.log();
    p.log.info("Possible reasons:");
    p.log.message(`  • The directory is empty`);
    p.log.message(`  • All files are ignored by your ignore patterns`);
    p.log.message(`  • You're not scanning recursively and files are in subdirectories`);

    if (config.ignore && config.ignore.length > 0) {
      console.log();
      p.log.info(`Active ignore patterns: ${color.dim(config.ignore.join(", "))}`);
    }

    console.log();

    const action = await p.select({
      message: "What would you like to do?",
      options: [
        {
          value: "scan_recursive",
          label: "Scan recursively",
          hint: !options.recursive ? "Include subdirectories" : "Already scanning recursively",
        },
        {
          value: "change_path",
          label: "Choose a different directory",
        },
        {
          value: "edit_config",
          label: "Edit configuration",
          hint: "Modify ignore patterns and settings",
        },
        {
          value: "exit",
          label: "Exit",
        },
      ],
    });

    if (p.isCancel(action) || action === "exit") {
      p.outro("Nothing to do");
      cleanup();
      process.exit(0);
    }

    if (action === "scan_recursive") {
      console.log();
      const newPath = await p.text({
        message: "Enter directory path (or press Enter to use current):",
        placeholder: sourcePath,
        defaultValue: sourcePath,
      });

      if (!p.isCancel(newPath) && newPath.trim()) {
        await organizeCommand({
          ...options,
          path: newPath.trim(),
          recursive: true,
        });
        return;
      }
    }

    if (action === "change_path") {
      console.log();
      const newPath = await p.text({
        message: "Enter directory path to scan:",
        placeholder: "~/Downloads",
      });

      if (!p.isCancel(newPath) && newPath.trim()) {
        await organizeCommand({
          ...options,
          path: newPath.trim(),
        });
        return;
      }
    }

    if (action === "edit_config") {
      console.log();
      p.log.message(`Run ${color.cyan("tidyf config")} to open the configuration editor`);
      console.log();
      p.outro("Exiting...");
      cleanup();
      process.exit(0);
    }

    p.outro("Nothing to do");
    cleanup();
    process.exit(0);
  }

  // Show file summary
  if (!isJsonMode) {
    p.log.info(
      `Total size: ${formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}`,
    );
  }

  // Scan existing folder structure in target directory
  let existingFolders: string[] = [];
  try {
    existingFolders = await scanFolderStructure(targetPath, {
      maxDepth: 3,
      includeEmpty: false,
      ignore: config.ignore,
    });
    if (!isJsonMode && existingFolders.length > 0) {
      p.log.info(`Found ${color.bold(String(existingFolders.length))} existing folders in target`);
    }
  } catch {
    // Target directory might not exist yet - OK
  }

  // Analyze with AI
  if (!isJsonMode && spinner) {
    spinner.start("Analyzing files with AI...");
  }

  let proposal: OrganizationProposal;
  try {
    const BATCH_SIZE = 50;

    if (files.length > BATCH_SIZE) {
      if (!isJsonMode) {
        p.log.info(`Processing ${files.length} files in batches of ${BATCH_SIZE}...`);
      }

      let allProposals: FileMoveProposal[] = [];
      let allUncategorized: FileMetadata[] = [];
      let strategies: string[] = [];

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(files.length / BATCH_SIZE);

        if (!isJsonMode && spinner) {
          spinner.start(`Analyzing batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
        }

        const batchProposal = await analyzeFiles({
          files: batch,
          targetDir: targetPath,
          model: parseModelString(options.model),
          existingFolders,
          profileName: options.profile,
        });

        allProposals = allProposals.concat(batchProposal.proposals);
        allUncategorized = allUncategorized.concat(batchProposal.uncategorized);
        if (batchProposal.strategy) {
          strategies.push(batchProposal.strategy);
        }
      }

      if (!isJsonMode && spinner) {
        spinner.stop("Analysis complete");
      }
      proposal = {
        proposals: allProposals,
        strategy: strategies.join("; "),
        uncategorized: allUncategorized,
        analyzedAt: new Date(),
      };
    } else {
      proposal = await analyzeFiles({
        files,
        targetDir: targetPath,
        model: parseModelString(options.model),
        existingFolders,
        profileName: options.profile,
      });
      if (!isJsonMode && spinner) {
        spinner.stop("Analysis complete");
      }
    }
  } catch (error: any) {
    if (isJsonMode) {
      console.log(JSON.stringify({ error: error.message }));
      cleanup();
      process.exit(1);
    }
    if (spinner) {
      spinner.stop("Analysis failed");
    }
    p.cancel(error.message);
    cleanup();
    process.exit(1);
  }

  // Detect duplicates if requested
  if (options.detectDuplicates) {
    const duplicates = await detectDuplicates(files);
    proposal.duplicates = duplicates;
    if (!isJsonMode && duplicates.length > 0) {
      displayDuplicates(duplicates);
    }
  }

  // JSON mode: output and exit
  if (isJsonMode) {
    if (options.dryRun || options.yes === false) {
      console.log(JSON.stringify(toJsonOutput(proposal)));
    } else {
      // Execute moves and include results
      const results = await executeProposalsQuiet(proposal.proposals, sourcePath, targetPath);
      console.log(JSON.stringify(toJsonOutput(proposal, results)));
    }
    cleanup();
    return;
  }

  // Display proposals
  const useTreeView = proposal.proposals.length >= 20;
  displayAllProposals(proposal, useTreeView);

  // Check for conflicts
  const conflicts = proposal.proposals.filter((p) => p.conflictExists);
  const hasConflicts = conflicts.length > 0;

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
      await executeProposals(proposal.proposals, sourcePath, targetPath);
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
          ...(hasConflicts
            ? [
                {
                  value: "resolve_conflicts" as const,
                  label: `Resolve ${conflicts.length} conflicts`,
                  hint: "Review and handle conflicting files",
                },
              ]
            : []),
          {
            value: "select_individual",
            label: "Select specific files to move",
            hint: "Choose which files to organize",
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
            value: "regenerate_with_model",
            label: "Regenerate analysis (different model)",
            hint: "Re-analyze using another provider/model",
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
          await executeProposals(proposal.proposals, sourcePath, targetPath);
          done = true;
          break;

        case "resolve_conflicts": {
          const conflictIndex = await p.select({
            message: "Which conflict to view?",
            options: conflicts.map((p, i) => ({
              value: i,
              label: p.file.name,
              hint: formatFileSize(p.file.size),
            })),
          });

          if (p.isCancel(conflictIndex)) {
            break;
          }

          await displayConflictDetails(conflicts[conflictIndex as number]);

          const resolution = await p.select({
            message: "How to resolve this conflict?",
            options: [
              { value: "rename", label: "Rename (auto-generate new name)", hint: "Keep both files" },
              { value: "overwrite", label: "Overwrite", hint: "Replace destination file" },
              { value: "skip", label: "Skip", hint: "Don't move this file" },
              { value: "cancel", label: "Cancel", hint: "Return to main menu" },
            ],
          });

          if (p.isCancel(resolution) || resolution === "cancel") {
            break;
          }

          const conflictProposal = conflicts[conflictIndex as number];
          if (resolution === "overwrite") {
            await executeProposals([{ ...conflictProposal, conflictExists: false }], sourcePath, targetPath);
          } else if (resolution === "rename") {
            const uniqueDest = await generateUniqueName(conflictProposal.destination);
            await executeProposals([{ ...conflictProposal, destination: uniqueDest, conflictExists: false }], sourcePath, targetPath);
          }
          break;
        }

        case "select_individual": {
          const selectedIndices = await selectFilesToMove(proposal.proposals);
          if (selectedIndices.length > 0) {
            const selectedProposals = selectedIndices.map((i: number) => proposal.proposals[i]);
            await executeProposals(selectedProposals, sourcePath, targetPath);
            done = true;
          }
          break;
        }

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

          spinner!.start("Re-analyzing files with AI...");
          try {
            proposal = await analyzeFiles({
              files,
              targetDir: targetPath,
              instructions: newInstructions || undefined,
              model: parseModelString(options.model),
              existingFolders,
              profileName: options.profile,
            });
            spinner!.stop("Analysis complete");
            displayAllProposals(proposal);
          } catch (error: any) {
            spinner!.stop("Analysis failed");
            p.log.error(error.message);
          }
          break;
        }

        case "regenerate_with_model": {
          const newInstructions = await p.text({
            message:
              "Enter additional instructions for AI (or press Enter to skip):",
            placeholder: "e.g., Keep all PDFs together, sort images by date",
          });

          if (p.isCancel(newInstructions)) {
            break;
          }

          const pickedModel = await pickModel();
          if (!pickedModel) {
            break;
          }

          spinner!.start(`Re-analyzing with ${pickedModel.provider}/${pickedModel.model}...`);
          try {
            proposal = await analyzeFiles({
              files,
              targetDir: targetPath,
              instructions: newInstructions || undefined,
              model: pickedModel,
              existingFolders,
              profileName: options.profile,
            });
            spinner!.stop("Analysis complete");
            displayAllProposals(proposal);
          } catch (error: any) {
            spinner!.stop("Analysis failed");
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
