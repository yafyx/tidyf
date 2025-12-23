/**
 * Watch command - monitor folders for new files and auto-organize
 */

import * as p from "@clack/prompts";
import color from "picocolors";
import { createWatcher, type FileWatcher } from "../lib/watcher.ts";
import { getFileMetadata } from "../lib/scanner.ts";
import { analyzeFiles, cleanup } from "../lib/opencode.ts";
import { moveFile, formatFileSize } from "../utils/files.ts";
import { getFileIcon, getCategoryIcon } from "../utils/icons.ts";
import {
  resolveConfig,
  expandPath,
  parseModelString,
  initGlobalConfig,
} from "../lib/config.ts";
import type {
  WatchOptions,
  WatchEvent,
  OrganizationProposal,
  FileMoveProposal,
  FileMetadata,
} from "../types/organizer.ts";

/**
 * Display a proposal briefly for watch mode
 */
function displayProposalBrief(proposals: FileMoveProposal[]): void {
  for (const prop of proposals) {
    const icon = getFileIcon(prop.file.name);
    const categoryIcon = getCategoryIcon(prop.category.name);
    p.log.message(
      `  ${icon} ${prop.file.name} → ${categoryIcon} ${prop.category.name}/${prop.category.subcategory || ""}`
    );
  }
}

/**
 * Execute proposals silently (for auto mode)
 */
async function executeProposalsSilent(
  proposals: FileMoveProposal[]
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const prop of proposals) {
    const result = await moveFile(prop.sourcePath, prop.destination, {
      overwrite: false,
    });

    if (result.status === "completed") {
      success++;
    } else {
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Interactive review of proposals
 */
async function interactiveReview(
  proposal: OrganizationProposal
): Promise<boolean> {
  p.log.info(
    color.bold(`\n${proposal.proposals.length} files to organize:\n`)
  );
  displayProposalBrief(proposal.proposals);

  if (proposal.strategy) {
    p.log.message(color.dim(`\nStrategy: ${proposal.strategy}`));
  }

  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "apply", label: "Apply all", hint: "Move files as proposed" },
      { value: "skip", label: "Skip", hint: "Don't move these files" },
      { value: "stop", label: "Stop watching", hint: "Exit watch mode" },
    ],
  });

  if (p.isCancel(action) || action === "stop") {
    return false; // Signal to stop watching
  }

  if (action === "apply") {
    const s = p.spinner();
    s.start("Moving files...");

    const { success, failed } = await executeProposalsSilent(proposal.proposals);

    s.stop(
      `Moved ${success} files` +
        (failed > 0 ? color.red(`, ${failed} failed`) : "")
    );
  }

  return true; // Continue watching
}

/**
 * Main watch command
 */
export async function watchCommand(options: WatchOptions): Promise<void> {
  p.intro(color.bgBlue(color.black(" tidy watch ")));

  // Initialize global config if needed
  initGlobalConfig();

  // Resolve configuration
  const config = resolveConfig();

  // Determine paths to watch
  let watchPaths: string[];
  if (options.paths && options.paths.length > 0) {
    watchPaths = options.paths.map((p) => expandPath(p));
  } else if (config.folders && config.folders.length > 0) {
    watchPaths = config.folders
      .filter((f) => f.watch !== false)
      .flatMap((f) => f.sources.map((s) => expandPath(s)));
  } else {
    watchPaths = [expandPath("~/Downloads")];
  }

  // Determine target directory
  const targetPath = expandPath(
    config.folders?.[0]?.target ||
      config.defaultTarget ||
      "~/Documents/Organized"
  );

  // Show what we're watching
  p.log.info("Watching directories:");
  for (const path of watchPaths) {
    p.log.message(`  ${color.cyan(path)}`);
  }
  p.log.info(`Target: ${color.cyan(targetPath)}`);

  if (options.auto) {
    p.log.warn(color.yellow("Auto mode: Files will be moved without confirmation"));
  } else if (options.queue) {
    p.log.info("Queue mode: Files will be queued for batch review");
  }

  // Create watcher
  const watcher = createWatcher({
    delay: parseInt(options.delay || "3000"),
    ignore: config.ignore,
    recursive: false,
  });

  // Queue for batch review mode
  const reviewQueue: FileMetadata[] = [];

  // Handle file events
  watcher.on("files", async (events: WatchEvent[]) => {
    const newFilePaths = events
      .filter((e) => e.type === "add")
      .map((e) => e.path);

    if (newFilePaths.length === 0) {
      return;
    }

    p.log.info(
      `\n${color.green("+")} ${newFilePaths.length} new file(s) detected`
    );

    // Get metadata for new files
    const files: FileMetadata[] = [];
    for (const path of newFilePaths) {
      const metadata = await getFileMetadata(path, {
        readContent: config.readContent,
        maxContentSize: config.maxContentSize,
      });
      if (metadata) {
        files.push(metadata);
      }
    }

    if (files.length === 0) {
      return;
    }

    // Queue mode: add to queue for later review
    if (options.queue) {
      reviewQueue.push(...files);
      p.log.info(
        `Queued ${files.length} files (${reviewQueue.length} total in queue)`
      );
      p.log.message(color.dim("Press Enter to review queue"));
      return;
    }

    // Analyze with AI
    const s = p.spinner();
    s.start("Analyzing files with AI...");

    let proposal: OrganizationProposal;
    try {
      proposal = await analyzeFiles({
        files,
        targetDir: targetPath,
        model: parseModelString(options.model),
      });
      s.stop("Analysis complete");
    } catch (error: any) {
      s.stop("Analysis failed");
      p.log.error(error.message);
      return;
    }

    if (proposal.proposals.length === 0) {
      p.log.warn("No files could be categorized");
      return;
    }

    // Auto mode: apply without confirmation
    if (options.auto) {
      const { success, failed } = await executeProposalsSilent(proposal.proposals);
      p.log.success(
        `Moved ${success} files` +
          (failed > 0 ? color.red(`, ${failed} failed`) : "")
      );
      return;
    }

    // Interactive mode: ask for confirmation
    const shouldContinue = await interactiveReview(proposal);
    if (!shouldContinue) {
      watcher.stop();
    }
  });

  watcher.on("ready", () => {
    p.log.success("Watcher ready");
    p.log.message(color.dim("Press Ctrl+C to stop watching"));
  });

  watcher.on("error", (error) => {
    p.log.error(`Watch error: ${error.message}`);
  });

  watcher.on("stop", () => {
    p.log.info("Watcher stopped");
  });

  // Start watching
  watcher.start(watchPaths);

  // Handle Ctrl+C
  process.on("SIGINT", async () => {
    console.log();
    p.log.info("Stopping watcher...");

    // If queue mode and there are queued files, offer to review
    if (options.queue && reviewQueue.length > 0) {
      const review = await p.confirm({
        message: `Review ${reviewQueue.length} queued files before exiting?`,
        initialValue: true,
      });

      if (!p.isCancel(review) && review) {
        const s = p.spinner();
        s.start("Analyzing queued files...");

        try {
          const proposal = await analyzeFiles({
            files: reviewQueue,
            targetDir: targetPath,
            model: parseModelString(options.model),
          });
          s.stop("Analysis complete");

          await interactiveReview(proposal);
        } catch (error: any) {
          s.stop("Analysis failed");
          p.log.error(error.message);
        }
      }
    }

    watcher.stop();
    cleanup();
    p.outro(color.green("Done!"));
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}
