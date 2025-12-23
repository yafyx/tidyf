/**
 * AI integration for tidy using @opencode-ai/sdk
 */

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import type { FileMetadata, OrganizationProposal, FileMoveProposal, FileCategory } from "../types/organizer.ts";
import type { ModelSelection } from "../types/config.ts";
import { resolveConfig, getRulesPrompt, expandPath } from "./config.ts";
import { fileExists } from "../utils/files.ts";
import { join } from "path";

// Singleton client instance
let client: OpencodeClient | null = null;
let sessionId: string | null = null;

/**
 * Get or create the Opencode client
 */
export function getClient(): OpencodeClient {
  if (!client) {
    client = createOpencodeClient({});
  }
  return client;
}

/**
 * Create a new session for file analysis
 */
export async function createSession(): Promise<string> {
  const opencodeClient = getClient();
  const session = await opencodeClient.session.create();
  sessionId = session.data?.id ?? "";
  return sessionId;
}

/**
 * Get current session ID or create one
 */
export async function getSessionId(): Promise<string> {
  if (!sessionId) {
    return createSession();
  }
  return sessionId;
}

/**
 * Clean up resources
 */
export function cleanup(): void {
  if (sessionId && client) {
    // Attempt to abort/clean up the session
    client.session.abort({ path: { id: sessionId } }).catch(() => {
      // Ignore errors during cleanup
    });
  }
  sessionId = null;
}

/**
 * Options for analyzing files
 */
export interface AnalyzeFilesOptions {
  /** Files to analyze */
  files: FileMetadata[];
  /** Target directory for organized files */
  targetDir: string;
  /** Additional instructions from user */
  instructions?: string;
  /** Model override */
  model?: ModelSelection;
}

/**
 * Format file metadata for AI prompt
 */
function formatFilesForPrompt(files: FileMetadata[]): string {
  const formatted = files.map((f) => ({
    name: f.name,
    extension: f.extension,
    size: f.size,
    mimeType: f.mimeType,
    modifiedAt: f.modifiedAt.toISOString(),
    contentPreview: f.contentPreview?.slice(0, 500), // Limit preview size
  }));

  return JSON.stringify(formatted, null, 2);
}

/**
 * Parse AI response into OrganizationProposal
 */
function parseAIResponse(
  response: string,
  files: FileMetadata[],
  targetDir: string
): OrganizationProposal {
  // Try to extract JSON from the response
  let jsonStr = response;

  // Try to find JSON in the response if wrapped in text
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Build a map of files by name for lookup
    const fileMap = new Map<string, FileMetadata>();
    for (const file of files) {
      fileMap.set(file.name, file);
    }

    const proposals: FileMoveProposal[] = [];
    const uncategorized: FileMetadata[] = [];

    // Process proposals from AI
    if (parsed.proposals && Array.isArray(parsed.proposals)) {
      for (const p of parsed.proposals) {
        const fileName = p.file || p.filename || p.name;
        const file = fileMap.get(fileName);

        if (!file) {
          continue;
        }

        // Remove from map to track processed files
        fileMap.delete(fileName);

        const destination = join(
          expandPath(targetDir),
          p.destination || p.suggestedPath || "",
          file.name
        );

        const category: FileCategory = {
          name: p.category?.name || "Other",
          subcategory: p.category?.subcategory,
          suggestedPath: p.destination || p.category?.suggestedPath || "",
          confidence: p.category?.confidence || 0.5,
          reasoning: p.category?.reasoning || p.reasoning || "",
        };

        proposals.push({
          sourcePath: file.path,
          file,
          destination,
          category,
          conflictExists: false, // Will be checked later
        });
      }
    }

    // Process uncategorized files
    if (parsed.uncategorized && Array.isArray(parsed.uncategorized)) {
      for (const fileName of parsed.uncategorized) {
        const file = fileMap.get(fileName);
        if (file) {
          uncategorized.push(file);
          fileMap.delete(fileName);
        }
      }
    }

    // Any remaining files in the map are also uncategorized
    for (const file of fileMap.values()) {
      uncategorized.push(file);
    }

    return {
      proposals,
      strategy: parsed.strategy || parsed.overall_reasoning || "",
      uncategorized,
      analyzedAt: new Date(),
    };
  } catch {
    // If parsing fails, treat all files as uncategorized
    return {
      proposals: [],
      strategy: "Failed to parse AI response",
      uncategorized: [...files],
      analyzedAt: new Date(),
    };
  }
}

/**
 * Check for file conflicts in proposals
 */
export async function checkConflicts(
  proposal: OrganizationProposal
): Promise<OrganizationProposal> {
  const updatedProposals = await Promise.all(
    proposal.proposals.map(async (p) => ({
      ...p,
      conflictExists: await fileExists(p.destination),
    }))
  );

  return {
    ...proposal,
    proposals: updatedProposals,
  };
}

/**
 * Analyze files using AI
 */
export async function analyzeFiles(
  options: AnalyzeFilesOptions
): Promise<OrganizationProposal> {
  const { files, targetDir, instructions, model } = options;

  if (files.length === 0) {
    return {
      proposals: [],
      strategy: "No files to analyze",
      uncategorized: [],
      analyzedAt: new Date(),
    };
  }

  const opencodeClient = getClient();
  const sid = await getSessionId();

  // Get configuration
  const config = resolveConfig();
  const rulesPrompt = getRulesPrompt();

  // Build the prompt
  const filesJson = formatFilesForPrompt(files);

  const userPrompt = `
Analyze the following files and organize them according to the rules.

Target directory: ${targetDir}

${instructions ? `Additional instructions: ${instructions}\n` : ""}
Files to organize:
${filesJson}

Respond with ONLY a JSON object (no markdown code blocks) following the format specified in the rules.
`;

  // Send the message and get response using session.prompt
  const response = await opencodeClient.session.prompt({
    path: { id: sid },
    body: {
      system: rulesPrompt,
      model: {
        providerID: model?.provider || config.organizer?.provider || "opencode",
        modelID: model?.model || config.organizer?.model || "claude-sonnet-4-5",
      },
      parts: [{ type: "text", text: userPrompt }],
    },
  });

  // Extract the text content from the response
  const parts = response.data?.parts || [];
  const responseText = parts
    .filter((p) => p.type === "text" && "text" in p)
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");

  // Parse the response
  const proposal = parseAIResponse(responseText, files, targetDir);

  // Check for conflicts
  return checkConflicts(proposal);
}

/**
 * Get available models
 */
export async function getAvailableModels(): Promise<any> {
  // Return default models
  return {
    models: [
      { id: "opencode/gpt-5-nano", name: "GPT-5 Nano (Fast)" },
      { id: "opencode/claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { id: "opencode/gpt-4o", name: "GPT-4o" },
    ],
  };
}
