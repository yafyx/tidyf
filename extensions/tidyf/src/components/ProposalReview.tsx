import {
	Action,
	ActionPanel,
	Alert,
	Color,
	confirmAlert,
	Icon,
	Keyboard,
	List,
	showToast,
	Toast,
} from "@raycast/api";
import { useMemo, useState } from "react";
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
	onRegenerate?: () => Promise<void>;
	onRegenerateWithModel?: (model: ModelSelection) => Promise<void>;
	availableModels?: ProviderWithModels[];
	currentModel?: ModelSelection;
}

interface ProposalItemProps {
	proposal: FileMoveProposal;
	isSelected: boolean;
	onToggle: () => void;
	onApply: () => void;
	onApplyHighConfidence: () => void;
	onSelectAll: () => void;
	onDeselectAll: () => void;
	onInvertSelection: () => void;
	onSelectByConfidence: (threshold: number) => void;
	onSelectCategory: (category: string) => void;
	onRegenerate?: () => void;
	onRegenerateWithModel?: (model: ModelSelection) => void;
	availableModels?: ProviderWithModels[];
	currentModel?: ModelSelection;
	selectedCount: number;
	totalCount: number;
	highConfidenceCount: number;
	folderTreeMarkdown: string;
	categoryColor: Color;
}

type FilterValue = "all" | "high" | "medium" | "low";

// Deterministic color mapping for categories
const CATEGORY_COLORS: Record<string, Color> = {
	Documents: Color.Blue,
	Images: Color.Green,
	Screenshots: Color.Green,
	Photos: Color.Green,
	Code: Color.Purple,
	Development: Color.Purple,
	Archives: Color.Orange,
	Compressed: Color.Orange,
	Videos: Color.Magenta,
	Audio: Color.Magenta,
	Music: Color.Magenta,
	Downloads: Color.Yellow,
	Installers: Color.Yellow,
	Applications: Color.Yellow,
	Invoices: Color.Blue,
	Receipts: Color.Blue,
	Contracts: Color.Blue,
	Reports: Color.Blue,
	Spreadsheets: Color.SecondaryText,
	Presentations: Color.Red,
	Other: Color.SecondaryText,
	Miscellaneous: Color.SecondaryText,
};

function getCategoryColor(categoryName: string): Color {
	// Check direct match
	if (CATEGORY_COLORS[categoryName]) {
		return CATEGORY_COLORS[categoryName];
	}
	// Check partial match (case-insensitive)
	const lowerName = categoryName.toLowerCase();
	for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
		if (lowerName.includes(key.toLowerCase())) {
			return color;
		}
	}
	// Hash-based fallback for consistent colors
	const colors = [
		Color.Blue,
		Color.Green,
		Color.Purple,
		Color.Orange,
		Color.Magenta,
		Color.Yellow,
		Color.Red,
	];
	const hash = categoryName
		.split("")
		.reduce((acc, char) => acc + char.charCodeAt(0), 0);
	return colors[hash % colors.length];
}

