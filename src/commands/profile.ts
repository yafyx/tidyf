/**
 * Profile command - manage organization profiles
 *
 * Profiles are named configuration presets that bundle source/target paths,
 * AI model preferences, ignore patterns, and optionally custom rules.
 */

import * as p from "@clack/prompts";
import color from "picocolors";
import { readFileSync, rmSync, writeFileSync } from "fs";
import {
	copyProfile,
	deleteProfile,
	exportProfile,
	getProfileRulesPath,
	importProfile,
	installPreset,
	listProfiles,
	profileExists,
	readProfile,
	readProfileRules,
	validateProfileName,
	writeProfile,
	writeProfileRules,
} from "../lib/profiles.ts";
import { listPresets, getPresetNames } from "../lib/presets.ts";
import {
	getDefaultRules,
	resolveConfig,
} from "../lib/config.ts";
import { getAvailableModels, cleanup } from "../lib/opencode.ts";
import type { Profile, ProfileCommandOptions, ProfileExport } from "../types/profile.ts";
import type { ModelSelection } from "../types/config.ts";

/**
 * Main profile command
 */
export async function profileCommand(options: ProfileCommandOptions): Promise<void> {
	p.intro(color.bgMagenta(color.black(" tidyf profile ")));

	// Route to appropriate subcommand
	const action = options.action || "interactive";

	switch (action) {
		case "list":
			listProfilesInteractive();
			break;

		case "create":
			await createProfileInteractive(options.name, options.fromCurrent);
			break;

		case "edit":
			if (!options.name) {
				p.log.error("Profile name required. Usage: tidyf profile edit <name>");
				break;
			}
			await editProfileInteractive(options.name);
			break;

		case "delete":
			if (!options.name) {
				p.log.error("Profile name required. Usage: tidyf profile delete <name>");
				break;
			}
			await deleteProfileInteractive(options.name, options.force);
			break;

		case "show":
			if (!options.name) {
				p.log.error("Profile name required. Usage: tidyf profile show <name>");
				break;
			}
			showProfile(options.name);
			break;

		case "copy":
			if (!options.name || !options.args?.[0]) {
				p.log.error("Source and destination required. Usage: tidyf profile copy <source> <destination>");
				break;
			}
			await copyProfileInteractive(options.name, options.args[0]);
			break;

		case "export":
			if (!options.name) {
				p.log.error("Profile name required. Usage: tidyf profile export <name>");
				break;
			}
			exportProfileToStdout(options.name);
			break;

		case "import":
			if (!options.name) {
				p.log.error("File path required. Usage: tidyf profile import <file>");
				break;
			}
			await importProfileFromFile(options.name);
			break;

		case "install":
			if (!options.name) {
				p.log.error("Preset name required. Usage: tidyf profile install <preset> [profile-name]");
				p.log.info(`Available presets: ${getPresetNames().join(", ")}`);
				break;
			}
			await installPresetInteractive(options.name, options.args?.[0]);
			break;

		case "presets":
			listPresetsInteractive();
			break;

		case "interactive":
		default:
			await interactiveMenu();
			break;
	}

	p.outro(color.green("Done!"));
	cleanup();
}

/**
 * Interactive profile management menu
 */
