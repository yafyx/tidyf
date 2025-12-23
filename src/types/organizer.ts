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
 * Options for organize command
 */
export interface OrganizeOptions {
  /** Directory to scan */
  path?: string;
  /** Preview without executing */
  dryRun?: boolean;
  /** Skip confirmations */
  yes?: boolean;
  /** Scan subdirectories */
  recursive?: boolean;
  /** Max depth for recursive scan */
  depth?: string;
  /** Target directory for organized files */
  target?: string;
  /** Model override */
  model?: string;
}

/**
 * Options for watch command
 */
export interface WatchOptions {
  /** Directories to watch */
  paths?: string[];
  /** Debounce delay in ms */
  delay?: string;
  /** Auto-apply without confirmation */
  auto?: boolean;
  /** Queue for review instead of auto-apply */
  queue?: boolean;
  /** Model override */
  model?: string;
}

/**
 * Watch event for a new file
 */
export interface WatchEvent {
  /** Event type */
  type: "add" | "change";
  /** File path */
  path: string;
  /** Timestamp */
  timestamp: Date;
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
