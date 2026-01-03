import {
  ActionPanel,
  Action,
  Form,
  useNavigation,
  showToast,
  Toast,
  popToRoot,
  Icon,
} from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import {
  safeScanDirectory,
  safeAnalyzeFiles,
  resolvePath,
  safeGetAvailableModels,
  createOperationHistory,
  recordMove,
  persistHistory,
  type ProviderWithModels,
} from "./utils/core-bridge";
import HistoryCommand from "./history-command";
import SettingsCommand from "./settings-command";
import { ProposalReview } from "./components/ProposalReview";
import { moveFile, type FileMetadata } from "tidyf";

type LocalFileMoveProposal = {
  file: { path: string };
  destination: string;
};

type ModelSelection = {
  provider: string;
  model: string;
};

export default function OrganizeCommand() {
  const { push } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [enableTarget, setEnableTarget] = useState(false);
  const [providers, setProviders] = useState<ProviderWithModels[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");

  // Cache for regenerate functionality
  const cachedFilesRef = useRef<FileMetadata[]>([]);
  const cachedSourceDirRef = useRef<string>("");
  const cachedTargetDirRef = useRef<string>("");
  const currentModelRef = useRef<ModelSelection | null>(null);

  useEffect(() => {
    safeGetAvailableModels().then((loadedProviders) => {
      setProviders(loadedProviders);
      // Only set default if no value is stored (selectedModel is empty)
      // and providers are available
      if (loadedProviders.length > 0 && loadedProviders[0].models.length > 0) {
        setSelectedModel((current) => {
          if (current) return current; // Keep stored value
          const firstProvider = loadedProviders[0];
          const firstModel = firstProvider.models[0];
          return `${firstProvider.id}/${firstModel.id}`;
        });
      }
    });
  }, []);

  /**
   * Analyze files and navigate to review
   */
  const analyzeAndNavigate = async (
    files: FileMetadata[],
    sourceDir: string,
    targetDir: string,
    model: ModelSelection,
  ) => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Analyzing ${files.length} files...`,
    });

    try {
      const proposal = await safeAnalyzeFiles({
        files,
        targetDir,
        model,
      });

      toast.style = Toast.Style.Success;
      toast.title = "Analysis Complete";

      // Navigate to Review with regenerate callbacks
      push(
        <ProposalReview
          proposal={proposal}
          isLoading={false}
          availableModels={providers}
          currentModel={model}
          onRegenerate={async () => {
            // Regenerate with same model
            await handleRegenerate(model);
          }}
          onRegenerateWithModel={async (newModel: ModelSelection) => {
            // Regenerate with different model
            await handleRegenerate(newModel);
          }}
          onApply={async (selectedProposals: LocalFileMoveProposal[]) => {
            await handleApply(selectedProposals, sourceDir, targetDir);
          }}
        />,
      );
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Analysis Failed";
      toast.message = String(error);
      throw error;
    }
  };

  /**
   * Handle regenerate with a specific model
   */
  const handleRegenerate = async (model: ModelSelection) => {
    if (cachedFilesRef.current.length === 0 || !cachedSourceDirRef.current) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Cannot Regenerate",
        message: "No cached files available.",
      });
      return;
    }

    currentModelRef.current = model;

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Regenerating with ${model.model}...`,
    });

    try {
      const proposal = await safeAnalyzeFiles({
        files: cachedFilesRef.current,
        targetDir: cachedTargetDirRef.current,
        model,
      });

      toast.style = Toast.Style.Success;
      toast.title = "Analysis Complete";

      // Navigate to new review (replaces current)
      push(
        <ProposalReview
          proposal={proposal}
          isLoading={false}
          availableModels={providers}
          currentModel={model}
          onRegenerate={async () => {
            await handleRegenerate(model);
          }}
          onRegenerateWithModel={async (newModel: ModelSelection) => {
            await handleRegenerate(newModel);
          }}
          onApply={async (selectedProposals: LocalFileMoveProposal[]) => {
            await handleApply(
              selectedProposals,
              cachedSourceDirRef.current,
              cachedTargetDirRef.current,
            );
          }}
        />,
      );
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Regeneration Failed";
      toast.message = String(error);
    }
  };

  /**
   * Handle applying file moves with history tracking
   */
  const handleApply = async (
    selectedProposals: LocalFileMoveProposal[],
    sourceDir: string,
    targetDir: string,
  ) => {
    const applyToast = await showToast({
      style: Toast.Style.Animated,
      title: "Moving files...",
    });

    // Create history entry for this operation
    const historyEntry = createOperationHistory(sourceDir, targetDir);

    let movedCount = 0;
    let failedCount = 0;

    for (const p of selectedProposals) {
      try {
        await moveFile(p.file.path, p.destination);
        // Record successful move in history
        recordMove(historyEntry, p.file.path, p.destination);
        movedCount++;
      } catch (e) {
        console.error(`Failed to move ${p.file.path}`, e);
        failedCount++;
      }
    }

    // Only persist history if at least one move succeeded
    if (movedCount > 0) {
      persistHistory(historyEntry);
    }

    if (failedCount > 0) {
      applyToast.style = Toast.Style.Failure;
      applyToast.title = "Partial Success";
      applyToast.message = `Moved ${movedCount} files. ${failedCount} failed.`;
    } else {
      applyToast.style = Toast.Style.Success;
      applyToast.title = "Organization Complete";
      applyToast.message = `Moved ${movedCount} files. Use History to undo.`;
      // Pop back to root after successful organization
      await popToRoot();
    }
  };

  const handleSubmit = async (values: {
    path: string;
    enableTarget: boolean;
    targetPath?: string;
    model: string;
  }) => {
    setIsLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Scanning files...",
    });

    // Validate model is selected
    if (!values.model || !values.model.includes("/")) {
      toast.style = Toast.Style.Failure;
      toast.title = "No model selected";
      toast.message = "Please select an AI model.";
      setIsLoading(false);
      return;
    }

    try {
      const sourcePath = resolvePath(values.path[0] || "~/Downloads");

      // Determine target path
      // If enabled and selected, use it. Otherwise default to source.
      const targetPath =
        values.enableTarget && values.targetPath?.[0]
          ? resolvePath(values.targetPath[0])
          : sourcePath;

      // Parse provider/model from the combined value
      const [providerId, ...modelParts] = values.model.split("/");
      const modelId = modelParts.join("/"); // Handle models with / in name
      const model = { provider: providerId, model: modelId };

      // 1. Scan
      const files = await safeScanDirectory(sourcePath, { recursive: false });
      if (files.length === 0) {
        toast.style = Toast.Style.Failure;
        toast.title = "No files found";
        toast.message = "The selected directory is empty.";
        setIsLoading(false);
        return;
      }

      // Cache for regenerate
      cachedFilesRef.current = files;
      cachedSourceDirRef.current = sourcePath;
      cachedTargetDirRef.current = targetPath;
      currentModelRef.current = model;

      toast.hide();

      // 2. Analyze and navigate
      await analyzeAndNavigate(files, sourcePath, targetPath, model);
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
          <ActionPanel.Section title="Navigation">
            <Action.Push
              title="View History"
              target={<HistoryCommand />}
              icon={Icon.Clock}
              shortcut={{ modifiers: ["cmd"], key: "h" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="Configuration">
            <Action.Push
              title="Edit Config"
              target={<SettingsCommand />}
              icon={Icon.Gear}
              shortcut={{ modifiers: ["cmd"], key: "e" }}
            />
          </ActionPanel.Section>
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
      <Form.Checkbox
        id="enableTarget"
        label="Move to separate folder"
        value={enableTarget}
        onChange={setEnableTarget}
      />
      {enableTarget && (
        <Form.FilePicker
          id="targetPath"
          title="Target Folder"
          info="Where the organized folders will be created. Defaults to the source directory."
          allowMultipleSelection={false}
          canChooseDirectories
          canChooseFiles={false}
        />
      )}
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
              />
            ))}
          </Form.Dropdown.Section>
        ))}
      </Form.Dropdown>
      <Form.Description text="Tidyf will scan the folder and propose an organization structure based on your rules." />
    </Form>
  );
}