async function interactiveMenu(): Promise<void> {
	const profiles = listProfiles();

	let done = false;
	while (!done) {
		const action = await p.select({
			message: "What would you like to do?",
			options: [
				{
					value: "list",
					label: "List profiles",
					hint: `${profiles.length} profile(s)`,
				},
				{
					value: "create",
					label: "Create new profile",
				},
				{
					value: "install",
					label: "Install preset",
					hint: "developer, creative, student, downloads",
				},
				{
					value: "edit",
					label: "Edit a profile",
					hint: profiles.length === 0 ? "No profiles yet" : undefined,
				},
				{
					value: "delete",
					label: "Delete a profile",
					hint: profiles.length === 0 ? "No profiles yet" : undefined,
				},
				{
					value: "show",
					label: "Show profile details",
				},
				{
					value: "copy",
					label: "Copy a profile",
				},
				{
					value: "done",
					label: "Done",
				},
			],
		});

		if (p.isCancel(action) || action === "done") {
			done = true;
			break;
		}

		switch (action) {
			case "list":
				listProfilesInteractive();
				break;

			case "create":
				await createProfileInteractive();
				break;

			case "install":
				await installPresetMenuInteractive();
				break;

			case "edit": {
				const name = await selectProfile("edit");
				if (name) await editProfileInteractive(name);
				break;
			}

			case "delete": {
				const name = await selectProfile("delete");
				if (name) await deleteProfileInteractive(name);
				break;
			}

			case "show": {
				const name = await selectProfile("view");
				if (name) showProfile(name);
				break;
			}

			case "copy": {
				const source = await selectProfile("copy");
				if (source) {
					const dest = await p.text({
						message: "New profile name:",
						validate: (value) => {
							const validation = validateProfileName(value);
							if (!validation.valid) return validation.error;
							if (profileExists(value)) return `Profile "${value}" already exists`;
						},
					});
					if (!p.isCancel(dest)) {
						await copyProfileInteractive(source, dest);
					}
				}
				break;
			}
		}
	}
}

/**
 * Select a profile from the list
 */
async function selectProfile(action: string): Promise<string | null> {
	const profiles = listProfiles();

	if (profiles.length === 0) {
		p.log.warn("No profiles found. Create one first.");
		return null;
	}

	const selected = await p.select({
		message: `Select profile to ${action}:`,
		options: profiles.map((profile) => ({
			value: profile.name,
			label: profile.name,
			hint: profile.description || (profile.hasCustomRules ? "custom rules" : undefined),
		})),
	});

	if (p.isCancel(selected)) return null;
	return selected as string;
}

/**
 * List all profiles
 */
function listProfilesInteractive(): void {
	const profiles = listProfiles();

	console.log();
	if (profiles.length === 0) {
		p.log.info("No profiles found.");
		p.log.message(color.dim("Create one with: tidyf profile create <name>"));
	} else {
		p.log.info(color.bold(`${profiles.length} profile(s):`));
		console.log();

		for (const profile of profiles) {
			const description = profile.description ? ` - ${profile.description}` : "";
			const customRules = profile.hasCustomRules ? color.cyan(" (custom rules)") : "";
			p.log.message(`  ${color.green("●")} ${color.bold(profile.name)}${description}${customRules}`);
		}
	}
	console.log();
}

/**
 * Create a new profile
 */
async function createProfileInteractive(
	initialName?: string,
	fromCurrent?: boolean,
): Promise<void> {
	// Get profile name
	let name = initialName;
	if (!name) {
		const inputName = await p.text({
			message: "Profile name:",
			placeholder: "work",
			validate: (value) => {
				const validation = validateProfileName(value);
				if (!validation.valid) return validation.error;
				if (profileExists(value)) return `Profile "${value}" already exists`;
			},
		});

		if (p.isCancel(inputName)) return;
		name = inputName;
	} else {
		// Validate provided name
		const validation = validateProfileName(name);
		if (!validation.valid) {
			p.log.error(validation.error!);
			return;
		}
		if (profileExists(name)) {
			p.log.error(`Profile "${name}" already exists`);
			return;
		}
	}

	// Start with current effective config or empty
	let profile: Profile;
	if (fromCurrent) {
		const currentConfig = resolveConfig();
		profile = {
			name,
			...currentConfig,
		};
		p.log.info("Creating profile from current effective configuration...");
	} else {
		profile = { name };
	}

	// Get description
	const description = await p.text({
		message: "Description (optional):",
		placeholder: "e.g., Work documents and projects",
	});
	if (!p.isCancel(description) && description) {
		profile.description = description;
	}

	// Configure source
	const configureSource = await p.confirm({
		message: "Set custom source directory?",
		initialValue: !fromCurrent,
	});
	if (!p.isCancel(configureSource) && configureSource) {
		const source = await p.text({
			message: "Source directory:",
			placeholder: "~/Downloads",
			initialValue: profile.defaultSource,
		});
		if (!p.isCancel(source) && source) {
			profile.defaultSource = source;
		}
	}

	// Configure target
	const configureTarget = await p.confirm({
		message: "Set custom target directory?",
		initialValue: !fromCurrent,
	});
	if (!p.isCancel(configureTarget) && configureTarget) {
		const target = await p.text({
			message: "Target directory:",
			placeholder: "~/Documents/Organized",
			initialValue: profile.defaultTarget,
		});
		if (!p.isCancel(target) && target) {
			profile.defaultTarget = target;
		}
	}

	// Configure model
	const configureModel = await p.confirm({
		message: "Set custom AI model?",
		initialValue: false,
	});
	if (!p.isCancel(configureModel) && configureModel) {
		await configureProfileModel(profile);
	}

	// Save profile
	writeProfile(name, profile);
	p.log.success(`Profile "${name}" created!`);

	// Ask about custom rules
	const createRules = await p.confirm({
		message: "Create custom rules for this profile?",
		initialValue: false,
	});
	if (!p.isCancel(createRules) && createRules) {
		writeProfileRules(name, getDefaultRules());
		p.log.success(`Created rules at ${getProfileRulesPath(name)}`);
		p.log.message(color.dim("Edit this file to customize how AI categorizes files for this profile."));
	}
}