function buildFolderTreeMarkdown(proposals: FileMoveProposal[]): string {
	// Group by destination folder structure
	const folderMap = new Map<string, number>();

	for (const p of proposals) {
		// Extract the folder path (without filename)
		const destParts = p.destination.split("/");
		destParts.pop(); // Remove filename
		const folderPath = destParts.join("/");

		folderMap.set(folderPath, (folderMap.get(folderPath) || 0) + 1);
	}

	// Build tree structure
	const lines: string[] = ["## Proposed Structure\n"];

	// Sort folders for consistent display
	const sortedFolders = Array.from(folderMap.entries()).sort(([a], [b]) =>
		a.localeCompare(b),
	);

	for (const [folder, count] of sortedFolders) {
		// Get just the last part of the path for display
		const parts = folder.split("/");
		const displayName = parts[parts.length - 1] || folder;
		lines.push(
			`- 📁 **${displayName}/** _(${count} file${count > 1 ? "s" : ""})_`,
		);
	}

	return lines.join("\n");
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

	// Selection state - defaults to all selected
	const [selectedProposals, setSelectedProposals] = useState<Set<string>>(
		new Set(proposals.map((p) => p.file.path)),
	);

	// Filter state - separate from selection
	const [filterValue, setFilterValue] = useState<FilterValue>("all");

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

	const selectCategory = (categoryName: string) => {
		const filtered = proposals
			.filter((p) => p.category.name === categoryName)
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

	// Smart Accept: Apply high confidence only
	const handleApplyHighConfidence = async () => {
		const highConfidence = proposals.filter((p) => p.category.confidence > 0.8);

		if (highConfidence.length === 0) {
			await showToast({
				style: Toast.Style.Failure,
				title: "No high-confidence files",
				message: "No files have confidence > 80%.",
			});
			return;
		}

		const confirmed = await confirmAlert({
			title: "Apply High-Confidence Changes?",
			message: `This will move ${highConfidence.length} file${highConfidence.length > 1 ? "s" : ""} with >80% confidence. Lower confidence files will be skipped.`,
			primaryAction: {
				title: `Apply ${highConfidence.length} Files`,
				style: Alert.ActionStyle.Default,
			},
			dismissAction: {
				title: "Cancel",
			},
		});

		if (confirmed) {
			await onApply(highConfidence);
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

	// Filter proposals based on dropdown
	const filteredProposals = useMemo(() => {
		switch (filterValue) {
			case "high":
				return proposals.filter((p) => p.category.confidence > 0.8);
			case "medium":
				return proposals.filter((p) => p.category.confidence >= 0.5);
			case "low":
				return proposals.filter((p) => p.category.confidence < 0.5);
			default:
				return proposals;
		}
	}, [proposals, filterValue]);

	// Group filtered proposals by category
	const filteredByCategory = useMemo(() => {
		const grouped = new Map<string, FileMoveProposal[]>();

		for (const p of filteredProposals) {
			const key = p.category.name;
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)!.push(p);
		}

		return Array.from(grouped.entries()).sort(
			(a, b) => b[1].length - a[1].length,
		);
	}, [filteredProposals]);

	// Stats
	const highConfidenceCount = proposals.filter(
		(p) => p.category.confidence > 0.8,
	).length;
	const folderTreeMarkdown = buildFolderTreeMarkdown(proposals);

	// Handle filter change - only changes view, not selection
	const handleFilterChange = (value: string) => {
		setFilterValue(value as FilterValue);
	};

	// Empty state
	if (proposals.length === 0) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.CheckCircle}
					title="Folder Already Tidy"
					description="No files need organization. AI found nothing to move."
				/>
			</List>
		);
	}

	return (
		<List
			isLoading={isLoading}
			isShowingDetail
			searchBarAccessory={
				<List.Dropdown
					tooltip="Filter by confidence"
					onChange={handleFilterChange}
				>
					<List.Dropdown.Item title="All Files" value="all" />
					<List.Dropdown.Item title="High Confidence (>80%)" value="high" />
					<List.Dropdown.Item title="Medium+ (≥50%)" value="medium" />
					<List.Dropdown.Item title="Needs Review (<50%)" value="low" />
				</List.Dropdown>
			}
		>
			{filteredByCategory.map(([categoryName, categoryProposals]) => {
				const avgConfidence =
					categoryProposals.reduce((sum, p) => sum + p.category.confidence, 0) /
					categoryProposals.length;
				const confidenceLabel =
					avgConfidence > 0.8 ? "✓" : avgConfidence >= 0.5 ? "?" : "⚠";

				return (
					<List.Section
						key={categoryName}
						title={`${categoryName} ${confidenceLabel}`}
						subtitle={`${categoryProposals.length} file${categoryProposals.length > 1 ? "s" : ""} • avg ${Math.round(avgConfidence * 100)}%`}
					>
						{categoryProposals.map((p) => (
							<ProposalItem
								key={p.file.path}
								proposal={p}
								isSelected={selectedProposals.has(p.file.path)}
								onToggle={() => toggleSelection(p.file.path)}
								onApply={handleApply}
								onApplyHighConfidence={handleApplyHighConfidence}
								onSelectAll={selectAll}
								onDeselectAll={deselectAll}
								onInvertSelection={invertSelection}
								onSelectByConfidence={selectByConfidence}
								onSelectCategory={selectCategory}
								onRegenerate={onRegenerate ? handleRegenerate : undefined}
								onRegenerateWithModel={
									onRegenerateWithModel ? handleRegenerateWithModel : undefined
								}
								availableModels={availableModels}
								currentModel={currentModel}
								selectedCount={selectedProposals.size}
								totalCount={proposals.length}
								highConfidenceCount={highConfidenceCount}
								folderTreeMarkdown={folderTreeMarkdown}
								categoryColor={getCategoryColor(categoryName)}
							/>
						))}
					</List.Section>
				);
			})}
		</List>
	);
}

