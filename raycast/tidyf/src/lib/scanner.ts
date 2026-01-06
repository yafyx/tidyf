/**
 * File scanning utilities for tidy (Raycast version)
 */

import { readdir, stat, readFile } from "fs/promises";
import { join, extname, basename, relative } from "path";
import { lookup as lookupMimeType } from "mime-types";
import type { FileMetadata } from "./types";
import { shouldIgnore } from "./config";

/**
 * Options for scanning folder structure
 */
export interface ScanFolderOptions {
  /** Maximum depth to scan (default: 3) */
  maxDepth?: number;
  /** Include empty folders (default: false) */
  includeEmpty?: boolean;
  /** Patterns to ignore */
  ignore?: string[];
  /** Maximum number of folders to return (default: 100) */
  maxFolders?: number;
}

/**
 * Scan a directory and return existing folder structure as relative paths
 * Used to inform AI about existing organization
 */
export async function scanFolderStructure(
  dirPath: string,
  options: ScanFolderOptions = {},
): Promise<string[]> {
  const {
    maxDepth = 3,
    includeEmpty = false,
    ignore = [],
    maxFolders = 100,
  } = options;

  const folders: string[] = [];

  await scanFoldersInternal(
    dirPath,
    dirPath,
    0,
    maxDepth,
    includeEmpty,
    ignore,
    folders,
    maxFolders,
  );

  // Sort by depth (shallower first) then alphabetically
  folders.sort((a, b) => {
    const depthA = a.split("/").length;
    const depthB = b.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });

  return folders.slice(0, maxFolders);
}

async function scanFoldersInternal(
  basePath: string,
  currentPath: string,
  currentDepth: number,
  maxDepth: number,
  includeEmpty: boolean,
  ignore: string[],
  folders: string[],
  maxFolders: number,
): Promise<void> {
  if (currentDepth >= maxDepth || folders.length >= maxFolders) {
    return;
  }

  try {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (folders.length >= maxFolders) break;

      if (!entry.isDirectory()) continue;

      // Skip hidden folders and ignored patterns
      if (entry.name.startsWith(".")) continue;
      if (shouldIgnore(entry.name, ignore)) continue;

      const fullPath = join(currentPath, entry.name);
      const relativePath = relative(basePath, fullPath);

      // Check if folder has contents (if we care about empty folders)
      if (!includeEmpty) {
        try {
          const contents = await readdir(fullPath);
          if (contents.length === 0) continue;
        } catch {
          continue;
        }
      }

      folders.push(relativePath);

      // Recursively scan subdirectories
      await scanFoldersInternal(
        basePath,
        fullPath,
        currentDepth + 1,
        maxDepth,
        includeEmpty,
        ignore,
        folders,
        maxFolders,
      );
    }
  } catch {
    // Silently skip directories we can't read
  }
}

/**
 * Options for scanning a directory
 */
export interface ScanOptions {
  /** Scan subdirectories */
  recursive?: boolean;
  /** Max depth for recursive scan (0 = no limit) */
  maxDepth?: number;
  /** Patterns to ignore */
  ignore?: string[];
  /** Whether to read file content preview */
  readContent?: boolean;
  /** Max file size to read content (bytes) */
  maxContentSize?: number;
}

/**
 * Scan a directory and return metadata for all files
 */
export async function scanDirectory(
  dirPath: string,
  options: ScanOptions = {},
): Promise<FileMetadata[]> {
  const {
    recursive = false,
    maxDepth = 1,
    ignore = [],
    readContent = false,
    maxContentSize = 10240,
  } = options;

  return scanDirectoryInternal(dirPath, {
    recursive,
    maxDepth,
    ignore,
    readContent,
    maxContentSize,
    currentDepth: 0,
  });
}

interface InternalScanOptions extends ScanOptions {
  currentDepth: number;
}