/**
 * Edit an existing profile
 */
async function editProfileInteractive(name: string): Promise<void> {
	if (!profileExists(name)) {
		p.log.error(`Profile "${name}" not found`);

		const profiles = listProfiles();
		if (profiles.length > 0) {
			p.log.info("Available profiles:");
			profiles.forEach((pr) => p.log.message(`  - ${pr.name}`));
		}
		return;
	}

	const profile = readProfile(name);
	if (!profile) {
		p.log.error(`Failed to read profile "${name}"`);
		return;
	}

	let done = false;
	while (!done) {
		const action = await p.select({
			message: `Editing profile: ${color.bold(name)}`,
			options: [
				{
					value: "description",
					label: "Description",
					hint: profile.description || "(not set)",
				},
				{
					value: "source",
					label: "Source Directory",
					hint: profile.defaultSource || "(inherit global)",
				},
				{
					value: "target",
					label: "Target Directory",
					hint: profile.defaultTarget || "(inherit global)",
				},
				{
					value: "model",
					label: "AI Model",
					hint: profile.organizer
						? `${profile.organizer.provider}/${profile.organizer.model}`
						: "(inherit global)",
				},
				{
					value: "ignore",
					label: "Ignore Patterns",
					hint: profile.ignore ? `${profile.ignore.length} patterns` : "(inherit global)",
				},
				{
					value: "rules",
					label: "Custom Rules",
					hint: readProfileRules(name) ? "configured" : "(inherit global)",
				},
				{
					value: "clear",
					label: "Clear a setting",
					hint: "Remove override, inherit from global",
				},
				{
					value: "done",
					label: "Done",
				},
			],
		});

		if (p.isCancel(action) || action === "done") {
			done = true;
			break;
		}

		switch (action) {
			case "description": {
				const description = await p.text({
					message: "Description:",
					initialValue: profile.description || "",
				});
				if (!p.isCancel(description)) {
					profile.description = description || undefined;
					writeProfile(name, profile);
					p.log.success("Description updated");
				}
				break;
			}

			case "source": {
				const source = await p.text({
					message: "Source directory:",
					initialValue: profile.defaultSource || "",
					placeholder: "~/Downloads",
				});
				if (!p.isCancel(source)) {
					profile.defaultSource = source || undefined;
					writeProfile(name, profile);
					p.log.success("Source directory updated");
				}
				break;
			}

			case "target": {
				const target = await p.text({
					message: "Target directory:",
					initialValue: profile.defaultTarget || "",
					placeholder: "~/Documents/Organized",
				});
				if (!p.isCancel(target)) {
					profile.defaultTarget = target || undefined;
					writeProfile(name, profile);
					p.log.success("Target directory updated");
				}
				break;
			}

			case "model":
				await configureProfileModel(profile);
				writeProfile(name, profile);
				break;

			case "ignore": {
				await configureProfileIgnore(profile);
				writeProfile(name, profile);
				break;
			}

			case "rules": {
				const hasRules = readProfileRules(name) !== null;
				if (hasRules) {
					p.log.info(`Rules file: ${getProfileRulesPath(name)}`);
					p.log.message(color.dim("Edit this file to customize categorization."));

					const deleteRules = await p.confirm({
						message: "Delete custom rules? (will inherit from global)",
						initialValue: false,
					});
					if (!p.isCancel(deleteRules) && deleteRules) {
						rmSync(getProfileRulesPath(name));
						p.log.success("Custom rules removed");
					}
				} else {
					const createRules = await p.confirm({
						message: "Create custom rules for this profile?",
						initialValue: true,
					});
					if (!p.isCancel(createRules) && createRules) {
						writeProfileRules(name, getDefaultRules());
						p.log.success(`Created rules at ${getProfileRulesPath(name)}`);
					}
				}
				break;
			}

			case "clear": {
				const toClear = await p.select({
					message: "Which setting to clear?",
					options: [
						{ value: "source", label: "Source Directory" },
						{ value: "target", label: "Target Directory" },
						{ value: "model", label: "AI Model" },
						{ value: "ignore", label: "Ignore Patterns" },
						{ value: "cancel", label: "Cancel" },
					],
				});

				if (!p.isCancel(toClear) && toClear !== "cancel") {
					switch (toClear) {
						case "source":
							delete profile.defaultSource;
							break;
						case "target":
							delete profile.defaultTarget;
							break;
						case "model":
							delete profile.organizer;
							break;
						case "ignore":
							delete profile.ignore;
							break;
					}
					writeProfile(name, profile);
					p.log.success(`Cleared ${toClear}, will inherit from global`);
				}
				break;
			}
		}
	}
}

