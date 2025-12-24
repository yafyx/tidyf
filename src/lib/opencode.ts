/**
 * AI integration for tidy using @opencode-ai/sdk
 */

import * as p from "@clack/prompts";
import {
	createOpencode,
	createOpencodeClient,
	type OpencodeClient,
} from "@opencode-ai/sdk";
import { exec } from "child_process";
import { join } from "path";
import color from "picocolors";
import { promisify } from "util";
import type { ModelSelection } from "../types/config.ts";
import type {
	FileCategory,
	FileMetadata,
	FileMoveProposal,
	OrganizationProposal,
} from "../types/organizer.ts";
import { fileExists } from "../utils/files.ts";
import { expandPath, getRulesPrompt, resolveConfig } from "./config.ts";

const execAsync = promisify(exec);

// Server state
let clientInstance: OpencodeClient | null = null;
let serverInstance: { close: () => void } | null = null;
let sessionId: string | null = null;

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
 * Get or create the Opencode client
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

	// Check if opencode is installed
	if (!(await isOpencodeInstalled())) {
		p.log.error("OpenCode CLI is not installed");
		p.log.info(
			`Install it with: ${color.cyan("npm install -g opencode")} or ${color.cyan("brew install sst/tap/opencode")}`,
		);
		process.exit(1);
	}

	// Spawn new server
	try {
		const opencode = await createOpencode({
			timeout: 10000,
		});

		clientInstance = opencode.client;
		serverInstance = opencode.server;

		// Check authentication
		if (!(await checkAuth(opencode.client))) {
			p.log.warn("Not authenticated with OpenCode");
			p.log.info(`Run ${color.cyan("opencode auth")} to authenticate`);
			process.exit(1);
		}

		// Clean up server on process exit
		process.on("exit", () => {
			serverInstance?.close();
		});
		process.on("SIGINT", () => {
			serverInstance?.close();
			process.exit(0);
		});
		process.on("SIGTERM", () => {
			serverInstance?.close();
			process.exit(0);
		});

		return opencode.client;
	} catch (error: any) {
		p.log.error(`Failed to start OpenCode server: ${error.message}`);
		p.log.info(`Make sure OpenCode is installed and configured correctly`);
		process.exit(1);
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
		// Attempt to abort/clean up the session
		clientInstance.session.abort({ path: { id: sessionId } }).catch(() => {
			// Ignore errors during cleanup
		});
	}
	sessionId = null;
	serverInstance?.close();
	serverInstance = null;
	clientInstance = null;
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
	/** Existing folders in target directory for consistency */
	existingFolders?: string[];
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
	targetDir: string,
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

/**
 * Analyze files using AI
 */
export async function analyzeFiles(
	options: AnalyzeFilesOptions,
): Promise<OrganizationProposal> {
	const { files, targetDir, instructions, model, existingFolders } = options;

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

	// Get configuration
	const config = resolveConfig();
	const rulesPrompt = getRulesPrompt();

	// Build the prompt
	const filesJson = formatFilesForPrompt(files);

	// Build existing folders section if available
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
export async function getAvailableModels() {
	const client = await getClient();
	return client.config.providers();
}