function ProposalItem({
	proposal,
	isSelected,
	onToggle,
	onApply,
	onApplyHighConfidence,
	onSelectAll,
	onDeselectAll,
	onInvertSelection,
	onSelectByConfidence,
	onSelectCategory,
	onRegenerate,
	onRegenerateWithModel,
	availableModels,
	currentModel,
	selectedCount,
	totalCount,
	highConfidenceCount,
	folderTreeMarkdown,
	categoryColor,
}: ProposalItemProps) {
	const confidencePercent = Math.round(proposal.category.confidence * 100);
	const isHighConfidence = proposal.category.confidence > 0.8;

	// Build rich detail markdown with folder tree
	const detailMarkdown = `# ${proposal.file.name}

**Category:** ${proposal.category.name}${proposal.category.subcategory ? ` / ${proposal.category.subcategory}` : ""}

**Confidence:** ${confidencePercent}% ${isHighConfidence ? "✓" : ""}

---

**Reasoning:**
${proposal.category.reasoning}

---

${folderTreeMarkdown}

---

**Source:** \`${proposal.file.path}\`
**Destination:** \`${proposal.destination}\``;

	return (
		<List.Item
			title={proposal.file.name}
			subtitle={`→ ${proposal.category.suggestedPath}`}
			icon={isSelected ? Icon.CheckCircle : Icon.Circle}
			quickLook={{ path: proposal.file.path, name: proposal.file.name }}
			accessories={[
				{
					text: `${confidencePercent}%`,
					tooltip: `Confidence: ${confidencePercent}%`,
				},
				{
					tag: {
						value: proposal.category.name,
						color: categoryColor,
					},
				},
			]}
			detail={
				<List.Item.Detail
					markdown={detailMarkdown}
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
							<List.Item.Detail.Metadata.TagList title="Status">
								<List.Item.Detail.Metadata.TagList.Item
									text={isSelected ? "Selected" : "Not Selected"}
									color={isSelected ? Color.Green : Color.SecondaryText}
								/>
								{isHighConfidence && (
									<List.Item.Detail.Metadata.TagList.Item
										text="High Confidence"
										color={Color.Blue}
									/>
								)}
							</List.Item.Detail.Metadata.TagList>
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
					{/* Smart Actions - Most Common */}
					<ActionPanel.Section title="Quick Actions">
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
						{highConfidenceCount > 0 && (
							<Action
								title={`Accept ${highConfidenceCount} High Confidence`}
								icon={Icon.Bolt}
								shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
								onAction={onApplyHighConfidence}
							/>
						)}
					</ActionPanel.Section>

					{/* Bulk Selection */}
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
							title={`Select "${proposal.category.name}" Category`}
							icon={Icon.Tag}
							shortcut={{ modifiers: ["cmd"], key: "g" }}
							onAction={() => onSelectCategory(proposal.category.name)}
						/>
						<Action
							title="Select High Confidence (>80%)"
							icon={Icon.Stars}
							shortcut={{ modifiers: ["cmd"], key: "h" }}
							onAction={() => onSelectByConfidence(0.8)}
						/>
						<Action
							title="Select Medium+ (≥50%)"
							icon={Icon.Star}
							shortcut={{ modifiers: ["cmd"], key: "m" }}
							onAction={() => onSelectByConfidence(0.5)}
						/>
					</ActionPanel.Section>

					{/* Regenerate */}
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

					{/* File Actions */}
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
