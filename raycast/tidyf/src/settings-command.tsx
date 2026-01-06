import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import {
  type ProviderWithModels,
  safeGetAvailableModels,
  safeGetConfig,
  safeSaveConfig,
} from "./utils/core-bridge";

export default function SettingsCommand() {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderWithModels[]>([]);

  // Config state
  const [source, setSource] = useState("~/Downloads");
  const [target, setTarget] = useState("~/Documents/Organized");
  const [model, setModel] = useState("");
  const [readContent, setReadContent] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Load available models
        const loadedProviders = await safeGetAvailableModels();
        setProviders(loadedProviders);

        // Load current config
        const config = safeGetConfig();

        if (config.defaultSource) setSource(config.defaultSource);
        if (config.defaultTarget) setTarget(config.defaultTarget);
        if (config.readContent) setReadContent(config.readContent);

        if (config.organizer?.provider && config.organizer?.model) {
          setModel(`${config.organizer.provider}/${config.organizer.model}`);
        } else if (
          loadedProviders.length > 0 &&
          loadedProviders[0].models.length > 0
        ) {
          // Default to first available if not set
          const p = loadedProviders[0];
          setModel(`${p.id}/${p.models[0].id}`);
        }
      } catch (e) {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to load settings",
        });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit() {
    try {
      setIsLoading(true);

      const [providerId, ...modelParts] = model.split("/");
      const modelId = modelParts.join("/");

      const newConfig = {
        defaultSource: source,
        defaultTarget: target,
        readContent,
        organizer: {
          provider: providerId,
          model: modelId,
        },
      };

      safeSaveConfig(newConfig);

      await showToast({ style: Toast.Style.Success, title: "Settings Saved" });
      pop();
    } catch (e) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to save settings",
        message: String(e),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Settings"
            onSubmit={handleSubmit}
            icon={Icon.Check}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Configure global defaults for tidyf." />

      <Form.Separator />

      <Form.Dropdown
        id="model"
        title="Default AI Model"
        value={model}
        onChange={setModel}
      >
        {providers.map((provider) => (
          <Form.Dropdown.Section key={provider.id} title={provider.name}>
            {provider.models.map((m) => (
              <Form.Dropdown.Item
                key={`${provider.id}/${m.id}`}
                value={`${provider.id}/${m.id}`}
                title={m.name}
              />
            ))}
          </Form.Dropdown.Section>
        ))}
      </Form.Dropdown>

      <Form.Separator />

      <Form.TextField
        id="source"
        title="Default Source"
        value={source}
        onChange={setSource}
        placeholder="~/Downloads"
        info="Directory to organize by default"
      />

      <Form.TextField
        id="target"
        title="Default Target"
        value={target}
        onChange={setTarget}
        placeholder="~/Documents/Organized"
        info="Where organized files will be moved"
      />

      <Form.Separator />

      <Form.Checkbox
        id="readContent"
        label="Enable content reading"
        value={readContent}
        onChange={setReadContent}
        info="Reads text files to help AI categorize better"
      />
    </Form>
  );
}
