/**
 * Core types for the file organizer
 */

/**
 * Metadata about a file to be organized
 */
export interface FileMetadata {
  /** Full path to the file */
  path: string;
  /** File name without path */
  name: string;
  /** File extension (without dot) */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modifiedAt: Date;
  /** Created timestamp */
  createdAt: Date;
  /** MIME type if detectable */
  mimeType?: string;
  /** Optional content preview (first N bytes/lines) */
  contentPreview?: string;
  /** Content hash for duplicate detection */
  hash?: string;
}

/**
 * AI-suggested category for a file
 */
export interface FileCategory {
  /** Category name (e.g., "Documents", "Images", "Projects") */
  name: string;
  /** Subcategory if applicable (e.g., "Work", "Personal") */
  subcategory?: string;
  /** Suggested subfolder path relative to target */
  suggestedPath: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** AI's reasoning for this categorization */
  reasoning: string;
}

/**
 * A proposed file move operation
 */
export interface FileMoveProposal {
  /** Original file path */
  sourcePath: string;
  /** Source file metadata */
  file: FileMetadata;
  /** Proposed destination path (full path) */
  destination: string;
  /** Category information */
  category: FileCategory;
  /** Whether file already exists at destination */
  conflictExists: boolean;
}

/**
 * Result of AI analysis
 */
export interface OrganizationProposal {
  /** List of proposed moves */
  proposals: FileMoveProposal[];
  /** Overall strategy explanation */
  strategy: string;
  /** Files that couldn't be categorized */
  uncategorized: FileMetadata[];
  /** Timestamp of analysis */
  analyzedAt: Date;
}

/**
 * Status of a file move operation
 */
export type MoveStatus =
  | "pending"
  | "moving"
  | "completed"
  | "failed"
  | "skipped"
  | "conflict";

/**
 * Result of a file move operation
 */
export interface MoveResult {
  /** Source path */
  source: string;
  /** Destination path */
  destination: string;
  /** Move status */
  status: MoveStatus;
  /** Error message if failed */
  error?: string;
}

/**
 * Model selection for AI operations
 */
export interface ModelSelection {
  provider: string;
  model: string;
}

/**
 * Folder rule configuration
 */
export interface FolderRule {
  /** Source folder patterns (glob or paths) */
  sources: string[];
  /** Target base directory */
  target: string;
}

/**
 * Category rule for organizing files
 */
export interface CategoryRule {
  /** Category name */
  name: string;
  /** File extensions that belong to this category */
  extensions?: string[];
  /** MIME type patterns */
  mimeTypes?: string[];
  /** Subfolder name */
  subfolder: string;
}

/**
 * Main configuration interface
 */
export interface TidyConfig {
  /** Model for file analysis */
  organizer?: ModelSelection;
  /** Default source directory */
  defaultSource?: string;
  /** Default target directory */
  defaultTarget?: string;
  /** Folder rules */
  folders?: FolderRule[];
  /** Category rules (hints for AI) */
  categories?: CategoryRule[];
  /** Files/patterns to ignore */
  ignore?: string[];
  /** Whether to read file content for better categorization */
  readContent?: boolean;
  /** Max file size to read content (in bytes) */
  maxContentSize?: number;
}
