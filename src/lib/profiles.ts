/**
 * Profile management for tidyf
 *
 * Handles CRUD operations for profiles stored in ~/.tidy/profiles/
 * Each profile is a directory containing settings.json and optionally rules.md
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Profile, ProfileMetadata, ProfileExport } from "../types/profile.ts";
import type { TidyConfig } from "../types/config.ts";

const CONFIG_DIR = ".tidy";
const PROFILES_DIR = "profiles";
const SETTINGS_FILE = "settings.json";
const RULES_FILE = "rules.md";

/**
 * Get the profiles directory path
 */
export function getProfilesDir(): string {
	return join(homedir(), CONFIG_DIR, PROFILES_DIR);
}

/**
 * Get a specific profile's directory path
 */
export function getProfileDir(name: string): string {
	return join(getProfilesDir(), name);
}

/**
 * Get the path to a profile's settings.json
 */
export function getProfileConfigPath(name: string): string {
	return join(getProfileDir(name), SETTINGS_FILE);
}

/**
 * Get the path to a profile's rules.md
 */
export function getProfileRulesPath(name: string): string {
	return join(getProfileDir(name), RULES_FILE);
}

/**
 * Ensure profiles directory exists
 */
export function ensureProfilesDir(): void {
	const profilesDir = getProfilesDir();
	if (!existsSync(profilesDir)) {
		mkdirSync(profilesDir, { recursive: true });
	}
}

/**
 * Validate a profile name
 * @returns Object with valid boolean and optional error message
 */
export function validateProfileName(name: string): { valid: boolean; error?: string } {
	// Must be non-empty and max 50 characters
	if (!name || name.length === 0) {
		return { valid: false, error: "Profile name cannot be empty" };
	}
	if (name.length > 50) {
		return { valid: false, error: "Profile name must be 50 characters or less" };
	}

	// Alphanumeric, hyphens, underscores only
	if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
		return {
			valid: false,
			error: "Profile name can only contain letters, numbers, hyphens, and underscores",
		};
	}

	// Reserved names
	const reserved = ["default", "global", "local", "none", "profiles"];
	if (reserved.includes(name.toLowerCase())) {
		return { valid: false, error: `"${name}" is a reserved name` };
	}

	return { valid: true };
}

/**
 * Check if a profile exists
 */
export function profileExists(name: string): boolean {
	return existsSync(getProfileDir(name));
}

/**
 * List all profiles with metadata
 */
export function listProfiles(): ProfileMetadata[] {
	const profilesDir = getProfilesDir();

	if (!existsSync(profilesDir)) {
		return [];
	}

	const profiles: ProfileMetadata[] = [];

	try {
		const entries = readdirSync(profilesDir, { withFileTypes: true });

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".")) continue;

			const profileConfigPath = getProfileConfigPath(entry.name);
			const profileRulesPath = getProfileRulesPath(entry.name);

			// Must have settings.json to be a valid profile
			if (!existsSync(profileConfigPath)) continue;

			try {
				const content = readFileSync(profileConfigPath, "utf-8");
				const profile: Profile = JSON.parse(content);

				profiles.push({
					name: entry.name,
					description: profile.description,
					createdAt: profile.createdAt,
					modifiedAt: profile.modifiedAt,
					hasCustomRules: existsSync(profileRulesPath),
				});
			} catch {
				// Skip invalid profiles
			}
		}
	} catch {
		return [];
	}

	// Sort alphabetically by name
	profiles.sort((a, b) => a.name.localeCompare(b.name));

	return profiles;
}

/**
 * Read a profile's configuration
 */
export function readProfile(name: string): Profile | null {
	const configPath = getProfileConfigPath(name);

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const profile: Profile = JSON.parse(content);
		// Ensure name matches directory name
		profile.name = name;
		return profile;
	} catch {
		return null;
	}
}

/**
 * Read a profile's custom rules (if any)
 */
export function readProfileRules(name: string): string | null {
	const rulesPath = getProfileRulesPath(name);

	if (!existsSync(rulesPath)) {
		return null;
	}

	try {
		return readFileSync(rulesPath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Write a profile's configuration
 */
export function writeProfile(name: string, profile: Profile): void {
	ensureProfilesDir();

	const profileDir = getProfileDir(name);
	if (!existsSync(profileDir)) {
		mkdirSync(profileDir, { recursive: true });
	}

	// Update metadata
	const now = new Date().toISOString();
	if (!profile.createdAt) {
		profile.createdAt = now;
	}
	profile.modifiedAt = now;
	profile.name = name;

	const configPath = getProfileConfigPath(name);
	writeFileSync(configPath, JSON.stringify(profile, null, 2), "utf-8");
}

/**
 * Write custom rules for a profile
 */
export function writeProfileRules(name: string, rules: string): void {
	ensureProfilesDir();

	const profileDir = getProfileDir(name);
	if (!existsSync(profileDir)) {
		mkdirSync(profileDir, { recursive: true });
	}

	const rulesPath = getProfileRulesPath(name);
	writeFileSync(rulesPath, rules, "utf-8");
}

/**
 * Delete a profile
 */
export function deleteProfile(name: string): void {
	const profileDir = getProfileDir(name);

	if (existsSync(profileDir)) {
		rmSync(profileDir, { recursive: true, force: true });
	}
}

/**
 * Copy a profile to a new name
 */
export function copyProfile(source: string, destination: string): void {
	const sourceProfile = readProfile(source);
	if (!sourceProfile) {
		throw new Error(`Source profile "${source}" not found`);
	}

	if (profileExists(destination)) {
		throw new Error(`Destination profile "${destination}" already exists`);
	}

	// Copy config with new name and reset timestamps
	const newProfile: Profile = {
		...sourceProfile,
		name: destination,
		createdAt: new Date().toISOString(),
		modifiedAt: new Date().toISOString(),
	};

	writeProfile(destination, newProfile);

	// Copy rules if they exist
	const sourceRules = readProfileRules(source);
	if (sourceRules) {
		writeProfileRules(destination, sourceRules);
	}
}

/**
 * Export a profile for sharing
 */
export function exportProfile(name: string): ProfileExport {
	const profile = readProfile(name);
	if (!profile) {
		throw new Error(`Profile "${name}" not found`);
	}

	const rules = readProfileRules(name);

	return {
		version: "1.0",
		exportedAt: new Date().toISOString(),
		profile,
		rules: rules || undefined,
	};
}

/**
 * Import a profile from an export
 * @param data The exported profile data
 * @param overrideName Optional name to use instead of the one in the export
 * @returns The name of the imported profile
 */
export function importProfile(data: ProfileExport, overrideName?: string): string {
	const name = overrideName || data.profile.name;

	const validation = validateProfileName(name);
	if (!validation.valid) {
		throw new Error(validation.error);
	}

	if (profileExists(name)) {
		throw new Error(`Profile "${name}" already exists`);
	}

	// Import with updated timestamps
	const profile: Profile = {
		...data.profile,
		name,
		createdAt: new Date().toISOString(),
		modifiedAt: new Date().toISOString(),
	};

	writeProfile(name, profile);

	// Import rules if present
	if (data.rules) {
		writeProfileRules(name, data.rules);
	}

	return name;
}

/**
 * Get the config fields that should be merged from a profile
 * (excludes metadata fields)
 */
export function getProfileConfigFields(profile: Profile): Partial<TidyConfig> {
	const { name, description, createdAt, modifiedAt, ...configFields } = profile;
	return configFields;
}