/**
 * Configure AI model for a profile
 */
async function configureProfileModel(profile: Profile): Promise<void> {
	const s = p.spinner();
	s.start("Fetching available models...");

	let providers: any[] = [];
	try {
		const response = await getAvailableModels();
		if (!response.error) {
			providers = response.data?.providers || [];
		}
		s.stop(`Found ${providers.length} providers`);
	} catch {
		s.stop("Using manual entry");
	}

	if (providers.length > 0) {
		const providerOptions = providers.map((prov) => ({
			value: prov.id,
			label: prov.name || prov.id,
		}));
		providerOptions.push({ value: "custom", label: "Enter custom..." });

		const selectedProvider = await p.select({
			message: "Select AI provider:",
			options: providerOptions,
		});

		if (p.isCancel(selectedProvider)) return;

		let providerId: string;
		let modelName: string;

		if (selectedProvider === "custom") {
			const custom = await p.text({
				message: "Enter model (provider/model):",
				placeholder: "opencode/claude-sonnet-4-5",
			});
			if (p.isCancel(custom)) return;
			const parts = custom.split("/");
			providerId = parts[0];
			modelName = parts.slice(1).join("/");
		} else {
			providerId = selectedProvider as string;
			const providerData = providers.find((prov) => prov.id === providerId);
			let modelIds: string[] = [];

			if (providerData?.models) {
				if (Array.isArray(providerData.models)) {
					modelIds = providerData.models;
				} else if (typeof providerData.models === "object") {
					modelIds = Object.keys(providerData.models);
				}
			}

			if (modelIds.length > 0) {
				const modelOptions = modelIds.map((m: string) => ({ value: m, label: m }));
				const selectedModel = await p.select({
					message: "Select model:",
					options: modelOptions,
				});
				if (p.isCancel(selectedModel)) return;
				modelName = selectedModel as string;
			} else {
				const customModel = await p.text({ message: "Enter model ID:" });
				if (p.isCancel(customModel)) return;
				modelName = customModel;
			}
		}

		profile.organizer = { provider: providerId, model: modelName };
		p.log.success(`Model set to ${providerId}/${modelName}`);
	} else {
		const manual = await p.text({
			message: "Enter model (provider/model):",
			placeholder: "opencode/claude-sonnet-4-5",
		});
		if (p.isCancel(manual)) return;
		const parts = manual.split("/");
		profile.organizer = {
			provider: parts[0],
			model: parts.slice(1).join("/"),
		};
		p.log.success(`Model set to ${manual}`);
	}
}

