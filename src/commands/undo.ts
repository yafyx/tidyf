/**
 * Undo command - revert file organization operations
 */

import * as p from "@clack/prompts";
import { existsSync } from "fs";
import { rename, mkdir } from "fs/promises";
import { dirname } from "path";
import color from "picocolors";
import { initGlobalConfig } from "../lib/config.ts";
import { cleanup } from "../lib/opencode.ts";
import {
  deleteHistoryEntry,
  getHistoryEntry,
  getRecentHistory,
  type HistoryEntry,
} from "../lib/history.ts";

/**
 * Select a history entry to undo
 */
async function selectHistoryEntry(): Promise<HistoryEntry | null> {
  const history = getRecentHistory();

  if (history.length === 0) {
    p.log.warn("No history to undo");
    return null;
  }

  const options = history.map((entry) => ({
    value: entry.id,
    label: `${new Date(entry.timestamp).toLocaleString()}`,
    hint: `${entry.moves.length} files moved`,
  }));

  const selectedId = await p.select({
    message: "Which operation to undo?",
    options,
  });

  if (p.isCancel(selectedId)) {
    return null;
  }

  return getHistoryEntry(selectedId as string);
}

/**
 * Undo a file move
 */
async function undoMove(source: string, destination: string): Promise<boolean> {
  try {
    // Ensure source directory exists (in case it was deleted)
    await mkdir(dirname(source), { recursive: true });

    await rename(destination, source);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main undo command
 */
export async function undoCommand(): Promise<void> {
  p.intro(color.bgRed(color.black(" tidyf undo ")));

  initGlobalConfig();

  const entry = await selectHistoryEntry();

  if (!entry) {
    p.outro(color.yellow("Nothing to undo"));
    cleanup();
    return;
  }

  console.log();
  p.log.info(color.bold("Operation details:"));
  p.log.message(`  Timestamp: ${new Date(entry.timestamp).toLocaleString()}`);
  p.log.message(`  Source: ${entry.source}`);
  p.log.message(`  Target: ${entry.target}`);
  p.log.message(`  Files moved: ${entry.moves.length}`);

  const confirm = await p.confirm({
    message: `Undo this operation? This will move ${entry.moves.length} files back to ${entry.source}`,
    initialValue: false,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.outro(color.yellow("Cancelled"));
    cleanup();
    return;
  }

  const s = p.spinner();
  s.start("Undoing file moves...");

  let successCount = 0;
  let failCount = 0;

  for (const move of entry.moves) {
    const destExists = existsSync(move.destination);

    if (!destExists) {
      p.log.warn(`  Skipped: ${move.destination} (already moved/deleted)`);
      failCount++;
      continue;
    }

    if (await undoMove(move.source, move.destination)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  s.stop("Undo complete");

  p.log.success(`\nMoved ${successCount} files back to ${color.cyan(entry.source)}`);

  if (failCount > 0) {
    p.log.warn(`${failCount} files could not be moved`);
  }

  const deleteFromHistory = await p.confirm({
    message: "Remove this operation from history?",
    initialValue: true,
  });

  if (p.isCancel(deleteFromHistory) || deleteFromHistory) {
    deleteHistoryEntry(entry.id);
    p.log.success("Removed from history");
  }

  p.outro(color.green("Done!"));
  cleanup();
}
