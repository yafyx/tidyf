import { showToast, Toast } from "@raycast/api";
import {
  safeScanDirectory,
  safeAnalyzeFiles,
  resolvePath,
  safeGetAvailableModels,
} from "./utils/core-bridge";
import { moveFile } from "tidyf";

type Proposal = {
  proposals: Array<{
    file: { path: string };
    destination: string;
    category: { confidence: number };
  }>;
};

export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Tidying Downloads...",
  });

  try {
    const downloadsPath = resolvePath("~/Downloads");

    // 1. Scan
    const files = await safeScanDirectory(downloadsPath, { recursive: false });

    if (files.length === 0) {
      toast.style = Toast.Style.Success;
      toast.title = "Already Tidy";
      toast.message = "Downloads folder is empty.";
      return;
    }

    // 2. Analyze (use first available model, fallback to opencode/claude-sonnet-4-5)
    const providers = await safeGetAvailableModels();
    let modelToUse = { provider: "opencode", model: "claude-sonnet-4-5" };

    if (providers.length > 0 && providers[0].models.length > 0) {
      modelToUse = { provider: providers[0].id, model: providers[0].models[0].id };
    }

    const proposal = (await safeAnalyzeFiles({
      files,
      targetDir: downloadsPath,
      model: modelToUse,
    })) as unknown as Proposal;

    // 3. Apply High Confidence (>80%)
    const highConfidence = proposal.proposals.filter(
      (p) => p.category.confidence > 0.8,
    );

    if (highConfidence.length === 0) {
      toast.style = Toast.Style.Failure;
      toast.title = "No Safe Moves";
      toast.message = "AI wasn't confident enough to move files automatically.";
      return;
    }

    let movedCount = 0;
    for (const p of highConfidence) {
      try {
        await moveFile(p.file.path, p.destination);
        movedCount++;
      } catch (e) {
        console.error(e);
      }
    }

    toast.style = Toast.Style.Success;
    toast.title = "Tidy Complete";
    toast.message = `Moved ${movedCount} files to organized folders.`;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed";
    toast.message = String(error);
  }
}
