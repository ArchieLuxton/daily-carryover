/**
 * Minimal stand-in for the `obsidian` package, which ships only type declarations.
 * The vitest config aliases `obsidian` to this module so `src/main.ts` can be exercised in tests.
 */
import realMoment from 'moment';

export const notices: string[] = [];

export class TFile {
	constructor(public path: string) {}
	get basename(): string {
		const name = this.path.slice(this.path.lastIndexOf('/') + 1);
		return name.replace(/\.md$/, '');
	}
}

export class TFolder {
	constructor(public path: string) {}
}

export interface RegisteredCommand {
	id: string;
	name: string;
	callback: () => void;
}

export class Plugin {
	private data: unknown = null;
	commands: RegisteredCommand[] = [];
	events: unknown[] = [];

	constructor(public app: unknown, public manifest: unknown) {}

	addSettingTab(): void {}

	addRibbonIcon(): void {}

	addCommand(command: RegisteredCommand): void {
		this.commands.push(command);
	}

	registerEvent(ref: unknown): void {
		this.events.push(ref);
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: unknown): Promise<void> {
		this.data = data;
	}
}

export class PluginSettingTab {
	constructor(public app: unknown, public plugin: unknown) {}
}

export class Setting {}

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export const moment = realMoment;

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/');
}
