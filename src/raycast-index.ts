/**
 * tidy - AI-powered file organizer (Raycast variant)
 *
 * Library exports for programmatic use, excluding watcher and CLI commands
 * to avoid native dependency issues in Raycast environment.
 */

// Types
export type {
  FileMetadata,
  FileCategory,
  FileMoveProposal,
  OrganizationProposal,
  OrganizeOptions,
  WatchOptions,
  WatchEvent,
  MoveStatus,
  MoveResult,
} from "./types/organizer.ts";

export type {
  ModelSelection,
  FolderRule,
  CategoryRule,
  TidyConfig,
  ConfigOptions,
} from "./types/config.ts";

// Config
export {
  resolveConfig,
  getGlobalConfigPath,
  getLocalConfigPath,
  getGlobalRulesPath,
  getLocalRulesPath,
  readConfig,
  writeConfig,
  getRulesPrompt,
  parseModelString,
  expandPath,
  shouldIgnore,
  initGlobalConfig,
} from "./lib/config.ts";

// Scanner
export {
  scanDirectory,
  getFileMetadata,
  getFileCategory,
  groupFilesByCategory,
  type ScanOptions,
} from "./lib/scanner.ts";

// File utilities
export {
  moveFile,
  fileExists,
  ensureDirectory,
  generateUniqueName,
  resolveConflict,
  formatFileSize,
  isDirectory,
  isFile,
  type ConflictStrategy,
} from "./utils/files.ts";

// Icons
export {
  getFileIcon,
  getCategoryIcon,
  getStatusIcon,
  getStatusIndicator,
} from "./utils/icons.ts";

// AI
export {
  analyzeFiles,
  checkConflicts,
  getAvailableModels,
  cleanup,
  type AnalyzeFilesOptions,
} from "./lib/opencode.raycast.ts";

// History - for undo functionality
export {
  readHistory,
  createHistoryEntry,
  addMoveToHistory,
  saveHistoryEntry,
  getHistoryEntry,
  getRecentHistory,
  deleteHistoryEntry,
  clearHistory,
  type HistoryEntry,
} from "./lib/history.ts";

// Intentionally exclude any CLI / commander entrypoints.


// EXCLUDED: Watcher (uses chokidar/fsevents)
// EXCLUDED: CLI Commands (use commander)
