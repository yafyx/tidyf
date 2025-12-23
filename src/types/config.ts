/**
 * Configuration types for tidy
 */

/**
 * Model selection for AI operations
 */
export interface ModelSelection {
	provider: string;
	model: string;
}

/**
 * Folder rule configuration
 */
export interface FolderRule {
	/** Source folder patterns (glob or paths) */
	sources: string[];
	/** Target base directory */
	target: string;
	/** Whether to watch this folder */
	watch?: boolean;
}

/**
 * Category rule for organizing files
 */
export interface CategoryRule {
	/** Category name */
	name: string;
	/** File extensions that belong to this category */
	extensions?: string[];
	/** MIME type patterns */
	mimeTypes?: string[];
	/** Subfolder name */
	subfolder: string;
}

/**
 * Main configuration interface
 */
export interface TidyConfig {
	/** Model for file analysis */
	organizer?: ModelSelection;
	/** Default source directory */
	defaultSource?: string;
	/** Default target directory */
	defaultTarget?: string;
	/** Whether watch mode is enabled by default */
	watchEnabled?: boolean;
	/** Folder rules */
	folders?: FolderRule[];
	/** Category rules (hints for AI) */
	categories?: CategoryRule[];
	/** Files/patterns to ignore */
	ignore?: string[];
	/** Whether to read file content for better categorization */
	readContent?: boolean;
	/** Max file size to read content (in bytes) */
	maxContentSize?: number;
}

/**
 * Options for config command
 */
export interface ConfigOptions {
	/** Whether to configure locally (current directory) */
	local?: boolean;
}
