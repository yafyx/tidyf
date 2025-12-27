/**
 * History management for file operations
 *
 * Logs file moves to ~/.tidy/history.json for undo functionality
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { ensureDirectory } from "../utils/files.ts";

const HISTORY_DIR = ".tidy";
const HISTORY_FILE = "history.json";

/**
 * Get the history file path
 */
function getHistoryPath(): string {
  return join(homedir(), HISTORY_DIR, HISTORY_FILE);
}

/**
 * History entry for a file operation
 */
export interface HistoryEntry {
  /** Unique ID for this operation */
  id: string;
  /** Timestamp of operation */
  timestamp: string;
  /** Source directory */
  source: string;
  /** Target directory */
  target: string;
  /** Files that were moved */
  moves: Array<{
    source: string;
    destination: string;
    timestamp: string;
  }>;
}

/**
 * Read history from file
 */
export function readHistory(): HistoryEntry[] {
  const historyPath = getHistoryPath();

  if (!existsSync(historyPath)) {
    return [];
  }

  try {
    const content = readFileSync(historyPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Write history to file
 */
function writeHistory(history: HistoryEntry[]): void {
  const historyPath = getHistoryPath();
  ensureDirectory(dirname(historyPath));
  writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf-8");
}

/**
 * Create a new history entry
 */
export function createHistoryEntry(
  source: string,
  target: string,
): HistoryEntry {
  return {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    source,
    target,
    moves: [],
  };
}

/**
 * Add a file move to history entry
 */
export function addMoveToHistory(
  entry: HistoryEntry,
  source: string,
  destination: string,
): void {
  entry.moves.push({
    source,
    destination,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Save a history entry
 */
export function saveHistoryEntry(entry: HistoryEntry): void {
  const history = readHistory();
  history.unshift(entry);
  writeHistory(history);
}

/**
 * Get history entry by ID
 */
export function getHistoryEntry(id: string): HistoryEntry | null {
  const history = readHistory();
  return history.find((entry) => entry.id === id) || null;
}

/**
 * Get the last N history entries
 */
export function getRecentHistory(limit: number = 10): HistoryEntry[] {
  const history = readHistory();
  return history.slice(0, limit);
}

/**
 * Delete history entry by ID
 */
export function deleteHistoryEntry(id: string): void {
  const history = readHistory();
  const filtered = history.filter((entry) => entry.id !== id);
  writeHistory(filtered);
}

/**
 * Clear all history
 */
export function clearHistory(): void {
  writeHistory([]);
}
