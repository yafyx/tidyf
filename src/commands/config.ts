/**
 * Config command - configure AI models, folders, and rules
 */

import * as p from "@clack/prompts";
import color from "picocolors";
import {
  resolveConfig,
  getGlobalConfigPath,
  getLocalConfigPath,
  getGlobalRulesPath,
  getLocalRulesPath,
  readConfig,
  writeConfig,
  readRules,
  writeRules,
  getDefaultConfig,
  getDefaultRules,
  initGlobalConfig,
  expandPath,
} from "../lib/config.ts";
import { getAvailableModels, cleanup } from "../lib/opencode.ts";
import type { ConfigOptions } from "../types/config.ts";
import type { TidyConfig, ModelSelection } from "../types/config.ts";
import { existsSync } from "fs";

/**
 * Main config command
 */
export async function configCommand(options: ConfigOptions): Promise<void> {
  p.intro(color.bgCyan(color.black(" tidy config ")));

  // Initialize global config if needed
  initGlobalConfig();

  // Determine scope
  const scope = options.global ? "global" : "local";
  const configPath = scope === "global" ? getGlobalConfigPath() : getLocalConfigPath();
  const rulesPath = scope === "global" ? getGlobalRulesPath() : getLocalRulesPath();

  p.log.info(`Configuring ${color.bold(scope)} settings`);
  p.log.message(color.dim(`Config: ${configPath}`));

  // Show current config
  const currentConfig = readConfig(configPath);
  const effectiveConfig = resolveConfig();

  // Main menu loop
  let done = false;
  while (!done) {
    const action = await p.select({
      message: "What would you like to configure?",
      options: [
        {
          value: "model",
          label: "AI Model",
          hint: `Current: ${effectiveConfig.organizer?.provider}/${effectiveConfig.organizer?.model}`,
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
          value: "rules",
          label: "Edit Organization Rules",
          hint: "Customize AI prompts",
        },
        {
          value: "view",
          label: "View Current Configuration",
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
      case "target":
        await configureTarget(configPath, currentConfig);
        break;
      case "ignore":
        await configureIgnore(configPath, currentConfig);
        break;
      case "content":
        await configureContent(configPath, currentConfig);
        break;
      case "rules":
        await configureRules(rulesPath);
        break;
      case "view":
        viewConfig(effectiveConfig, scope);
        break;
      case "reset":
        await resetConfig(configPath, rulesPath, scope);
        break;
    }
  }

  p.outro(color.green("Configuration saved!"));
  cleanup();
}

/**
 * Configure AI model
 */
async function configureModel(
  configPath: string,
  config: TidyConfig
): Promise<void> {
  // Try to get available models
  const s = p.spinner();
  s.start("Fetching available models...");

  let modelOptions: { value: string; label: string }[];
  try {
    const models = await getAvailableModels();
    modelOptions = models.models?.map((m: any) => ({
      value: `${m.provider || "opencode"}/${m.id || m.model}`,
      label: m.name || m.id,
    })) || [];
    s.stop("Models loaded");
  } catch {
    s.stop("Using default models");
    modelOptions = [
      { value: "opencode/gpt-5-nano", label: "GPT-5 Nano (Fast)" },
      { value: "opencode/claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { value: "opencode/gpt-4o", label: "GPT-4o" },
    ];
  }

  // Add custom option
  modelOptions.push({ value: "custom", label: "Enter custom model..." });

  const selected = await p.select({
    message: "Select AI model for file analysis:",
    options: modelOptions,
    initialValue: config.organizer
      ? `${config.organizer.provider}/${config.organizer.model}`
      : undefined,
  });

  if (p.isCancel(selected)) {
    return;
  }

  let modelString = selected as string;

  if (modelString === "custom") {
    const customModel = await p.text({
      message: "Enter model (format: provider/model):",
      placeholder: "opencode/gpt-4o",
      validate: (value) => {
        if (!value.includes("/")) {
          return "Model must be in format: provider/model";
        }
      },
    });

    if (p.isCancel(customModel)) {
      return;
    }

    modelString = customModel;
  }

  const [provider, ...modelParts] = modelString.split("/");
  const model = modelParts.join("/");

  config.organizer = { provider, model };
  writeConfig(configPath, config);

  p.log.success(`Model set to ${color.cyan(modelString)}`);
}

/**
 * Configure target directory
 */
async function configureTarget(
  configPath: string,
  config: TidyConfig
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
  config: TidyConfig
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
  config: TidyConfig
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
    `Content reading ${enabled ? color.green("enabled") : color.yellow("disabled")}`
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
      "Edit this markdown file to customize how AI categorizes your files."
    )
  );
  p.log.message(color.dim("You can define categories, special rules, and output format."));

  // Show first few lines as preview
  const preview = (readRules(rulesPath) || "").split("\n").slice(0, 10).join("\n");
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

  p.log.message(`${color.bold("AI Model:")} ${config.organizer?.provider}/${config.organizer?.model}`);
  p.log.message(`${color.bold("Default Target:")} ${config.defaultTarget || "(not set)"}`);
  p.log.message(`${color.bold("Content Reading:")} ${config.readContent ? "Enabled" : "Disabled"}`);

  if (config.readContent) {
    p.log.message(`${color.bold("Max Content Size:")} ${config.maxContentSize} bytes`);
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
  scope: string
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
