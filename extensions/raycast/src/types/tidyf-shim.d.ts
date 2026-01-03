declare module "tidyf" {
  export interface FileMetadata {
    path: string;
    name: string;
    extension: string;
    size: number;
    modifiedAt: Date;
    createdAt: Date;
    mimeType?: string;
  }

  export interface TidyConfig {
    defaultSource?: string;
    defaultTarget?: string;
    organizer?: {
      provider: string;
      model: string;
    };
    readContent?: boolean;
    maxContentSize?: number;
    watchEnabled?: boolean;
    ignore?: string[];
    folders?: any[];
  }

  export function getGlobalConfigPath(): string;
  export function readConfig(path: string): TidyConfig;
  export function writeConfig(path: string, config: TidyConfig): void;
  export function resolveConfig(): TidyConfig;

  // Re-export existing ones if needed, or rely on merging
  export function getAvailableModels(): Promise<any>;
  export function scanDirectory(
    path: string,
    options?: any,
  ): Promise<FileMetadata[]>;
  export function analyzeFiles(options: any): Promise<any>;
  export function createHistoryEntry(source: string, target: string): any;
  export function addMoveToHistory(
    entry: any,
    source: string,
    target: string,
  ): void;
  export function saveHistoryEntry(entry: any): void;
  export function getRecentHistory(limit?: number): any[];
  export function deleteHistoryEntry(id: string): void;
  export function moveFile(source: string, destination: string): Promise<void>;

  export type OrganizationProposal = any;
  export type FileMoveProposal = any;
  export type HistoryEntry = any;

  export interface ProviderWithModels {
    id: string;
    name: string;
    models: { id: string; name: string }[];
  }
}
