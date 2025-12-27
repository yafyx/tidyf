/**
 * Config command - configure AI models, folders, and rules
 */

import * as p from "@clack/prompts";
import { existsSync } from "fs";
import color from "picocolors";
import {
	expandPath,
	getDefaultConfig,
	getDefaultRules,
	getGlobalConfigPath,
	getGlobalRulesPath,
	getLocalConfigPath,
	getLocalRulesPath,
	initGlobalConfig,
	readConfig,
	readRules,
	resolveConfig,
	writeConfig,
	writeRules,
} from "../lib/config.ts";
import { cleanup, getAvailableModels } from "../lib/opencode.ts";
import {
	listProfiles,
	profileExists,
	validateProfileName,
	writeProfile,
} from "../lib/profiles.ts";
import type {
	ConfigOptions,
	ModelSelection,
	TidyConfig,
} from "../types/config.ts";
import type { Profile } from "../types/profile.ts";

/**
 * Main config command
 */
export async function configCommand(options: ConfigOptions): Promise<void> {
	try {
		p.intro(color.bgCyan(color.black(" tidyf config ")));
	} catch (error: any) {
		console.log(color.cyan(" tidyf config "));
		console.log();
		console.log("Unable to display interactive interface.");
		console.log("Your terminal may not support interactive prompts.");
		console.log();
		console.log(`Edit your config directly at: ${getGlobalConfigPath()}`);
		console.log(`Edit your rules at: ${getGlobalRulesPath()}`);
		console.log();
		process.exit(0);
	}

	// Initialize global config if needed
	initGlobalConfig();

	// Determine scope
	const scope = options.local ? "local" : "global";
	const configPath =
		scope === "global" ? getGlobalConfigPath() : getLocalConfigPath();
	const rulesPath =
		scope === "global" ? getGlobalRulesPath() : getLocalRulesPath();

	p.log.info(`Configuring ${color.bold(scope)} settings`);
	p.log.message(color.dim(`Config: ${configPath}`));

	// Main menu loop
	let done = false;
	while (!done) {
		// Re-read config each iteration to show updated values
		const currentConfig = readConfig(configPath);
		const effectiveConfig = resolveConfig();

		const action = await p.select({
			message: "What would you like to configure?",
			options: [
				{
					value: "model",
					label: "AI Model",
					hint: `Current: ${effectiveConfig.organizer?.provider}/${effectiveConfig.organizer?.model}`,
				},
				{
					value: "source",
					label: "Default Source Directory",
					hint: effectiveConfig.defaultSource || "Not set",
				},
				{
					value: "target",
					label: "Default Target Directory",
					hint: effectiveConfig.defaultTarget || "Not set",
				},
				{
					value: "ignore",
					label: "Ignore Patterns",
					hint: `${effectiveConfig.ignore?.length || 0} patterns`,
				},
				{
					value: "content",
					label: "Content Reading",
					hint: effectiveConfig.readContent ? "Enabled" : "Disabled",
				},
				{
					value: "watch",
					label: "Watch Mode",
					hint: effectiveConfig.watchEnabled ? "Enabled" : "Disabled",
				},
				{
					value: "rules",
					label: "Edit Organization Rules",
					hint: "Customize AI prompts",
				},
				{
					value: "view",
					label: "View Current Configuration",
				},
				{
					value: "save_as_profile",
					label: "Save as Profile",
					hint: "Create a new profile from current settings",
				},
				{
					value: "reset",
					label: "Reset to Defaults",
					hint: color.red("Destructive"),
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
			case "model":
				await configureModel(configPath, currentConfig);
				break;
			case "source":
				await configureSource(configPath, currentConfig);
				break;
			case "target":
				await configureTarget(configPath, currentConfig);
				break;
			case "ignore":
				await configureIgnore(configPath, currentConfig);
				break;
			case "content":
				await configureContent(configPath, currentConfig);
				break;
			case "watch":
				await configureWatch(configPath, currentConfig);
				break;
			case "rules":
				await configureRules(rulesPath);
				break;
			case "view":
				viewConfig(effectiveConfig, scope);
				break;
			case "save_as_profile":
				await saveAsProfile(effectiveConfig);
				break;
			case "reset":
				await resetConfig(configPath, rulesPath, scope);
				break;
		}
	}

	p.outro(color.green("Configuration saved!"));
	cleanup();
	process.exit(0);
}

/**
 * Configure AI model
 */
/**
 * Configure AI model
 */
async function configureModel(
	configPath: string,
	config: TidyConfig,
): Promise<void> {
	// Try to get available models
	const s = p.spinner();
	s.start("Fetching available models from OpenCode...");

	let providers: any[] = [];
	try {
		const response = await getAvailableModels();
		if (response.error) {
			throw new Error("Failed to fetch models");
		}
		providers = response.data?.providers || [];
		s.stop(`Fetched ${providers.length} providers`);
	} catch (error: any) {
		s.stop("Failed to fetch models");
		p.log.error(error.message);
		p.log.warn("Using manual entry fallback.");
	}

	// Helper to format model display
	const formatModel = (sel?: ModelSelection) => {
		if (!sel) return color.dim("default");
		return `${color.cyan(sel.provider)}/${color.green(sel.model)}`;
	};

	p.log.info(`Current Model: ${formatModel(config.organizer)}`);

	let providerId: string;
	let modelName: string;

	if (providers.length > 0) {
		// Select Provider
		const providerOptions = providers.map((prov) => ({
			value: prov.id,
			label: prov.name || prov.id,
		}));

		// Add custom option
		providerOptions.push({
			value: "custom",
			label: "Enter custom provider...",
		});

		const selectedProvider = await p.select({
			message: "Select AI provider:",
			options: providerOptions,
		});

		if (p.isCancel(selectedProvider)) return;

		if (selectedProvider === "custom") {
			const customProv = await p.text({
				message: "Enter provider ID:",
				placeholder: "opencode",
				validate: (value) => {
					if (!value) return "Provider ID is required";
				},
			});
			if (p.isCancel(customProv)) return;
			providerId = customProv;

			const customModel = await p.text({
				message: "Enter model ID:",
				placeholder: "gpt-4o",
				validate: (value) => {
					if (!value) return "Model ID is required";
				},
			});
			if (p.isCancel(customModel)) return;
			modelName = customModel;
		} else {
			providerId = selectedProvider as string;
			const providerData = providers.find((p) => p.id === providerId);

			if (!providerData || !providerData.models) {
				p.log.warn(
					`No models found for provider ${providerId}, please enter manually.`,
				);
				const customModel = await p.text({
					message: "Enter model ID:",
					placeholder: "gpt-4o",
					validate: (value) => {
						if (!value) return "Model ID is required";
					},
				});
				if (p.isCancel(customModel)) return;
				modelName = customModel;
			} else {
				// Handle models (can be array or object map)
				let modelIds: string[] = [];
				if (Array.isArray(providerData.models)) {
					modelIds = providerData.models;
				} else if (typeof providerData.models === "object") {
					modelIds = Object.keys(providerData.models);
				}

				if (modelIds.length === 0) {
					p.log.warn(`No models found for provider ${providerId}`);
					const customModel = await p.text({
						message: "Enter model ID:",
					});
					if (p.isCancel(customModel)) return;
					modelName = customModel;
				} else {
					const modelOptions = modelIds.map((model: string) => ({
						value: model,
						label: model,
					}));
					// Add custom option
					modelOptions.push({
						value: "custom",
						label: "Enter custom model...",
					});

					const selectedModel = await p.select({
						message: "Select model:",
						options: modelOptions,
					});

					if (p.isCancel(selectedModel)) return;

					if (selectedModel === "custom") {
						const customModel = await p.text({
							message: "Enter model ID:",
						});
						if (p.isCancel(customModel)) return;
						modelName = customModel;
					} else {
						modelName = selectedModel as string;
					}
				}
			}
		}
	} else {
		// Fallback to manual entry if no providers found
		const manualEntry = await p.text({
			message: "Enter model (format: provider/model):",
			placeholder: "opencode/gpt-4o",
			validate: (value) => {
				if (!value.includes("/")) {
					return "Model must be in format: provider/model";
				}
			},
		});

		if (p.isCancel(manualEntry)) {
			return;
		}

		const parts = manualEntry.split("/");
		providerId = parts[0];
		modelName = parts.slice(1).join("/");
	}

	config.organizer = { provider: providerId, model: modelName };
	writeConfig(configPath, config);

	p.log.success(`Model set to ${color.cyan(providerId + "/" + modelName)}`);
}

/**
 * Configure source directory
 */
async function configureSource(
	configPath: string,
	config: TidyConfig,
): Promise<void> {
	const source = await p.text({
		message: "Enter default source directory to organize files from:",
		initialValue: config.defaultSource || "~/Downloads",
		placeholder: "~/Downloads",
		validate: (value) => {
			if (!value) {
				return "Source directory is required";
			}
		},
	});

	if (p.isCancel(source)) {
		return;
	}

	config.defaultSource = source;
	writeConfig(configPath, config);

	p.log.success(`Source directory set to ${color.cyan(source)}`);
}

/**
 * Configure target directory
 */
async function configureTarget(
	configPath: string,
	config: TidyConfig,
): Promise<void> {
	const target = await p.text({
		message: "Enter default target directory for organized files:",
		initialValue: config.defaultTarget || "~/Documents/Organized",
		placeholder: "~/Documents/Organized",
		validate: (value) => {
			if (!value) {
				return "Target directory is required";
			}
		},
	});

	if (p.isCancel(target)) {
		return;
	}

	config.defaultTarget = target;
	writeConfig(configPath, config);

	p.log.success(`Target directory set to ${color.cyan(target)}`);
}

/**
 * Configure ignore patterns
 */
async function configureIgnore(
	configPath: string,
	config: TidyConfig,
): Promise<void> {
	const currentPatterns = config.ignore || [];

	p.log.info("Current ignore patterns:");
	if (currentPatterns.length === 0) {
		p.log.message(color.dim("  (none)"));
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
			{ value: "reset", label: "Reset to defaults" },
			{ value: "back", label: "Back" },
		],
	});

	if (p.isCancel(action) || action === "back") {
		return;
	}

	switch (action) {
		case "add": {
			const pattern = await p.text({
				message: "Enter pattern to ignore (e.g., *.tmp, .DS_Store):",
				placeholder: "*.tmp",
			});

			if (!p.isCancel(pattern) && pattern) {
				config.ignore = [...currentPatterns, pattern];
				writeConfig(configPath, config);
				p.log.success(`Added pattern: ${color.cyan(pattern)}`);
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
				options: currentPatterns.map((p) => ({ value: p, label: p })),
			});

			if (!p.isCancel(toRemove)) {
				config.ignore = currentPatterns.filter((p) => p !== toRemove);
				writeConfig(configPath, config);
				p.log.success(`Removed pattern: ${color.cyan(toRemove as string)}`);
			}
			break;
		}

		case "reset": {
			const defaults = getDefaultConfig();
			config.ignore = defaults.ignore;
			writeConfig(configPath, config);
			p.log.success("Reset ignore patterns to defaults");
			break;
		}
	}
}