/**
 * Configure ignore patterns for a profile
 */
async function configureProfileIgnore(profile: Profile): Promise<void> {
	const currentPatterns = profile.ignore || [];

	p.log.info("Current ignore patterns:");
	if (currentPatterns.length === 0) {
		p.log.message(color.dim("  (inheriting from global)"));
	} else {
		for (const pattern of currentPatterns) {
			p.log.message(`  ${pattern}`);
		}
	}

	const action = await p.select({
		message: "What would you like to do?",
		options: [
			{ value: "add", label: "Add pattern" },
			{ value: "remove", label: "Remove pattern" },
			{ value: "clear", label: "Clear all (inherit from global)" },
			{ value: "back", label: "Back" },
		],
	});

	if (p.isCancel(action) || action === "back") return;

	switch (action) {
		case "add": {
			const pattern = await p.text({
				message: "Pattern to ignore:",
				placeholder: "*.tmp",
			});
			if (!p.isCancel(pattern) && pattern) {
				profile.ignore = [...currentPatterns, pattern];
				p.log.success(`Added pattern: ${pattern}`);
			}
			break;
		}

		case "remove": {
			if (currentPatterns.length === 0) {
				p.log.warn("No patterns to remove");
				break;
			}
			const toRemove = await p.select({
				message: "Select pattern to remove:",
				options: currentPatterns.map((pat) => ({ value: pat, label: pat })),
			});
			if (!p.isCancel(toRemove)) {
				profile.ignore = currentPatterns.filter((pat) => pat !== toRemove);
				p.log.success(`Removed: ${toRemove}`);
			}
			break;
		}

		case "clear":
			delete profile.ignore;
			p.log.success("Cleared ignore patterns, will inherit from global");
			break;
	}
}

/**
 * Delete a profile
 */
async function deleteProfileInteractive(name: string, force?: boolean): Promise<void> {
	if (!profileExists(name)) {
		p.log.error(`Profile "${name}" not found`);
		return;
	}

	if (!force) {
		const confirm = await p.confirm({
			message: `Delete profile "${name}"? This cannot be undone.`,
			initialValue: false,
		});
		if (p.isCancel(confirm) || !confirm) return;
	}

	deleteProfile(name);
	p.log.success(`Deleted profile "${name}"`);
}

/**
 * Show profile details
 */
function showProfile(name: string): void {
	const profile = readProfile(name);
	if (!profile) {
		p.log.error(`Profile "${name}" not found`);
		return;
	}

	console.log();
	p.log.info(color.bold(`Profile: ${name}`));
	console.log();

	if (profile.description) {
		p.log.message(`${color.bold("Description:")} ${profile.description}`);
	}

	p.log.message(
		`${color.bold("Source:")} ${profile.defaultSource || color.dim("(inherit global)")}`,
	);
	p.log.message(
		`${color.bold("Target:")} ${profile.defaultTarget || color.dim("(inherit global)")}`,
	);

	if (profile.organizer) {
		p.log.message(
			`${color.bold("AI Model:")} ${profile.organizer.provider}/${profile.organizer.model}`,
		);
	} else {
		p.log.message(`${color.bold("AI Model:")} ${color.dim("(inherit global)")}`);
	}

	if (profile.ignore && profile.ignore.length > 0) {
		p.log.message(`${color.bold("Ignore Patterns:")} ${profile.ignore.join(", ")}`);
	} else {
		p.log.message(`${color.bold("Ignore Patterns:")} ${color.dim("(inherit global)")}`);
	}

	const hasRules = readProfileRules(name) !== null;
	p.log.message(
		`${color.bold("Custom Rules:")} ${hasRules ? color.green("Yes") : color.dim("(inherit global)")}`,
	);

	if (profile.createdAt) {
		p.log.message(`${color.bold("Created:")} ${new Date(profile.createdAt).toLocaleString()}`);
	}
	if (profile.modifiedAt) {
		p.log.message(`${color.bold("Modified:")} ${new Date(profile.modifiedAt).toLocaleString()}`);
	}

	console.log();
}

