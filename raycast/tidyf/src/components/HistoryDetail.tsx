import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  Keyboard,
  List,
} from "@raycast/api";
import type { HistoryEntry } from "../utils/core-bridge";

interface HistoryMove {
  source: string;
  destination: string;
  timestamp: string;
}

interface HistoryDetailProps {
  entry: HistoryEntry;
  onUndo: () => void;
  onUndoSingle: (move: HistoryMove) => Promise<void>;
}

/**
 * Get file name from path
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

/**
 * Get directory from path
 */
function getDirectory(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop();
  return parts.join("/");
}

/**
 * Format timestamp to time string
 */
function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString();
}

export function HistoryDetail({
  entry,
  onUndo,
  onUndoSingle,
}: HistoryDetailProps) {
  const handleUndoSingle = async (move: HistoryMove) => {
    const confirmed = await confirmAlert({
      title: "Undo This Move?",
      message: `Move "${getFileName(move.destination)}" back to original location?`,
      primaryAction: {
        title: "Undo",
        style: Alert.ActionStyle.Default,
      },
    });

    if (confirmed) {
      await onUndoSingle(move);
    }
  };

  return (
    <List navigationTitle={`${entry.moves.length} Files Moved`} isShowingDetail>
      <List.Section
        title={`Operation: ${new Date(entry.timestamp).toLocaleString()}`}
      >
        {entry.moves.map((move, index) => (
          <List.Item
            key={`${move.source}-${index}`}
            title={getFileName(move.source)}
            subtitle={`-> ${getFileName(move.destination)}`}
            icon={Icon.Document}
            accessories={[{ text: formatTime(move.timestamp) }]}
            detail={
              <List.Item.Detail
                markdown={`# ${getFileName(move.source)}\n\n**Original Location:**\n\`${move.source}\`\n\n**Moved To:**\n\`${move.destination}\`\n\n**Moved At:** ${new Date(move.timestamp).toLocaleString()}`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label
                      title="Original Directory"
                      text={getDirectory(move.source)}
                    />
                    <List.Item.Detail.Metadata.Label
                      title="New Directory"
                      text={getDirectory(move.destination)}
                    />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.TagList title="Status">
                      <List.Item.Detail.Metadata.TagList.Item
                        text="Moved"
                        color={Color.Green}
                      />
                    </List.Item.Detail.Metadata.TagList>
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <ActionPanel.Section title="Undo">
                  <Action
                    title="Undo This Move"
                    icon={Icon.Undo}
                    onAction={() => handleUndoSingle(move)}
                  />
                  <Action
                    title="Undo All Moves"
                    icon={Icon.Undo}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "z" }}
                    onAction={onUndo}
                  />
                </ActionPanel.Section>

                <ActionPanel.Section title="File">
                  <Action.ShowInFinder
                    title="Show Current Location"
                    path={move.destination}
                    shortcut={Keyboard.Shortcut.Common.Open}
                  />
                  <Action.ShowInFinder
                    title="Show Original Location"
                    path={getDirectory(move.source)}
                  />
                  <Action.CopyToClipboard
                    title="Copy Original Path"
                    content={move.source}
                    shortcut={Keyboard.Shortcut.Common.CopyPath}
                  />
                  <Action.CopyToClipboard
                    title="Copy Current Path"
                    content={move.destination}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
