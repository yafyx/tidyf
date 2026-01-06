/**
 * History types and functions from tidyf core
 *
 * These declarations supplement the main tidyf exports to work around
 * TypeScript path resolution issues between projects with different type systems.
 */

declare module "tidyf" {
  export interface HistoryEntry {
    id: string;
    timestamp: string;
    source: string;
    target: string;
    moves: Array<{
      source: string;
      destination: string;
      timestamp: string;
    }>;
  }

  export function readHistory(): HistoryEntry[];
  export function createHistoryEntry(
    sourceDir: string,
    targetDir: string,
  ): HistoryEntry;
  export function addMoveToHistory(
    entry: HistoryEntry,
    source: string,
    destination: string,
  ): void;
  export function saveHistoryEntry(entry: HistoryEntry): void;
  export function getHistoryEntry(id: string): HistoryEntry | null;
  export function getRecentHistory(limit?: number): HistoryEntry[];
  export function deleteHistoryEntry(id: string): void;
  export function clearHistory(): void;
}
