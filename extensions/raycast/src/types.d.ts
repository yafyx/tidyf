declare module "tidyf" {
  export interface FileMetadata {
    path: string;
    name: string;
    extension: string;
    size: number;
    mimeType: string;
    created: Date;
    modified: Date;
    isDirectory: boolean;
  }

  export interface FileCategory {
    name: string;
    description: string;
    extensions?: string[];
    patterns?: string[];
  }

  export interface FileMoveProposal {
    file: FileMetadata;
    destination: string;
    category: string;
    reason: string;
    confidence: number;
  }

  export interface OrganizationProposal {
    moves: FileMoveProposal[];
    summary: string;
  }

  export interface ScanOptions {
    recursive?: boolean;
    depth?: number;
    ignore?: string[];
  }

  export interface AnalyzeFilesOptions {
    files: FileMetadata[];
    targetDir: string;
    model?: string;
  }

  export function scanDirectory(
    path: string,
    options?: ScanOptions,
  ): Promise<FileMetadata[]>;
  export function analyzeFiles(
    options: AnalyzeFilesOptions,
  ): Promise<OrganizationProposal>;
  export function moveFile(source: string, destination: string): Promise<void>;
  export function resolveConflict(
    source: string,
    destination: string,
  ): Promise<string>;
  export function formatFileSize(bytes: number): string;
}
