/**
 * File system utilities for tidy
 */

import { rename, mkdir, access, copyFile, unlink, stat } from "fs/promises";
import { dirname, join, basename, extname } from "path";
import { existsSync } from "fs";
import type { MoveResult, MoveStatus } from "./types";

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * Generate a unique filename by appending a number if the file already exists
 */
export async function generateUniqueName(destination: string): Promise<string> {
  if (!(await fileExists(destination))) {
    return destination;
  }

  const dir = dirname(destination);
  const ext = extname(destination);
  const base = basename(destination, ext);

  let counter = 1;
  let newPath: string;

  do {
    newPath = join(dir, `${base} (${counter})${ext}`);
    counter++;
  } while (await fileExists(newPath));

  return newPath;
}

/**
 * Conflict resolution strategy
 */
export type ConflictStrategy = "rename" | "overwrite" | "skip";

/**
 * Resolve a destination path conflict
 */
export async function resolveConflict(
  destination: string,
  strategy: ConflictStrategy,
): Promise<{ path: string; status: MoveStatus }> {
  const exists = await fileExists(destination);

  if (!exists) {
    return { path: destination, status: "pending" };
  }

  switch (strategy) {
    case "rename":
      return { path: await generateUniqueName(destination), status: "pending" };
    case "overwrite":
      return { path: destination, status: "pending" };
    case "skip":
      return { path: destination, status: "skipped" };
    default:
      return { path: destination, status: "conflict" };
  }
}

/**
 * Move a file from source to destination
 */
export async function moveFile(
  source: string,
  destination: string,
  options: {
    overwrite?: boolean;
    backup?: boolean;
  } = {},
): Promise<MoveResult> {
  try {
    // Ensure the destination directory exists
    await ensureDirectory(dirname(destination));

    // Check if destination exists
    const destExists = await fileExists(destination);

    if (destExists) {
      if (options.backup) {
        // Create a backup of the existing file
        const backupPath = await generateUniqueName(destination + ".backup");
        await copyFile(destination, backupPath);
      }

      if (!options.overwrite) {
        // Generate a unique name
        destination = await generateUniqueName(destination);
      }
    }

    // Try to rename (move) the file
    try {
      await rename(source, destination);
    } catch (error: unknown) {
      // If rename fails (cross-device), fall back to copy + delete
      if ((error as NodeJS.ErrnoException).code === "EXDEV") {
        await copyFile(source, destination);
        await unlink(source);
      } else {
        throw error;
      }
    }

    return {
      source,
      destination,
      status: "completed",
    };
  } catch (error: unknown) {
    return {
      source,
      destination,
      status: "failed",
      error: (error as Error).message,
    };
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * Check if a path is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a file
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}
