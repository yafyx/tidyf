/**
 * Interactive model picker for regenerate-with-model flow
 */

import * as p from "@clack/prompts";
import { getAvailableModels } from "../lib/opencode.ts";
import type { ModelSelection } from "../types/config.ts";

/**
 * Interactive model selection using OpenCode providers
 */
export async function pickModel(): Promise<ModelSelection | undefined> {
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
		p.log.warn("Falling back to manual entry.");
	}

	let providerId: string;
	let modelName: string;

	if (providers.length > 0) {
		const providerOptions = providers.map((prov) => ({
			value: prov.id,
			label: prov.name || prov.id,
		}));

		providerOptions.push({
			value: "custom",
			label: "Enter custom provider...",
		});

		const selectedProvider = await p.select({
			message: "Select AI provider:",
			options: providerOptions,
		});

		if (p.isCancel(selectedProvider)) {
			return undefined;
		}

		if (selectedProvider === "custom") {
			const customProv = await p.text({
				message: "Enter provider ID:",
				placeholder: "opencode",
				validate: (value) => {
					if (!value) return "Provider ID is required";
				},
			});
			if (p.isCancel(customProv)) return undefined;
			providerId = customProv;

			const customModel = await p.text({
				message: "Enter model ID:",
				placeholder: "gpt-4o",
				validate: (value) => {
					if (!value) return "Model ID is required";
				},
			});
			if (p.isCancel(customModel)) return undefined;
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
				if (p.isCancel(customModel)) return undefined;
				modelName = customModel;
			} else {
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
					if (p.isCancel(customModel)) return undefined;
					modelName = customModel;
				} else {
					const modelOptions = modelIds.map((model: string) => ({
						value: model,
						label: model,
					}));
					modelOptions.push({
						value: "custom",
						label: "Enter custom model...",
					});

					const selectedModel = await p.select({
						message: "Select model:",
						options: modelOptions,
					});

					if (p.isCancel(selectedModel)) return undefined;

					if (selectedModel === "custom") {
						const customModel = await p.text({
							message: "Enter model ID:",
						});
						if (p.isCancel(customModel)) return undefined;
						modelName = customModel;
					} else {
						modelName = selectedModel as string;
					}
				}
			}
		}
	} else {
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
			return undefined;
		}

		const parts = manualEntry.split("/");
		providerId = parts[0];
		modelName = parts.slice(1).join("/");
	}

	return { provider: providerId, model: modelName };
}
