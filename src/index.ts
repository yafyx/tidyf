/**
 * tidy - AI-powered file organizer
 *
 * Library exports for programmatic use
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
} from "./lib/opencode.ts";

// Watcher
export {
  FileWatcher,
  createWatcher,
  type WatcherOptions,
} from "./lib/watcher.ts";

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

// Commands (for programmatic use)
export { organizeCommand } from "./commands/organize.ts";
export { watchCommand } from "./commands/watch.ts";
export { configCommand } from "./commands/config.ts";
