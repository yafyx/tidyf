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
} from "./types/organizer";

export type {
  ModelSelection,
  FolderRule,
  CategoryRule,
  TidyConfig,
  ConfigOptions,
} from "./types/config";

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
} from "./lib/config";

// Scanner
export {
  scanDirectory,
  getFileMetadata,
  getFileCategory,
  groupFilesByCategory,
  type ScanOptions,
} from "./lib/scanner";

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
} from "./utils/files";

// Icons
export {
  getFileIcon,
  getCategoryIcon,
  getStatusIcon,
  getStatusIndicator,
} from "./utils/icons";

// AI
export {
  analyzeFiles,
  checkConflicts,
  getAvailableModels,
  cleanup,
  type AnalyzeFilesOptions,
} from "./lib/opencode";

// Watcher
export {
  FileWatcher,
  createWatcher,
  type WatcherOptions,
} from "./lib/watcher";

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
} from "./lib/history";

// Commands (for programmatic use)
export { organizeCommand } from "./commands/organize";
export { watchCommand } from "./commands/watch";
export { configCommand } from "./commands/config";
