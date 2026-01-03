import { showToast, Toast } from "@raycast/api";
import {
  scanDirectory,
  analyzeFiles,
  type ScanOptions,
  type AnalyzeFilesOptions,
} from "tidyf";
import { getAvailableModels } from "tidyf";

import * as path from "path";
import * as os from "os";

export type {
  FileMetadata,
  OrganizationProposal,
  FileMoveProposal,
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

/**
 * Format model ID into a readable display name
 * e.g., "claude-3-5-sonnet-20241022" -> "Claude 3.5 Sonnet"
 */
function formatModelName(modelId: string): string {
  // Remove date suffixes like -20241022
  let name = modelId.replace(/-\d{8}$/, "");

  // Replace common patterns
  name = name
    .replace(/^claude-/, "Claude ")
    .replace(/^gpt-/, "GPT-")
    .replace(/^gemini-/, "Gemini ")
    .replace(/-/g, " ")
    .replace(/(\d)\.(\d)/g, "$1.$2"); // Preserve version dots

  // Title case
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
  return providerNames[providerId] || providerId.charAt(0).toUpperCase() + providerId.slice(1);
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
export async function safeAnalyzeFiles(options: AnalyzeFilesOptions) {
  try {
    return await analyzeFiles(options);
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
