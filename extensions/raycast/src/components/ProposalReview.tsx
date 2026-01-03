import {
  List,
  ActionPanel,
  Action,
  Icon,
  Color,
  Keyboard,
  confirmAlert,
  Alert,
  showToast,
  Toast,
} from "@raycast/api";
import { useState, useMemo } from "react";
import type { OrganizationProposal } from "tidyf";
import type { ProviderWithModels } from "../utils/core-bridge";

// Define local interfaces to workaround type mismatch with Raycast
interface FileCategory {
  name: string;
  subcategory?: string;
  suggestedPath: string;
  confidence: number;
  reasoning: string;
}

interface FileMetadata {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: Date;
  createdAt: Date;
  mimeType?: string;
}

interface FileMoveProposal {
  sourcePath: string;
  file: FileMetadata;
  destination: string;
  category: FileCategory;
  conflictExists: boolean;
}

interface ModelSelection {
  provider: string;
  model: string;
}

interface ProposalReviewProps {
  proposal: OrganizationProposal;
  onApply: (proposals: FileMoveProposal[]) => Promise<void>;
  isLoading: boolean;
  // Regenerate functionality
  onRegenerate?: () => Promise<void>;
  onRegenerateWithModel?: (model: ModelSelection) => Promise<void>;
  availableModels?: ProviderWithModels[];
  currentModel?: ModelSelection;
}

// Props for ProposalItem
interface ProposalItemProps {
  proposal: FileMoveProposal;
  isSelected: boolean;
  onToggle: () => void;
  onApply: () => void;
  // Bulk operations
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertSelection: () => void;
  onSelectByConfidence: (threshold: number) => void;
  // Regenerate
  onRegenerate?: () => void;
  onRegenerateWithModel?: (model: ModelSelection) => void;
  availableModels?: ProviderWithModels[];
  currentModel?: ModelSelection;
  // Stats
  selectedCount: number;
  totalCount: number;
}