/**
 * Copy a profile
 */
async function copyProfileInteractive(source: string, destination: string): Promise<void> {
	const validation = validateProfileName(destination);
	if (!validation.valid) {
		p.log.error(validation.error!);
		return;
	}

	try {
		copyProfile(source, destination);
		p.log.success(`Copied "${source}" to "${destination}"`);
	} catch (error: any) {
		p.log.error(error.message);
	}
}

/**
 * Export profile to stdout
 */
function exportProfileToStdout(name: string): void {
	try {
		const exported = exportProfile(name);
		console.log(JSON.stringify(exported, null, 2));
	} catch (error: any) {
		p.log.error(error.message);
	}
}

/**
 * Import profile from file
 */
async function importProfileFromFile(filePath: string): Promise<void> {
	try {
		const content = readFileSync(filePath, "utf-8");
		const data: ProfileExport = JSON.parse(content);

		// Ask for name if profile with that name exists
		let name = data.profile.name;
		if (profileExists(name)) {
			const newName = await p.text({
				message: `Profile "${name}" already exists. Enter a new name:`,
				validate: (value) => {
					const validation = validateProfileName(value);
					if (!validation.valid) return validation.error;
					if (profileExists(value)) return `Profile "${value}" already exists`;
				},
			});
			if (p.isCancel(newName)) return;
			name = newName;
		}

		const importedName = importProfile(data, name);
		p.log.success(`Imported profile "${importedName}"`);
	} catch (error: any) {
		p.log.error(`Failed to import: ${error.message}`);
	}
}

/**
 * List available presets
 */
function listPresetsInteractive(): void {
	const presets = listPresets();

	console.log();
	p.log.info(color.bold(`${presets.length} available preset(s):`));
	console.log();

	for (const preset of presets) {
		p.log.message(`  ${color.cyan("●")} ${color.bold(preset.name)} - ${preset.description}`);
	}
	console.log();
	p.log.message(color.dim("Install with: tidyf profile install <preset> [custom-name]"));
	console.log();
}

/**
 * Install a preset as a profile (interactive menu version)
 */
async function installPresetMenuInteractive(): Promise<void> {
	const presets = listPresets();

	const selected = await p.select({
		message: "Select preset to install:",
		options: presets.map((preset) => ({
			value: preset.name,
			label: preset.name,
			hint: preset.description,
		})),
	});

	if (p.isCancel(selected)) return;

	const presetName = selected as string;

	// Ask for custom name
	const customName = await p.text({
		message: "Profile name (or leave empty to use preset name):",
		placeholder: presetName,
		validate: (value) => {
			if (!value) return; // Empty is OK, will use preset name
			const validation = validateProfileName(value);
			if (!validation.valid) return validation.error;
			if (profileExists(value)) return `Profile "${value}" already exists`;
		},
	});

	if (p.isCancel(customName)) return;

	const profileName = customName || undefined;

	// Check if using preset name and it exists
	if (!profileName && profileExists(presetName)) {
		p.log.error(`Profile "${presetName}" already exists. Please choose a different name.`);
		return;
	}

	await installPresetInteractive(presetName, profileName);
}

/**
 * Install a preset as a profile (CLI version)
 */
async function installPresetInteractive(presetName: string, profileName?: string): Promise<void> {
	try {
		const installedName = installPreset(presetName, profileName);
		p.log.success(`Installed preset "${presetName}" as profile "${installedName}"`);
		p.log.message(color.dim(`Use with: tidyf -p ${installedName} <path>`));
	} catch (error: any) {
		p.log.error(error.message);
	}
}
