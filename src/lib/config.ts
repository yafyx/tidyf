/**
 * Configuration file management for tidy
 *
 * Manages ~/.tidy/ (global) and .tidy/ (local) configuration
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import type { TidyConfig, ModelSelection } from "../types/config.ts";

const CONFIG_DIR = ".tidy";
const SETTINGS_FILE = "settings.json";
const RULES_FILE = "rules.md";

const DEFAULT_MODEL: ModelSelection = {
  provider: "opencode",
  model: "claude-sonnet-4-5",
};

const DEFAULT_CONFIG: TidyConfig = {
  organizer: DEFAULT_MODEL,
  defaultSource: "~/Downloads",
  defaultTarget: "~/Documents/Organized",
  watchEnabled: false,
  folders: [
    {
      sources: ["~/Downloads"],
      target: "~/Documents/Organized",
      watch: false,
    },
  ],
  ignore: [
    ".DS_Store",
    "*.tmp",
    "*.partial",
    "*.crdownload",
    "*.download",
    "desktop.ini",
    "Thumbs.db",
  ],
  readContent: false,
  maxContentSize: 10240, // 10KB
};

const DEFAULT_RULES = `# File Organization Rules

You are an AI assistant that organizes files from a download folder. Analyze each file and categorize it appropriately.

## Categories

### Documents
- PDFs, Word docs, text files, spreadsheets
- Subcategorize by: Work, Personal, Receipts, Manuals, Ebooks

### Images
- Photos, screenshots, graphics, icons
- Subcategorize by: Photos, Screenshots, Design, Icons

### Videos
- MP4, MOV, AVI, MKV, WEBM
- Subcategorize by: Movies, Clips, Tutorials

### Audio
- MP3, WAV, FLAC, AAC, OGG
- Subcategorize by: Music, Podcasts, Recordings

### Archives
- ZIP, RAR, 7Z, TAR, GZ
- Keep in Archives folder, possibly extract

### Code & Projects
- Source code files, project archives
- Keep related files together
- Detect project names from filenames

### Applications
- DMG, PKG, EXE, APP files
- Keep in Installers folder

## Organization Strategy

1. **Primary sort by file type** - Use extension and MIME type
2. **Secondary sort by context** - Detect from filename patterns
3. **Date-based subfolders** - For large collections (photos, screenshots)
4. **Keep related files together** - Same base name, different extensions

## Special Rules

1. Files with dates in name (2024-01-15, Jan2024) group by month
2. Receipts/invoices go to Documents/Receipts
3. Screenshots go to Images/Screenshots
4. Keep files with same base name together (report.pdf, report.docx)
5. Installer files go to Applications/Installers
6. Compressed files stay as Archives unless clearly part of another category

## Output Format

Return JSON with this exact structure:
\`\`\`json
{
  "proposals": [
    {
      "file": "original-filename.pdf",
      "destination": "Documents/Work/Reports",
      "category": {
        "name": "Documents",
        "subcategory": "Work/Reports",
        "suggestedPath": "Documents/Work/Reports",
        "confidence": 0.95,
        "reasoning": "PDF file with report-like naming pattern"
      }
    }
  ],
  "strategy": "Brief explanation of overall approach",
  "uncategorized": ["files that couldn't be categorized"]
}
\`\`\`

## Important

- Every file from the input MUST appear in either proposals or uncategorized
- Return ONLY the JSON object, no markdown code blocks or explanations
- Use forward slashes for paths
- Destination should be relative to the target directory
`;

/**
 * Get the global config directory path
 */
export function getGlobalConfigDir(): string {
  return join(homedir(), CONFIG_DIR);
}

/**
 * Get the global config file path
 */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), SETTINGS_FILE);
}

/**
 * Get the global rules file path
 */
export function getGlobalRulesPath(): string {
  return join(getGlobalConfigDir(), RULES_FILE);
}

/**
 * Get the local config directory path
 */
export function getLocalConfigDir(basePath: string = process.cwd()): string {
  return join(basePath, CONFIG_DIR);
}

/**
 * Get the local config file path
 */
export function getLocalConfigPath(basePath: string = process.cwd()): string {
  return join(getLocalConfigDir(basePath), SETTINGS_FILE);
}

/**
 * Get the local rules file path
 */
export function getLocalRulesPath(basePath: string = process.cwd()): string {
  return join(getLocalConfigDir(basePath), RULES_FILE);
}

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

/**
 * Read config from a file
 */
export function readConfig(path: string): TidyConfig {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write config to a file
 */
export function writeConfig(path: string, config: TidyConfig): void {
  const dir = dirname(path);
  ensureConfigDir(dir);
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Read rules from a file
 */
export function readRules(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Write rules to a file
 */
export function writeRules(path: string, rules: string): void {
  const dir = dirname(path);
  ensureConfigDir(dir);
  writeFileSync(path, rules, "utf-8");
}

/**
 * Initialize global config with defaults if it doesn't exist
 */
export function initGlobalConfig(): void {
  const configPath = getGlobalConfigPath();
  const rulesPath = getGlobalRulesPath();

  if (!existsSync(configPath)) {
    writeConfig(configPath, DEFAULT_CONFIG);
  }

  if (!existsSync(rulesPath)) {
    writeRules(rulesPath, DEFAULT_RULES);
  }
}

/**
 * Resolve the effective configuration by merging global and local configs
 */
export function resolveConfig(basePath: string = process.cwd()): TidyConfig {
  // Start with defaults
  const config: TidyConfig = { ...DEFAULT_CONFIG };

  // Merge global config
  const globalConfig = readConfig(getGlobalConfigPath());
  Object.assign(config, globalConfig);

  // Merge local config (takes precedence)
  const localConfig = readConfig(getLocalConfigPath(basePath));
  Object.assign(config, localConfig);

  return config;
}

/**
 * Get the rules prompt by merging global and local rules
 */
export function getRulesPrompt(basePath: string = process.cwd()): string {
  // Try local rules first
  const localRules = readRules(getLocalRulesPath(basePath));
  if (localRules) {
    return localRules;
  }

  // Fall back to global rules
  const globalRules = readRules(getGlobalRulesPath());
  if (globalRules) {
    return globalRules;
  }

  // Return default rules
  return DEFAULT_RULES;
}

/**
 * Parse a model string "provider/model" into a ModelSelection object
 */
export function parseModelString(
  modelString?: string
): ModelSelection | undefined {
  if (!modelString) return undefined;
  const parts = modelString.split("/");
  if (parts.length < 2) return undefined;
  return {
    provider: parts[0],
    model: parts.slice(1).join("/"),
  };
}

/**
 * Expand ~ to home directory
 */
export function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

/**
 * Check if a file should be ignored based on patterns
 */
export function shouldIgnore(filename: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob matching for common patterns
    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1);
      if (filename.endsWith(ext)) {
        return true;
      }
    } else if (filename === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Get default config
 */
export function getDefaultConfig(): TidyConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Get default rules
 */
export function getDefaultRules(): string {
  return DEFAULT_RULES;
}