/**
 * Configure content reading
 */
async function configureContent(
	configPath: string,
	config: TidyConfig,
): Promise<void> {
	const enabled = await p.confirm({
		message:
			"Enable content reading? (Reads text files to help AI categorize better)",
		initialValue: config.readContent ?? false,
	});

	if (p.isCancel(enabled)) {
		return;
	}

	config.readContent = enabled;

	if (enabled) {
		const maxSize = await p.text({
			message: "Maximum file size to read (bytes):",
			initialValue: String(config.maxContentSize || 10240),
			placeholder: "10240",
			validate: (value) => {
				const num = parseInt(value);
				if (isNaN(num) || num <= 0) {
					return "Must be a positive number";
				}
			},
		});

		if (!p.isCancel(maxSize)) {
			config.maxContentSize = parseInt(maxSize);
		}
	}

	writeConfig(configPath, config);
	p.log.success(
		`Content reading ${enabled ? color.green("enabled") : color.yellow("disabled")}`,
	);
}

/**
 * Configure watch mode
 */
async function configureWatch(
	configPath: string,
	config: TidyConfig,
): Promise<void> {
	const enabled = await p.confirm({
		message: "Enable watch mode by default? (Auto-organize new files in source directory)",
		initialValue: config.watchEnabled ?? false,
	});

	if (p.isCancel(enabled)) {
		return;
	}

	config.watchEnabled = enabled;
	writeConfig(configPath, config);

	p.log.success(
		`Watch mode ${enabled ? color.green("enabled") : color.yellow("disabled")}`,
	);
}

