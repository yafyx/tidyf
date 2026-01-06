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
	useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { HistoryDetail } from "./components/HistoryDetail";
import {
	type HistoryEntry,
	safeDeleteHistoryEntry,
	safeGetRecentHistory,
	undoFileMove,
} from "./utils/core-bridge";

interface HistoryMove {
	source: string;
	destination: string;
	timestamp: string;
}

/**
 * Get relative time string from timestamp
 */
function getRelativeTime(timestamp: string): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return `${diffDays}d ago`;
}

export default function HistoryCommand() {
	const [history, setHistory] = useState<HistoryEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const { push } = useNavigation();

	const loadHistory = () => {
		setIsLoading(true);
		const entries = safeGetRecentHistory(50);
		setHistory(entries);
		setIsLoading(false);
	};

	useEffect(() => {
		loadHistory();
	}, []);

	const handleUndoOperation = async (entry: HistoryEntry) => {
		const confirmed = await confirmAlert({
			title: "Undo Organization?",
			message: `This will move ${entry.moves.length} file${entry.moves.length > 1 ? "s" : ""} back to their original locations.`,
			primaryAction: {
				title: "Undo All",
				style: Alert.ActionStyle.Destructive,
			},
			dismissAction: {
				title: "Cancel",
			},
		});

		if (!confirmed) return;

		const toast = await showToast({
			style: Toast.Style.Animated,
			title: "Undoing changes...",
		});

		let successCount = 0;
		let failCount = 0;

		for (const move of entry.moves) {
			const result = await undoFileMove(move.source, move.destination);
			if (result.success) {
				successCount++;
			} else {
				failCount++;
				console.error(
					`Failed to undo: ${move.destination} -> ${move.source}:`,
					result.error,
				);
			}
		}

		// Delete history entry after undo
		safeDeleteHistoryEntry(entry.id);

		if (failCount > 0) {
			toast.style = Toast.Style.Failure;
			toast.title = "Partial Undo";
			toast.message = `Restored ${successCount} files. ${failCount} failed.`;
		} else {
			toast.style = Toast.Style.Success;
			toast.title = "Undo Complete";
			toast.message = `Restored ${successCount} files to original locations.`;
		}

		loadHistory(); // Refresh list
	};

	const handleDeleteEntry = async (entry: HistoryEntry) => {
		const confirmed = await confirmAlert({
			title: "Delete History Entry?",
			message:
				"This will remove the entry from history. You won't be able to undo this organization.",
			primaryAction: {
				title: "Delete",
				style: Alert.ActionStyle.Destructive,
			},
		});

		if (confirmed) {
			safeDeleteHistoryEntry(entry.id);
			loadHistory();
			await showToast({
				style: Toast.Style.Success,
				title: "Entry Deleted",
			});
		}
	};

	const handleUndoSingle = async (entry: HistoryEntry, move: HistoryMove) => {
		const result = await undoFileMove(move.source, move.destination);
		if (result.success) {
			await showToast({ style: Toast.Style.Success, title: "File Restored" });
			// Remove move from entry and refresh
			entry.moves = entry.moves.filter((m) => m.source !== move.source);
			if (entry.moves.length === 0) {
				safeDeleteHistoryEntry(entry.id);
			}
			loadHistory();
		} else {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed",
				message: result.error,
			});
		}
	};

	return (
		<List isLoading={isLoading} searchBarPlaceholder="Search history...">
			{history.length === 0 && !isLoading ? (
				<List.EmptyView
					icon={Icon.Clock}
					title="No History"
					description="Organization operations will appear here"
				/>
			) : (
				history.map((entry) => (
					<List.Item
						key={entry.id}
						title={`${entry.moves.length} files organized`}
						subtitle={entry.source}
						icon={Icon.Clock}
						accessories={[
							{ text: getRelativeTime(entry.timestamp) },
							{ tag: { value: `${entry.moves.length}`, color: Color.Blue } },
						]}
						actions={
							<ActionPanel>
								<ActionPanel.Section title="Actions">
									<Action
										title="View Details"
										icon={Icon.Eye}
										onAction={() =>
											push(
												<HistoryDetail
													entry={entry}
													onUndo={() => handleUndoOperation(entry)}
													onUndoSingle={(move) => handleUndoSingle(entry, move)}
												/>,
											)
										}
									/>
									<Action
										title="Undo All Changes"
										icon={Icon.Undo}
										style={Action.Style.Destructive}
										shortcut={{ modifiers: ["cmd"], key: "z" }}
										onAction={() => handleUndoOperation(entry)}
									/>
								</ActionPanel.Section>

								<ActionPanel.Section title="Manage">
									<Action
										title="Delete Entry"
										icon={Icon.Trash}
										style={Action.Style.Destructive}
										shortcut={Keyboard.Shortcut.Common.Remove}
										onAction={() => handleDeleteEntry(entry)}
									/>
									<Action
										title="Refresh"
										icon={Icon.ArrowClockwise}
										shortcut={Keyboard.Shortcut.Common.Refresh}
										onAction={loadHistory}
									/>
								</ActionPanel.Section>

								<ActionPanel.Section title="Copy">
									<Action.CopyToClipboard
										title="Copy Source Path"
										content={entry.source}
										shortcut={Keyboard.Shortcut.Common.CopyPath}
									/>
								</ActionPanel.Section>
							</ActionPanel>
						}
					/>
				))
			)}
		</List>
	);
}
