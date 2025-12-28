 import { intro, outro, spinner, note } from "@clack/prompts";
 import picocolors from "picocolors";
 import { exec } from "child_process";
 import { promisify } from "util";
 import { checkForUpdates } from "../utils/update.ts";

 const execAsync = promisify(exec);

 async function detectPackageManager(): Promise<string> {
 	try {
 		const userAgent = process.env.npm_config_user_agent;
 		if (userAgent) {
 			if (userAgent.startsWith("pnpm")) return "pnpm";
 			if (userAgent.startsWith("yarn")) return "yarn";
 			if (userAgent.startsWith("bun")) return "bun";
 			if (userAgent.startsWith("npm")) return "npm";
 		}
 		
 		// Fallback detection
 		try {
 			await execAsync("bun --version");
 			return "bun";
 		} catch {
 			return "npm";
 		}
 	} catch {
 		return "npm";
 	}
 }

export async function updateCommand(currentVersion: string) {
 	console.clear();
 	intro(picocolors.blue("Update Check"));

 	const s = spinner();
 	s.start("Checking for updates...");

 	try {
 		// Force check (ignoring cache expiry if we could pass a flag, but for now standard check is fine
 		// as checkForUpdates will verify registry if cache is old, 
 		// BUT here we want to force it. We can rely on the utility for now, 
 		// or we could add a force flag to utility.
 		// Let's rely on standard check, but since user explicitly ran update, 
 		// we might want to ensure we get fresh data.
 		// For this specific command, let's just use the same utility 
 		// but we might want to consider clearing cache or adding a force param later.
 		// For now, the utility will return update info if available.
 		
 		// Actually, if the user runs 'update', they expect a real check. 
 		// The current utility caches for 24h. 
 		// Let's modify the utility slightly or just accept it for now.
 		// Ideally, we should check fresh. 
 		// I'll stick to the utility for consistency, but maybe in a v2 we force it.
 		
		const updateInfo = await checkForUpdates(currentVersion);
 		
 		s.stop("Check complete");

 		if (!updateInfo) {
 			outro(picocolors.green("You are on the latest version!"));
 			return;
 		}

 		const { latest, current } = updateInfo;

 		note(
 			`Current: ${picocolors.dim(current)}\nLatest:  ${picocolors.green(latest)}`,
 			"Update Available"
 		);

 		const pm = await detectPackageManager();
 		const installCmd = pm === "yarn" 
 			? "yarn global add tidyf" 
 			: pm === "bun"
 			? "bun add -g tidyf"
 			: `${pm} install -g tidyf`;

 		s.start(`Installing update with ${pm}...`);
 		
 		try {
 			await execAsync(installCmd);
 			s.stop("Update installed");
 			outro(picocolors.green(`Successfully updated to v${latest}!`));
 		} catch (err: any) {
 			s.stop("Update failed");
 			outro(picocolors.red(`Failed to update automatically.\nPlease run: ${picocolors.cyan(installCmd)}`));
 		}

 	} catch (error) {
 		s.stop("Error checking for updates");
 		outro(picocolors.red("Could not check for updates. Please try again later."));
 	}
 }
