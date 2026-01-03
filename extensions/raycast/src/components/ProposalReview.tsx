import { List, ActionPanel, Action, Icon, Color } from "@raycast/api";
import { useState } from "react";
import type { OrganizationProposal } from "tidyf";

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

interface ProposalReviewProps {
  proposal: OrganizationProposal;
  onApply: (proposals: FileMoveProposal[]) => Promise<void>;
  isLoading: boolean;
}

export function ProposalReview({
  proposal,
  onApply,
  isLoading,
}: ProposalReviewProps) {
  const proposals = (proposal as unknown as { proposals: FileMoveProposal[] })
    .proposals;

  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(
    new Set(proposals.map((p) => p.file.path)),
  );

  const toggleSelection = (filePath: string) => {
    const newSelection = new Set(selectedProposals);
    if (newSelection.has(filePath)) {
      newSelection.delete(filePath);
    } else {
      newSelection.add(filePath);
    }
    setSelectedProposals(newSelection);
  };

  const handleApply = async () => {
    const toApply = proposals.filter((p) => selectedProposals.has(p.file.path));
    await onApply(toApply);
  };

  const proposalsByConfidence = proposals.reduce(
    (acc, p) => {
      const key = p.category.confidence > 0.8 ? "high" : "low";
      acc[key].push(p);
      return acc;
    },
    { high: [] as FileMoveProposal[], low: [] as FileMoveProposal[] },
  );

  return (
    <List isLoading={isLoading} isShowingDetail>
      <List.Section title="High Confidence">
        {proposalsByConfidence.high.map((p) => (
          <ProposalItem
            key={p.file.path}
            proposal={p}
            isSelected={selectedProposals.has(p.file.path)}
            onToggle={() => toggleSelection(p.file.path)}
            onApply={handleApply}
          />
        ))}
      </List.Section>

      {proposalsByConfidence.low.length > 0 && (
        <List.Section title="Review Needed">
          {proposalsByConfidence.low.map((p) => (
            <ProposalItem
              key={p.file.path}
              proposal={p}
              isSelected={selectedProposals.has(p.file.path)}
              onToggle={() => toggleSelection(p.file.path)}
              onApply={handleApply}
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
}: {
  proposal: FileMoveProposal;
  isSelected: boolean;
  onToggle: () => void;
  onApply: () => void;
}) {
  return (
    <List.Item
      title={proposal.file.name}
      subtitle={`→ ${proposal.category.suggestedPath}`}
      icon={isSelected ? Icon.CheckCircle : Icon.Circle}
      accessories={[
        {
          text: `${Math.round(proposal.category.confidence * 100)}%`,
          tooltip: "Confidence Score",
        },
        { tag: { value: proposal.category.reasoning, color: Color.Blue } },
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
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action
            title={isSelected ? "Deselect" : "Select"}
            onAction={onToggle}
            icon={isSelected ? Icon.Circle : Icon.CheckCircle}
          />
          <Action
            title="Apply Selected Changes"
            onAction={onApply}
            icon={Icon.Check}
          />
          <Action.Open title="Open File" target={proposal.file.path} />
        </ActionPanel>
      }
    />
  );
}
