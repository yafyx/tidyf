 import https from "node:https";
 import fs from "node:fs";
 import path from "node:path";
 import os from "node:os";
 import semver from "semver";
 import picocolors from "picocolors";

 const UPDATE_CHECK_INTERVAL = 1000 * 60 * 60 * 24; // 1 day
 const PACKAGE_NAME = "tidyf";

 interface UpdateInfo {
 	latest: string;
 	current: string;
 	lastCheck: number;
 }

 function getConfigPath(): string {
 	const home = os.homedir();
 	const configDir = process.env.XDG_CONFIG_HOME || path.join(home, ".config", "tidyf");
 	if (!fs.existsSync(configDir)) {
 		fs.mkdirSync(configDir, { recursive: true });
 	}
 	return path.join(configDir, "update-check.json");
 }

 async function getLatestVersion(packageName: string): Promise<string> {
 	return new Promise((resolve, reject) => {
 		https
 			.get(
 				`https://registry.npmjs.org/-/package/${packageName}/dist-tags`,
 				{
 					headers: {
 						"User-Agent": "tidyf-cli",
 					},
 				},
 				(res) => {
 					let body = "";
 					res.on("data", (chunk) => (body += chunk));
 					res.on("end", () => {
 						try {
 							const json = JSON.parse(body);
 							resolve(json.latest);
 						} catch (e) {
 							reject(e);
 						}
 					});
 				},
 			)
 			.on("error", reject);
 	});
 }

 export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo | null> {
 	const configPath = getConfigPath();
 	let updateInfo: UpdateInfo | null = null;

 	try {
 		if (fs.existsSync(configPath)) {
 			updateInfo = JSON.parse(fs.readFileSync(configPath, "utf-8"));
 		}
 	} catch (e) {
 		// Ignore error
 	}

 	const now = Date.now();

 	// Return cached result if fresh enough
 	if (
 		updateInfo &&
 		updateInfo.current === currentVersion &&
 		now - updateInfo.lastCheck < UPDATE_CHECK_INTERVAL
 	) {
 		if (semver.gt(updateInfo.latest, currentVersion)) {
 			return updateInfo;
 		}
 		return null;
 	}

 	// Check registry
 	try {
 		const latest = await getLatestVersion(PACKAGE_NAME);
 		const newInfo: UpdateInfo = {
 			latest,
 			current: currentVersion,
 			lastCheck: now,
 		};

 		fs.writeFileSync(configPath, JSON.stringify(newInfo));

 		if (semver.gt(latest, currentVersion)) {
 			return newInfo;
 		}
 	} catch (e) {
 		// Fail silently
 	}

 	return null;
 }

 export function formatUpdateMessage(current: string, latest: string): string {
 	return (
 		`\n${picocolors.yellow("Update available:")} ` +
 		`${picocolors.dim(current)} → ${picocolors.green(latest)}, ` +
 		`run ${picocolors.cyan("td update")}\n`
 	);
 }
