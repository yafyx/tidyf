import {
  ActionPanel,
  Action,
  Form,
  useNavigation,
  showToast,
  Toast,
} from "@raycast/api";
import { useState, useEffect } from "react";
import {
  safeScanDirectory,
  safeAnalyzeFiles,
  resolvePath,
  safeGetAvailableModels,
  getProviderIcon,
  type ProviderWithModels,
} from "./utils/core-bridge";
import { ProposalReview } from "./components/ProposalReview";
import { moveFile } from "tidyf";

type LocalFileMoveProposal = {
  file: { path: string };
  destination: string;
};

export default function OrganizeCommand() {
  const { push } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderWithModels[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");

  useEffect(() => {
    safeGetAvailableModels().then((loadedProviders) => {
      setProviders(loadedProviders);
      // Set first available model as default (format: provider/model)
      if (loadedProviders.length > 0 && loadedProviders[0].models.length > 0 && !selectedModel) {
        const firstProvider = loadedProviders[0];
        const firstModel = firstProvider.models[0];
        setSelectedModel(`${firstProvider.id}/${firstModel.id}`);
      }
    });
  }, []);

  const handleSubmit = async (values: { path: string; model: string }) => {
    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Scanning files...",
    });

    try {
      const resolvedPath = resolvePath(values.path[0] || "~/Downloads");

      // Parse provider/model from the combined value
      const [providerId, ...modelParts] = values.model.split("/");
      const modelId = modelParts.join("/"); // Handle models with / in name

      // 1. Scan
      const files = await safeScanDirectory(resolvedPath, { recursive: false });
      if (files.length === 0) {
        toast.style = Toast.Style.Failure;
        toast.title = "No files found";
        toast.message = "The selected directory is empty.";
        setIsLoading(false);
        return;
      }

      // 2. Analyze
      toast.title = `Analyzing ${files.length} files...`;
      const proposal = await safeAnalyzeFiles({
        files,
        targetDir: resolvedPath,
        model: { provider: providerId, model: modelId },
      });

      toast.style = Toast.Style.Success;
      toast.title = "Analysis Complete";

      // 3. Navigate to Review
      push(
        <ProposalReview
          proposal={proposal}
          isLoading={false}
          onApply={async (selectedProposals: LocalFileMoveProposal[]) => {
            const applyToast = await showToast({
              style: Toast.Style.Animated,
              title: "Moving files...",
            });
            let movedCount = 0;

            for (const p of selectedProposals) {
              try {
                await moveFile(p.file.path, p.destination);
                movedCount++;
              } catch (e) {
                console.error(`Failed to move ${p.file.path}`, e);
              }
            }

            applyToast.style = Toast.Style.Success;
            applyToast.title = "Organization Complete";
            applyToast.message = `Moved ${movedCount} files.`;
          }}
        />,
      );
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed";
      toast.message = String(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Scan & Organize" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="path"
        title="Folder to Organize"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
        defaultValue={["~/Downloads"]}
      />
      <Form.Dropdown
        id="model"
        title="AI Model"
        value={selectedModel}
        onChange={setSelectedModel}
        isLoading={providers.length === 0}
        storeValue={true}
      >
        {providers.map((provider) => (
          <Form.Dropdown.Section key={provider.id} title={provider.name}>
            {provider.models.map((model) => (
              <Form.Dropdown.Item
                key={`${provider.id}/${model.id}`}
                value={`${provider.id}/${model.id}`}
                title={model.name}
                icon={getProviderIcon(provider.id)}
              />
            ))}
          </Form.Dropdown.Section>
        ))}
      </Form.Dropdown>
      <Form.Description text="Tidyf will scan the folder and propose an organization structure based on your rules." />
    </Form>
  );
}
