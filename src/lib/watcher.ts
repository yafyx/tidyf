/**
 * File watcher for tidy
 *
 * Uses chokidar to watch directories for new files and emits batched events
 */

import chokidar from "chokidar";
import { EventEmitter } from "events";
import type { WatchEvent } from "../types/organizer.ts";

/**
 * Options for the file watcher
 */
export interface WatcherOptions {
  /** Debounce delay in milliseconds */
  delay?: number;
  /** Patterns to ignore */
  ignore?: string[];
  /** Whether to watch subdirectories */
  recursive?: boolean;
}

/**
 * File watcher that batches events and emits after debounce
 */
export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingFiles: Map<string, WatchEvent> = new Map();
  private isRunning = false;

  constructor(private options: WatcherOptions = {}) {
    super();
    this.options.delay = this.options.delay ?? 3000;
  }

  /**
   * Start watching the specified paths
   */
  start(paths: string[]): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Build ignore patterns for chokidar
    const ignored = [
      /(^|[\/\\])\../, // Hidden files
      "**/node_modules/**",
      "**/.git/**",
      ...(this.options.ignore || []),
    ];

    this.watcher = chokidar.watch(paths, {
      persistent: true,
      ignoreInitial: true,
      ignored,
      depth: this.options.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    this.watcher.on("add", (path) => this.handleEvent("add", path));
    this.watcher.on("change", (path) => this.handleEvent("change", path));
    this.watcher.on("error", (error) => this.emit("error", error));

    this.watcher.on("ready", () => {
      this.emit("ready", paths);
    });
  }

  /**
   * Handle a file event
   */
  private handleEvent(type: "add" | "change", path: string): void {
    // Add to pending files
    this.pendingFiles.set(path, {
      type,
      path,
      timestamp: new Date(),
    });

    // Reset debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushPendingFiles();
    }, this.options.delay);
  }

  /**
   * Flush pending files and emit batch event
   */
  private flushPendingFiles(): void {
    if (this.pendingFiles.size === 0) {
      return;
    }

    const files = Array.from(this.pendingFiles.values());
    this.pendingFiles.clear();

    this.emit("files", files);
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Flush any remaining files
    this.flushPendingFiles();

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.isRunning = false;
    this.emit("stop");
  }

  /**
   * Check if watcher is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get number of pending files
   */
  get pendingCount(): number {
    return this.pendingFiles.size;
  }
}

/**
 * Create a new file watcher
 */
export function createWatcher(options?: WatcherOptions): FileWatcher {
  return new FileWatcher(options);
}
