import { showToast, Toast } from "@raycast/api";
import {
  scanDirectory,
  analyzeFiles,
  type ScanOptions,
  type AnalyzeFilesOptions,
  type FileMetadata,
  createHistoryEntry,
  addMoveToHistory,
  saveHistoryEntry,
  getRecentHistory,
  deleteHistoryEntry,
  type HistoryEntry,
  getGlobalConfigPath,
  readConfig,
  writeConfig,
  type TidyConfig,
} from "tidyf";
import { getAvailableModels } from "tidyf";

import * as path from "path";
import * as os from "os";

// Redefine ModelSelection locally
export interface ModelSelection {
  provider: string;
  model: string;
}

export type {
  FileMetadata,
  OrganizationProposal,
  FileMoveProposal,
  TidyConfig,
} from "tidyf";

// Provider and model types for grouped selection
type ModelInfo = {
  id: string;
  name: string;
};

type ProviderWithModels = {
  id: string;
  name: string;
  models: ModelInfo[];
};

type Provider = { id: string; name?: string; models?: unknown };
type ModelsResponse = { data?: { providers?: Provider[] } };

export type { ProviderWithModels };

// Re-export HistoryEntry type for consumers
export type { HistoryEntry };

/**
 * Format model ID into a readable display name
 * Now returns the original model ID as per requirement
 */
function formatModelName(modelId: string): string {
  return modelId;
}

/**
 * Format provider ID into a readable display name
 */
function formatProviderName(providerId: string): string {
  const providerNames: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    opencode: "OpenCode",
    groq: "Groq",
    ollama: "Ollama",
    azure: "Azure OpenAI",
  };
  return (
    providerNames[providerId] ||
    providerId.charAt(0).toUpperCase() + providerId.slice(1)
  );
}

/**
 * Get an icon/emoji for a provider
 */
export function getProviderIcon(providerId: string): string {
  const icons: Record<string, string> = {
    anthropic: "🟣",
    openai: "🟢",
    google: "🔵",
    opencode: "⚡",
    groq: "🟠",
    ollama: "🦙",
    azure: "☁️",
  };
  return icons[providerId] || "🤖";
}

/**
 * Wraps the getAvailableModels function with Raycast error handling
 * Returns all providers with their models for grouped dropdown display
 */
export async function safeGetAvailableModels(): Promise<ProviderWithModels[]> {
  try {
    const response = await getAvailableModels();

    // The response structure from opencode is { data: { providers: [...] } }
    const providers = (response as ModelsResponse).data?.providers;

    if (!providers || providers.length === 0) {
      return [];
    }

    // Transform each provider's models into a standardized format
    const groupedProviders: ProviderWithModels[] = [];

    for (const provider of providers) {
      if (!provider.models) continue;

      let modelList: ModelInfo[] = [];

      if (Array.isArray(provider.models)) {
        // Models as array of strings
        modelList = (provider.models as string[]).map((id) => ({
          id,
          name: formatModelName(id),
        }));
      } else if (typeof provider.models === "object") {
        // Models as object with keys as IDs
        modelList = Object.keys(provider.models).map((id) => ({
          id,
          name: formatModelName(id),
        }));
      }

      // Only include providers that have models
      if (modelList.length > 0) {
        groupedProviders.push({
          id: provider.id,
          name: provider.name || formatProviderName(provider.id),
          models: modelList,
        });
      }
    }

    return groupedProviders;
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to fetch models",
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Wraps the scanDirectory function with Raycast error handling
 */
export async function safeScanDirectory(
  dirPath: string,
  options: ScanOptions = {},
) {
  try {
    return await scanDirectory(dirPath, options);
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Scan Failed",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Wraps the analyzeFiles function with Raycast progress feedback
 */
export async function safeAnalyzeFiles(options: {
  files: FileMetadata[];
  targetDir: string;
  model: ModelSelection;
}) {
  try {
    return await analyzeFiles(options as unknown as AnalyzeFilesOptions);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Connection refused") ||
        error.message.includes("opencode"))
    ) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Opencode Server Not Found",
        message: "Please run 'opencode server' in your terminal.",
      });
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: "Analysis Failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }
}

/**
 * Helper to get user's home directory
 */
export function getHomeDir() {
  return os.homedir();
}

/**
 * Helper to resolve common paths (Downloads, Desktop)
 */
export function resolvePath(shortPath: string) {
  if (shortPath.startsWith("~")) {
    return path.join(getHomeDir(), shortPath.slice(1));
  }
  return shortPath;
}

// =============================================================================
// History Functions - for undo functionality
// =============================================================================

/**
 * Get recent history entries with error handling
 */
export function safeGetRecentHistory(limit: number = 20): HistoryEntry[] {
  try {
    return getRecentHistory(limit);
  } catch (error) {
    console.error("Failed to read history:", error);
    return [];
  }
}

/**
 * Create and track a new history entry for an organization operation
 */
export function createOperationHistory(
  sourceDir: string,
  targetDir: string,
): HistoryEntry {
  return createHistoryEntry(sourceDir, targetDir);
}

/**
 * Record a file move in the history entry
 */
export function recordMove(
  entry: HistoryEntry,
  source: string,
  destination: string,
): void {
  addMoveToHistory(entry, source, destination);
}

/**
 * Persist the history entry to disk
 */
export function persistHistory(entry: HistoryEntry): void {
  try {
    saveHistoryEntry(entry);
  } catch (error) {
    console.error("Failed to save history:", error);
  }
}

/**
 * Delete a history entry by ID
 */
export function safeDeleteHistoryEntry(id: string): boolean {
  try {
    deleteHistoryEntry(id);
    return true;
  } catch (error) {
    console.error("Failed to delete history:", error);
    return false;
  }
}

// =============================================================================
// Config Functions
// =============================================================================

export function safeGetConfig() {
  try {
    const configPath = getGlobalConfigPath();
    // Use readConfig from tidyf which handles reading/parsing
    return readConfig(configPath);
  } catch (error) {
    console.error("Failed to read config:", error);
    return {};
  }
}

export function safeSaveConfig(config: TidyConfig) {
  try {
    const configPath = getGlobalConfigPath();
    // Use writeConfig from tidyf
    writeConfig(configPath, config);
    return true;
  } catch (error) {
    console.error("Failed to save config:", error);
    throw error;
  }
}

/**
 * Undo a single file move (move file back to original location)
 */
export async function undoFileMove(
  source: string,
  destination: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { rename, mkdir } = await import("fs/promises");
    const { existsSync } = await import("fs");

    // Check if file still exists at destination
    if (!existsSync(destination)) {
      return { success: false, error: "File no longer exists at destination" };
    }

    // Ensure source directory exists
    const sourceDir = path.dirname(source);
    await mkdir(sourceDir, { recursive: true });

    // Move file back
    await rename(destination, source);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