/**
 * Configure rules (open in editor hint)
 */
async function configureRules(rulesPath: string): Promise<void> {
	const rules = readRules(rulesPath);

	if (!rules) {
		const create = await p.confirm({
			message: "No rules file found. Create one with defaults?",
			initialValue: true,
		});

		if (p.isCancel(create) || !create) {
			return;
		}

		writeRules(rulesPath, getDefaultRules());
		p.log.success("Created rules file with defaults");
	}

	p.log.info(`Rules file: ${color.cyan(rulesPath)}`);
	p.log.message(
		color.dim(
			"Edit this markdown file to customize how AI categorizes your files.",
		),
	);
	p.log.message(
		color.dim("You can define categories, special rules, and output format."),
	);

	// Show first few lines as preview
	const preview = (readRules(rulesPath) || "")
		.split("\n")
		.slice(0, 10)
		.join("\n");
	console.log();
	console.log(color.dim(preview));
	console.log(color.dim("..."));
}

/**
 * View current configuration
 */
function viewConfig(config: TidyConfig, scope: string): void {
	console.log();
	p.log.info(color.bold(`Current ${scope} configuration:`));
	console.log();

	p.log.message(
		`${color.bold("AI Model:")} ${config.organizer?.provider}/${config.organizer?.model}`,
	);
	p.log.message(
		`${color.bold("Default Source:")} ${config.defaultSource || "(not set)"}`,
	);
	p.log.message(
		`${color.bold("Default Target:")} ${config.defaultTarget || "(not set)"}`,
	);
	p.log.message(
		`${color.bold("Content Reading:")} ${config.readContent ? "Enabled" : "Disabled"}`,
	);
	p.log.message(
		`${color.bold("Watch Mode:")} ${config.watchEnabled ? "Enabled" : "Disabled"}`,
	);

	if (config.readContent) {
		p.log.message(
			`${color.bold("Max Content Size:")} ${config.maxContentSize} bytes`,
		);
	}

	console.log();
	p.log.message(color.bold("Ignore Patterns:"));
	for (const pattern of config.ignore || []) {
		p.log.message(`  ${pattern}`);
	}

	if (config.folders && config.folders.length > 0) {
		console.log();
		p.log.message(color.bold("Configured Folders:"));
		for (const folder of config.folders) {
			p.log.message(`  Sources: ${folder.sources.join(", ")}`);
			p.log.message(`  Target: ${folder.target}`);
			p.log.message(`  Watch: ${folder.watch ? "Yes" : "No"}`);
		}
	}

	console.log();
}

