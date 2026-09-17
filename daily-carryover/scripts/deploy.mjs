import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

function vaultPath() {
	const fromArg = process.argv.indexOf('--vault');
	if (fromArg !== -1 && process.argv[fromArg + 1]) {
		return process.argv[fromArg + 1];
	}
	if (process.env.OBSIDIAN_VAULT) {
		return process.env.OBSIDIAN_VAULT;
	}
	const registry = join(homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json');
	if (!existsSync(registry)) {
		throw new Error('No vault given. Pass --vault <path> or set OBSIDIAN_VAULT.');
	}
	const vaults = Object.values(JSON.parse(readFileSync(registry, 'utf8')).vaults ?? {});
	if (vaults.length !== 1) {
		throw new Error(`Found ${vaults.length} vaults in ${registry}. Pass --vault <path> to choose one.`);
	}
	return vaults[0].path;
}

const vault = vaultPath();
if (!existsSync(join(vault, '.obsidian'))) {
	throw new Error(`${vault} does not look like an Obsidian vault (no .obsidian folder).`);
}

const target = join(vault, '.obsidian', 'plugins', manifest.id);
mkdirSync(target, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	if (existsSync(file)) {
		copyFileSync(file, join(target, file));
		console.log(`copied ${file}`);
	}
}
console.log(`Deployed ${manifest.name} ${manifest.version} to ${target}`);
console.log('If the plugin is already enabled, run "Reload app without saving" in Obsidian. Otherwise enable it under Settings, Community plugins.');
