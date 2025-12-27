/**
 * Profile types for tidyf
 *
 * Profiles allow users to create named configuration presets
 * that bundle source/target paths, AI model preferences, ignore patterns,
 * and optionally custom organization rules.
 */

import type { TidyConfig } from "./config.ts";

/**
 * Profile configuration - extends TidyConfig with metadata
 * Profiles inherit from global config, only overriding specified fields.
 */
export interface Profile extends Partial<TidyConfig> {
	/** Profile name (directory name) */
	name: string;
	/** Human-readable description */
	description?: string;
	/** When the profile was created */
	createdAt?: string;
	/** When the profile was last modified */
	modifiedAt?: string;
}

/**
 * Profile metadata for listing (without full config)
 */
export interface ProfileMetadata {
	/** Profile name */
	name: string;
	/** Human-readable description */
	description?: string;
	/** When the profile was created */
	createdAt?: string;
	/** When the profile was last modified */
	modifiedAt?: string;
	/** Whether profile has custom rules.md */
	hasCustomRules: boolean;
}

/**
 * Options for profile command
 */
export interface ProfileCommandOptions {
	/** Subcommand: list, create, edit, delete, show, copy, export, import */
	action?: string;
	/** Profile name for operations */
	name?: string;
	/** Additional arguments (e.g., destination for copy) */
	args?: string[];
	/** Create from current effective config */
	fromCurrent?: boolean;
	/** Force operation without confirmation */
	force?: boolean;
}

/**
 * Export format for profiles (for sharing)
 */
export interface ProfileExport {
	/** Export format version */
	version: string;
	/** When the export was created */
	exportedAt: string;
	/** The profile configuration */
	profile: Profile;
	/** Optional custom rules content */
	rules?: string;
}