/**
 * Reset configuration to defaults
 */
async function resetConfig(
	configPath: string,
	rulesPath: string,
	scope: string,
): Promise<void> {
	const confirm = await p.confirm({
		message: `Reset all ${scope} settings to defaults? This cannot be undone.`,
		initialValue: false,
	});

	if (p.isCancel(confirm) || !confirm) {
		return;
	}

	const defaults = getDefaultConfig();
	writeConfig(configPath, defaults);
	writeRules(rulesPath, getDefaultRules());

	p.log.success("Configuration reset to defaults");
}

/**
 * Save current configuration as a new profile
 */
async function saveAsProfile(config: TidyConfig): Promise<void> {
	// Get profile name
	const name = await p.text({
		message: "Profile name:",
		placeholder: "work",
		validate: (value) => {
			const validation = validateProfileName(value);
			if (!validation.valid) return validation.error;
			if (profileExists(value)) return `Profile "${value}" already exists`;
		},
	});

	if (p.isCancel(name)) return;

	// Get description
	const description = await p.text({
		message: "Description (optional):",
		placeholder: "e.g., Work documents and projects",
	});

	// Create profile from current config
	const profile: Profile = {
		name,
		description: p.isCancel(description) ? undefined : description || undefined,
		...config,
	};

	writeProfile(name, profile);

	p.log.success(`Profile "${name}" created!`);
	p.log.message(color.dim(`Use with: tidyf -p ${name}`));

	// Show existing profiles
	const profiles = listProfiles();
	if (profiles.length > 1) {
		p.log.info(`You now have ${profiles.length} profiles: ${profiles.map((pr) => pr.name).join(", ")}`);
	}
}
