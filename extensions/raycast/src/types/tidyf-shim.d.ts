declare module "tidyf" {
  export interface FileMetadata {
    path: string;
    name: string;
    extension: string;
    size: number;
    modifiedAt: Date;
    createdAt: Date;
    mimeType?: string;
    contentPreview?: string;
    hash?: string;
  }

  export interface ModelSelection {
    provider: string;
    model: string;
  }

  export interface FolderRule {
    sources: string[];
    target: string;
    watch?: boolean;
  }

  export interface CategoryRule {
    name: string;
    extensions?: string[];
    mimeTypes?: string[];
    subfolder: string;
  }

  export interface TidyConfig {
    organizer?: ModelSelection;
    defaultSource?: string;
    defaultTarget?: string;
    watchEnabled?: boolean;
    folders?: FolderRule[];
    categories?: CategoryRule[];
    ignore?: string[];
    readContent?: boolean;
    maxContentSize?: number;
  }

  export function getGlobalConfigPath(): string;
  export function readConfig(path: string): TidyConfig;
  export function writeConfig(path: string, config: TidyConfig): void;
  export function resolveConfig(basePath?: string): TidyConfig;

  // Re-export existing ones if needed, or rely on merging
  export function getAvailableModels(): Promise<{
    data?: { providers?: unknown[] };
  }>;
  export function scanDirectory(
    path: string,
    options?: unknown,
  ): Promise<FileMetadata[]>;
  export function analyzeFiles(options: unknown): Promise<OrganizationProposal>;
  export function createHistoryEntry(
    source: string,
    target: string,
  ): HistoryEntry;
  export function addMoveToHistory(
    entry: HistoryEntry,
    source: string,
    destination: string,
  ): void;
  export function saveHistoryEntry(entry: HistoryEntry): void;
  export function getRecentHistory(limit?: number): HistoryEntry[];
  export function deleteHistoryEntry(id: string): void;
  export function moveFile(source: string, destination: string): Promise<void>;

  export interface FileCategory {
    name: string;
    subcategory?: string;
    suggestedPath: string;
    confidence: number;
    reasoning: string;
  }

  export interface FileMoveProposal {
    sourcePath: string;
    file: FileMetadata;
    destination: string;
    category: FileCategory;
    conflictExists: boolean;
  }

  export interface DuplicateGroup {
    hash: string;
    files: FileMetadata[];
    wastedBytes: number;
  }

  export interface OrganizationProposal {
    proposals: FileMoveProposal[];
    strategy: string;
    uncategorized: FileMetadata[];
    analyzedAt: Date;
    duplicates?: DuplicateGroup[];
  }

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

  export interface ProviderWithModels {
    id: string;
    name: string;
    models: { id: string; name: string }[];
  }
}