export function ProposalReview({
  proposal,
  onApply,
  isLoading,
  onRegenerate,
  onRegenerateWithModel,
  availableModels,
  currentModel,
}: ProposalReviewProps) {
  const proposals = (proposal as unknown as { proposals: FileMoveProposal[] })
    .proposals;

  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(
    new Set(proposals.map((p) => p.file.path)),
  );

  // Toggle single selection
  const toggleSelection = (filePath: string) => {
    const newSelection = new Set(selectedProposals);
    if (newSelection.has(filePath)) {
      newSelection.delete(filePath);
    } else {
      newSelection.add(filePath);
    }
    setSelectedProposals(newSelection);
  };

  // Bulk operations
  const selectAll = () => {
    setSelectedProposals(new Set(proposals.map((p) => p.file.path)));
  };

  const deselectAll = () => {
    setSelectedProposals(new Set());
  };

  const invertSelection = () => {
    const inverted = new Set(
      proposals
        .filter((p) => !selectedProposals.has(p.file.path))
        .map((p) => p.file.path),
    );
    setSelectedProposals(inverted);
  };

  const selectByConfidence = (threshold: number) => {
    const filtered = proposals
      .filter((p) => p.category.confidence >= threshold)
      .map((p) => p.file.path);
    setSelectedProposals(new Set(filtered));
  };

  // Apply with confirmation
  const handleApply = async () => {
    const selectedCount = selectedProposals.size;

    if (selectedCount === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No files selected",
        message: "Select at least one file to organize.",
      });
      return;
    }

    const confirmed = await confirmAlert({
      title: "Apply Organization Changes?",
      message: `This will move ${selectedCount} file${selectedCount > 1 ? "s" : ""} to their new locations. This action can be undone from the History command.`,
      primaryAction: {
        title: "Apply Changes",
        style: Alert.ActionStyle.Default,
      },
      dismissAction: {
        title: "Cancel",
      },
    });

    if (confirmed) {
      const toApply = proposals.filter((p) =>
        selectedProposals.has(p.file.path),
      );
      await onApply(toApply);
    }
  };

  // Regenerate handlers
  const handleRegenerate = async () => {
    if (onRegenerate) {
      await onRegenerate();
    }
  };

  const handleRegenerateWithModel = (model: ModelSelection) => {
    if (onRegenerateWithModel) {
      onRegenerateWithModel(model);
    }
  };

  // Group by confidence
  const proposalsByConfidence = useMemo(() => {
    return proposals.reduce(
      (acc, p) => {
        const key = p.category.confidence > 0.8 ? "high" : "low";
        acc[key].push(p);
        return acc;
      },
      { high: [] as FileMoveProposal[], low: [] as FileMoveProposal[] },
    );
  }, [proposals]);

  return (
    <List
      isLoading={isLoading}
      isShowingDetail
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by confidence"
          onChange={(value) => {
            if (value === "all") selectAll();
            else if (value === "high") selectByConfidence(0.8);
            else if (value === "medium") selectByConfidence(0.5);
          }}
        >
          <List.Dropdown.Item title="All Files" value="all" />
          <List.Dropdown.Item title="High Confidence (>80%)" value="high" />
          <List.Dropdown.Item title="Medium+ (>50%)" value="medium" />
        </List.Dropdown>
      }
    >
      <List.Section
        title={`High Confidence (${proposalsByConfidence.high.length})`}
      >
        {proposalsByConfidence.high.map((p) => (
          <ProposalItem
            key={p.file.path}
            proposal={p}
            isSelected={selectedProposals.has(p.file.path)}
            onToggle={() => toggleSelection(p.file.path)}
            onApply={handleApply}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onInvertSelection={invertSelection}
            onSelectByConfidence={selectByConfidence}
            onRegenerate={onRegenerate ? handleRegenerate : undefined}
            onRegenerateWithModel={
              onRegenerateWithModel ? handleRegenerateWithModel : undefined
            }
            availableModels={availableModels}
            currentModel={currentModel}
            selectedCount={selectedProposals.size}
            totalCount={proposals.length}
          />
        ))}
      </List.Section>

      {proposalsByConfidence.low.length > 0 && (
        <List.Section
          title={`Review Needed (${proposalsByConfidence.low.length})`}
        >
          {proposalsByConfidence.low.map((p) => (
            <ProposalItem
              key={p.file.path}
              proposal={p}
              isSelected={selectedProposals.has(p.file.path)}
              onToggle={() => toggleSelection(p.file.path)}
              onApply={handleApply}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onInvertSelection={invertSelection}
              onSelectByConfidence={selectByConfidence}
              onRegenerate={onRegenerate ? handleRegenerate : undefined}
              onRegenerateWithModel={
                onRegenerateWithModel ? handleRegenerateWithModel : undefined
              }
              availableModels={availableModels}
              currentModel={currentModel}
              selectedCount={selectedProposals.size}
              totalCount={proposals.length}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function ProposalItem({
  proposal,
  isSelected,
  onToggle,
  onApply,
  onSelectAll,
  onDeselectAll,
  onInvertSelection,
  onSelectByConfidence,
  onRegenerate,
  onRegenerateWithModel,
  availableModels,
  currentModel,
  selectedCount,
  totalCount,
}: ProposalItemProps) {
  return (
    <List.Item
      title={proposal.file.name}
      subtitle={`-> ${proposal.category.suggestedPath}`}
      icon={isSelected ? Icon.CheckCircle : Icon.Circle}
      quickLook={{ path: proposal.file.path, name: proposal.file.name }}
      accessories={[
        {
          text: `${Math.round(proposal.category.confidence * 100)}%`,
          tooltip: "Confidence Score",
        },
        { tag: { value: proposal.category.name, color: Color.Blue } },
      ]}
      detail={
        <List.Item.Detail
          markdown={`# ${proposal.file.name}\n\n**Category:** ${proposal.category.name}\n\n**Reasoning:**\n${proposal.category.reasoning}\n\n**Source:** \`${proposal.file.path}\`\n**Destination:** \`${proposal.destination}\``}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label
                title="Size"
                text={`${(proposal.file.size / 1024).toFixed(1)} KB`}
              />
              <List.Item.Detail.Metadata.Label
                title="Type"
                text={proposal.file.extension}
              />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label
                title="Selected"
                text={`${selectedCount} of ${totalCount}`}
              />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          {/* Primary Actions Section */}
          <ActionPanel.Section title="Selection">
            <Action
              title={isSelected ? "Deselect" : "Select"}
              icon={isSelected ? Icon.Circle : Icon.CheckCircle}
              onAction={onToggle}
            />
            <Action
              title={`Apply ${selectedCount} Selected`}
              icon={Icon.Check}
              shortcut={{ modifiers: ["cmd"], key: "s" }}
              onAction={onApply}
            />
          </ActionPanel.Section>

          {/* Bulk Selection Section */}
          <ActionPanel.Section title="Bulk Selection">
            <Action
              title="Select All"
              icon={Icon.CheckCircle}
              shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
              onAction={onSelectAll}
            />
            <Action
              title="Deselect All"
              icon={Icon.Circle}
              shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
              onAction={onDeselectAll}
            />
            <Action
              title="Invert Selection"
              icon={Icon.Switch}
              shortcut={{ modifiers: ["cmd"], key: "i" }}
              onAction={onInvertSelection}
            />
            <Action
              title="Select High Confidence (>80%)"
              icon={Icon.Stars}
              shortcut={{ modifiers: ["cmd"], key: "h" }}
              onAction={() => onSelectByConfidence(0.8)}
            />
            <Action
              title="Select Medium+ (>50%)"
              icon={Icon.Star}
              shortcut={{ modifiers: ["cmd"], key: "m" }}
              onAction={() => onSelectByConfidence(0.5)}
            />
          </ActionPanel.Section>

          {/* Regenerate Section */}
          {onRegenerate && (
            <ActionPanel.Section title="Regenerate">
              <Action
                title="Regenerate Analysis"
                icon={Icon.ArrowClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={onRegenerate}
              />
              {onRegenerateWithModel &&
                availableModels &&
                availableModels.length > 0 && (
                  <ActionPanel.Submenu
                    title="Regenerate with Model…"
                    icon={Icon.Switch}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                  >
                    {availableModels.map((provider) => (
                      <ActionPanel.Section
                        key={provider.id}
                        title={provider.name}
                      >
                        {provider.models.map((model) => (
                          <Action
                            key={`${provider.id}/${model.id}`}
                            title={model.name}
                            icon={
                              currentModel?.provider === provider.id &&
                              currentModel?.model === model.id
                                ? Icon.CheckCircle
                                : Icon.Circle
                            }
                            onAction={() =>
                              onRegenerateWithModel({
                                provider: provider.id,
                                model: model.id,
                              })
                            }
                          />
                        ))}
                      </ActionPanel.Section>
                    ))}
                  </ActionPanel.Submenu>
                )}
            </ActionPanel.Section>
          )}

          {/* File Actions Section */}
          <ActionPanel.Section title="File">
            <Action.ShowInFinder
              path={proposal.file.path}
              shortcut={Keyboard.Shortcut.Common.Open}
            />
            <Action.ToggleQuickLook
              shortcut={Keyboard.Shortcut.Common.ToggleQuickLook}
            />
            <Action.CopyToClipboard
              title="Copy Source Path"
              content={proposal.file.path}
              shortcut={Keyboard.Shortcut.Common.CopyPath}
            />
            <Action.CopyToClipboard
              title="Copy Destination Path"
              content={proposal.destination}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            />
            <Action.Open title="Open File" target={proposal.file.path} />
            <Action.OpenWith
              path={proposal.file.path}
              shortcut={Keyboard.Shortcut.Common.OpenWith}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
