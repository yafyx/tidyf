/**
 * AI integration for tidy (Raycast variant)
 *
 * Implements "Ephemeral Server" logic:
 * 1. Tries to connect to existing server (fastest)
 * 2. If missing, spawns a new server on-demand (takes ~350ms)
 * 3. Raycast cleans up the process when the command exits
 */

import {
  createOpencode,
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk";
import { exec } from "child_process";
import { promisify } from "util";
import fixPath from "fix-path";
import fs from "fs";
import type { ModelSelection } from "./types";
import type {
  FileCategory,
  FileMetadata,
  FileMoveProposal,
  OrganizationProposal,
} from "./types";
import { fileExists } from "./files";
import {
  expandPath,
  getRulesPromptWithProfile,
  resolveConfigWithProfile,
} from "./config";
import { join } from "path";

const execAsync = promisify(exec);

// Server state
let clientInstance: OpencodeClient | null = null;
let sessionId: string | null = null;

/**
 * Fix the PATH environment variable to include common binary locations
 * This is critical for Raycast which has a limited PATH
 */
function fixEnvironment() {
  fixPath();

  // Add common paths explicitly if they're missing (extra safety)
  const commonPaths = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.env.HOME + "/.bun/bin",
    process.env.HOME + "/.nvm/versions/node/current/bin",
  ];

  const currentPath = process.env.PATH || "";
  const newPaths = commonPaths.filter(
    (p) => fs.existsSync(p) && !currentPath.includes(p),
  );

  if (newPaths.length > 0) {
    process.env.PATH = `${newPaths.join(":")}:${currentPath}`;
  }
}

/**
 * Check if opencode CLI is installed
 */
async function isOpencodeInstalled(): Promise<boolean> {
  try {
    await execAsync("which opencode");
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if user is authenticated with opencode
 */
async function checkAuth(client: OpencodeClient): Promise<boolean> {
  try {
    const config = await client.config.get();
    return !!config;
  } catch {
    return false;
  }
}

/**
 * Get the Opencode client
 * Tries to connect to existing server first, spawns new one if needed
 */
export async function getClient(): Promise<OpencodeClient> {
  if (clientInstance) {
    return clientInstance;
  }

  // Try connecting to existing server first
  try {
    const client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
    });
    // Test connection
    await client.config.get();
    clientInstance = client;
    return client;
  } catch {
    // No existing server, need to spawn one
  }

  // Hydrate PATH before checking/spawning
  fixEnvironment();

  // Check if opencode is installed
  if (!(await isOpencodeInstalled())) {
    throw new Error(
      "OpenCode CLI is not installed. Please install it with 'npm install -g opencode' or 'brew install sst/tap/opencode'",
    );
  }

  // Spawn new server
  try {
    const opencode = await createOpencode({
      timeout: 10000,
    });

    clientInstance = opencode.client;
    // Note: opencode.server is available for cleanup but we let it auto-terminate

    // Check authentication
    if (!(await checkAuth(opencode.client))) {
      throw new Error(
        "Not authenticated with OpenCode. Run 'opencode auth' in your terminal to authenticate.",
      );
    }

    return opencode.client;
  } catch (error) {
    throw new Error(
      `Failed to start OpenCode server: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Create a new session for file analysis
 */
export async function createSession(): Promise<string> {
  const opencodeClient = await getClient();
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
  if (sessionId && clientInstance) {
    clientInstance.session.abort({ path: { id: sessionId } }).catch(() => {});
  }
  sessionId = null;
  clientInstance = null;
}

/**
 * Options for analyzing files
 */
export interface AnalyzeFilesOptions {
  files: FileMetadata[];
  targetDir: string;
  instructions?: string;
  model?: ModelSelection;
  existingFolders?: string[];
  profileName?: string;
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
    contentPreview: f.contentPreview?.slice(0, 500),
  }));

  return JSON.stringify(formatted, null, 2);
}

/**
 * Parse AI response into OrganizationProposal
 */
function parseAIResponse(
  response: string,
  files: FileMetadata[],
  targetDir: string,
): OrganizationProposal {
  let jsonStr = response;
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const fileMap = new Map<string, FileMetadata>();
    for (const file of files) {
      fileMap.set(file.name, file);
    }

    const proposals: FileMoveProposal[] = [];
    const uncategorized: FileMetadata[] = [];

    if (parsed.proposals && Array.isArray(parsed.proposals)) {
      for (const p of parsed.proposals) {
        const fileName = p.file || p.filename || p.name;
        const file = fileMap.get(fileName);

        if (!file) continue;
        fileMap.delete(fileName);

        const destination = join(
          expandPath(targetDir),
          p.destination || p.suggestedPath || "",
          file.name,
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
          conflictExists: false,
        });
      }
    }

    if (parsed.uncategorized && Array.isArray(parsed.uncategorized)) {
      for (const fileName of parsed.uncategorized) {
        const file = fileMap.get(fileName);
        if (file) {
          uncategorized.push(file);
          fileMap.delete(fileName);
        }
      }
    }

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
    return {
      proposals: [],
      strategy: "Failed to parse AI response",
      uncategorized: [...files],
      analyzedAt: new Date(),
    };
  }
}

export async function checkConflicts(
  proposal: OrganizationProposal,
): Promise<OrganizationProposal> {
  const updatedProposals = await Promise.all(
    proposal.proposals.map(async (p) => ({
      ...p,
      conflictExists: await fileExists(p.destination),
    })),
  );

  return {
    ...proposal,
    proposals: updatedProposals,
  };
}

export async function analyzeFiles(
  options: AnalyzeFilesOptions,
): Promise<OrganizationProposal> {
  const {
    files,
    targetDir,
    instructions,
    model,
    existingFolders,
    profileName,
  } = options;

  if (files.length === 0) {
    return {
      proposals: [],
      strategy: "No files to analyze",
      uncategorized: [],
      analyzedAt: new Date(),
    };
  }

  const opencodeClient = await getClient();
  const sid = await getSessionId();

  const config = resolveConfigWithProfile(profileName);
  const rulesPrompt = getRulesPromptWithProfile(profileName);
  const filesJson = formatFilesForPrompt(files);

  const existingFoldersSection = existingFolders?.length
    ? `
 EXISTING FOLDERS in target directory:
 ${existingFolders.join("\n")}
 
 IMPORTANT: Prefer using these existing folders when appropriate. Only create new folders when no suitable existing folder matches the file's category.
 `
    : "";

  const userPrompt = `
 Analyze the following files and organize them according to the rules.
 
 Target directory: ${targetDir}
 ${existingFoldersSection}
 ${instructions ? `Additional instructions: ${instructions}\n` : ""}
 Files to organize:
 ${filesJson}
 
 Respond with ONLY a JSON object (no markdown code blocks) following the format specified in the rules.
 `;

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

  const parts = response.data?.parts || [];
  const responseText = parts
    .filter((p) => p.type === "text" && "text" in p)
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");

  const proposal = parseAIResponse(responseText, files, targetDir);
  return checkConflicts(proposal);
}

export async function getAvailableModels() {
  const client = await getClient();
  return client.config.providers();
}