async function scanDirectoryInternal(
  dirPath: string,
  options: InternalScanOptions,
): Promise<FileMetadata[]> {
  const files: FileMetadata[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      // Check if should be ignored
      if (shouldIgnore(entry.name, options.ignore || [])) {
        continue;
      }

      if (entry.isFile()) {
        const metadata = await getFileMetadata(fullPath, {
          readContent: options.readContent,
          maxContentSize: options.maxContentSize,
        });
        if (metadata) {
          files.push(metadata);
        }
      } else if (
        entry.isDirectory() &&
        options.recursive &&
        ((options.maxDepth ?? 0) === 0 ||
          options.currentDepth < (options.maxDepth ?? 0))
      ) {
        // Recursively scan subdirectory
        const subFiles = await scanDirectoryInternal(fullPath, {
          ...options,
          currentDepth: options.currentDepth + 1,
        });
        files.push(...subFiles);
      }
    }
  } catch (error) {
    // Silently skip directories we can't read
    console.error(
      `Warning: Could not scan ${dirPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return files;
}

/**
 * Get metadata for a single file
 */
export async function getFileMetadata(
  filePath: string,
  options: { readContent?: boolean; maxContentSize?: number } = {},
): Promise<FileMetadata | null> {
  try {
    const stats = await stat(filePath);

    if (!stats.isFile()) {
      return null;
    }

    const name = basename(filePath);
    const extension = extname(name).slice(1).toLowerCase();
    const mimeType = lookupMimeType(name) || undefined;

    let contentPreview: string | undefined;
    if (
      options.readContent &&
      stats.size <= (options.maxContentSize || 10240)
    ) {
      contentPreview = await readFilePreview(
        filePath,
        options.maxContentSize || 10240,
        mimeType,
      );
    }

    return {
      path: filePath,
      name,
      extension,
      size: stats.size,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime,
      mimeType,
      contentPreview,
    };
  } catch {
    return null;
  }
}

/**
 * Read a preview of a file's content
 */
export async function readFilePreview(
  filePath: string,
  maxSize: number,
  mimeType?: string,
): Promise<string | undefined> {
  try {
    // Only read text-based files
    if (!isTextFile(mimeType)) {
      return undefined;
    }

    const buffer = Buffer.alloc(maxSize);
    const file = await readFile(filePath);
    const bytesToRead = Math.min(file.length, maxSize);
    file.copy(buffer as unknown as Uint8Array, 0, 0, bytesToRead);

    const content = buffer.toString("utf-8", 0, bytesToRead);

    // Clean up the content - first 20 lines
    const lines = content.split("\n").slice(0, 20);
    return lines.join("\n");
  } catch {
    return undefined;
  }
}

/**
 * Check if a file is text-based (readable)
 */
function isTextFile(mimeType?: string): boolean {
  if (!mimeType) return false;

  const textMimeTypes = [
    "text/",
    "application/json",
    "application/javascript",
    "application/typescript",
    "application/xml",
    "application/x-yaml",
    "application/x-sh",
    "application/x-python",
  ];

  return textMimeTypes.some(
    (type) => mimeType.startsWith(type) || mimeType === type,
  );
}

/**
 * Get file category based on extension
 */
export function getFileCategory(extension: string): string {
  const categories: Record<string, string[]> = {
    Documents: ["pdf", "doc", "docx", "txt", "rtf", "odt", "md", "pages"],
    Spreadsheets: ["xls", "xlsx", "csv", "ods", "numbers"],
    Presentations: ["ppt", "pptx", "key", "odp"],
    Images: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "svg",
      "webp",
      "heic",
      "ico",
      "bmp",
      "tiff",
      "psd",
      "ai",
      "sketch",
      "fig",
    ],
    Videos: ["mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v"],
    Audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"],
    Archives: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"],
    Code: [
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "rb",
      "go",
      "rs",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "swift",
      "kt",
      "php",
      "html",
      "css",
      "scss",
      "less",
      "json",
      "xml",
      "yaml",
      "yml",
      "toml",
    ],
    Applications: [
      "dmg",
      "pkg",
      "exe",
      "msi",
      "app",
      "apk",
      "ipa",
      "deb",
      "rpm",
    ],
    Ebooks: ["epub", "mobi", "azw", "azw3"],
    Fonts: ["ttf", "otf", "woff", "woff2"],
    Data: ["sql", "db", "sqlite"],
  };

  const ext = extension.toLowerCase();
  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }

  return "Other";
}

/**
 * Group files by their base category
 */
export function groupFilesByCategory(
  files: FileMetadata[],
): Record<string, FileMetadata[]> {
  const groups: Record<string, FileMetadata[]> = {};

  for (const file of files) {
    const category = getFileCategory(file.extension);
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(file);
  }

  return groups;
}
