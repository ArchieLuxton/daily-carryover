import realMoment from 'moment';
import { beforeEach, describe, expect, it } from 'vitest';

import { notices, TFile, TFolder } from './test/obsidianStub';
import DailyCarryoverPlugin from './main';

type CreateHandler = (file: unknown) => void;

class FakeVault {
	readonly files = new Map<string, string>();
	readonly folders = new Set<string>();
	private createHandlers: CreateHandler[] = [];

	seed(path: string, content: string): void {
		this.files.set(path, content);
	}

	on(event: string, handler: CreateHandler): { event: string } {
		if (event === 'create') {
			this.createHandlers.push(handler);
		}
		return { event };
	}

	getMarkdownFiles(): TFile[] {
		return [...this.files.keys()].filter((p) => p.endsWith('.md')).map((p) => new TFile(p));
	}

	getAbstractFileByPath(path: string): TFile | TFolder | null {
		if (this.files.has(path)) {
			return new TFile(path);
		}
		if (this.folders.has(path)) {
			return new TFolder(path);
		}
		return null;
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path) ?? '';
	}

	async process(file: TFile, fn: (current: string) => string): Promise<string> {
		const next = fn(this.files.get(file.path) ?? '');
		this.files.set(file.path, next);
		return next;
	}

	async create(path: string, content: string): Promise<TFile> {
		if (this.files.has(path)) {
			throw new Error(`exists ${path}`);
		}
		this.files.set(path, content);
		const file = new TFile(path);
		for (const handler of this.createHandlers) {
			handler(file);
		}
		return file;
	}

	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}

	/** Simulates Obsidian's own Daily notes plugin creating a note, which fires the create event. */
	async userCreates(path: string, content = ''): Promise<TFile> {
		return this.create(path, content);
	}
}

class FakeWorkspace {
	activeFile: TFile | null = null;
	opened: string[] = [];
	private layoutReadyCallbacks: Array<() => void> = [];

	onLayoutReady(cb: () => void): void {
		this.layoutReadyCallbacks.push(cb);
	}

	fireLayoutReady(): void {
		for (const cb of this.layoutReadyCallbacks) {
			cb();
		}
	}

	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	getLeaf(): { openFile: (file: TFile) => Promise<void> } {
		return {
			openFile: async (file) => {
				this.opened.push(file.path);
			},
		};
	}
}

class FakeApp {
	vault = new FakeVault();
	workspace = new FakeWorkspace();
	internalPlugins: { plugins: Record<string, { instance?: { options?: { folder?: string; format?: string } } }> } = {
		plugins: { 'daily-notes': { instance: { options: {} } } },
	};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let app: FakeApp;
let plugin: DailyCarryoverPlugin;

async function load(): Promise<void> {
	plugin = new DailyCarryoverPlugin(app as never, {} as never);
	await plugin.onload();
}

beforeEach(() => {
	notices.length = 0;
	app = new FakeApp();
	app.vault.seed('2026-09-12.md', '- [ ] carry me\n');
	app.vault.seed('Projects/plan.md', 'not daily\n');
});

describe('automatic carryover', () => {
	it('fills a daily note created after layout is ready', async () => {
		await load();
		app.workspace.fireLayoutReady();
		await flush();
		await app.vault.userCreates('2026-09-15.md');
		await flush();
		expect(app.vault.files.get('2026-09-15.md')).toBe('- [ ] carry me\n');
		expect(notices).toEqual(['Carried over from 2026-09-12']);
	});

	it('ignores files that are not daily notes', async () => {
		await load();
		app.workspace.fireLayoutReady();
		await app.vault.userCreates('Projects/other.md');
		await flush();
		expect(app.vault.files.get('Projects/other.md')).toBe('');
		expect(notices).toEqual([]);
	});

	it('leaves a note created with template content alone', async () => {
		await load();
		app.workspace.fireLayoutReady();
		await app.vault.userCreates('2026-09-15.md', '# Template\n');
		await flush();
		expect(app.vault.files.get('2026-09-15.md')).toBe('# Template\n');
		expect(notices).toEqual([]);
	});

	it('fills an empty note for today that existed before layout was ready', async () => {
		const today = realMoment().format('YYYY-MM-DD');
		app.vault.seed(`${today}.md`, '');
		await load();
		app.workspace.fireLayoutReady();
		await flush();
		expect(app.vault.files.get(`${today}.md`)).toBe('- [ ] carry me\n');
	});

	it('does nothing when the automatic toggle is off', async () => {
		await load();
		plugin.settings.autoCarryOver = false;
		app.workspace.fireLayoutReady();
		await app.vault.userCreates('2026-09-15.md');
		await flush();
		expect(app.vault.files.get('2026-09-15.md')).toBe('');
	});

	it('stays silent when the notice toggle is off', async () => {
		await load();
		plugin.settings.showNotice = false;
		app.workspace.fireLayoutReady();
		await app.vault.userCreates('2026-09-15.md');
		await flush();
		expect(app.vault.files.get('2026-09-15.md')).toBe('- [ ] carry me\n');
		expect(notices).toEqual([]);
	});
});

describe('daily note configuration', () => {
	it('falls back to the vault root and YYYY-MM-DD when the core plugin has no options', async () => {
		await load();
		expect(plugin.dailyNoteConfig()).toEqual({ folder: '', format: 'YYYY-MM-DD' });
	});

	it('reads folder and format from the core Daily notes plugin', async () => {
		app.internalPlugins.plugins['daily-notes'] = { instance: { options: { folder: '/Journal/', format: 'YYYY/MM/YYYY-MM-DD' } } };
		app.vault.seed('Journal/2026/09/2026-09-11.md', 'friday\n');
		await load();
		expect(plugin.dailyNoteConfig()).toEqual({ folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD' });
		app.workspace.fireLayoutReady();
		await app.vault.userCreates('Journal/2026/09/2026-09-14.md');
		await flush();
		expect(app.vault.files.get('Journal/2026/09/2026-09-14.md')).toBe('friday\n');
	});

	it('survives the internal registry being absent', async () => {
		delete (app as { internalPlugins?: unknown }).internalPlugins;
		await load();
		expect(plugin.dailyNoteConfig()).toEqual({ folder: '', format: 'YYYY-MM-DD' });
	});
});

describe('manual command', () => {
	const runCommand = () => {
		const command = (plugin as unknown as { commands: Array<{ id: string; callback: () => void }> }).commands.find(
			(c) => c.id === 'carry-over',
		);
		if (!command) {
			throw new Error('command not registered');
		}
		command.callback();
		return flush();
	};

	it('creates today\'s note, fills it once, and opens it', async () => {
		const today = realMoment().format('YYYY-MM-DD');
		await load();
		app.workspace.fireLayoutReady();
		await runCommand();
		expect(app.vault.files.get(`${today}.md`)).toBe('- [ ] carry me\n');
		expect(notices).toEqual(['Carried over from 2026-09-12']);
		expect(app.workspace.opened).toEqual([`${today}.md`]);
	});

	it('acts on the active daily note instead of today', async () => {
		app.vault.seed('2026-09-15.md', '');
		app.workspace.activeFile = new TFile('2026-09-15.md');
		await load();
		app.workspace.fireLayoutReady();
		await runCommand();
		expect(app.vault.files.get('2026-09-15.md')).toBe('- [ ] carry me\n');
		expect(app.workspace.opened).toEqual([]);
	});

	it('refuses to overwrite a note with content', async () => {
		app.vault.seed('2026-09-15.md', 'mine\n');
		app.workspace.activeFile = new TFile('2026-09-15.md');
		await load();
		await runCommand();
		expect(app.vault.files.get('2026-09-15.md')).toBe('mine\n');
		expect(notices).toEqual(['2026-09-15 already has content. Empty it and run again to carry over.']);
	});

	it('explains when there is nothing earlier to copy', async () => {
		app.vault.files.clear();
		app.vault.seed('2026-09-15.md', '');
		app.workspace.activeFile = new TFile('2026-09-15.md');
		await load();
		await runCommand();
		expect(notices).toEqual(['No daily note earlier than 2026-09-15 to carry over from.']);
	});

	it('creates missing parent folders for nested formats', async () => {
		app.internalPlugins.plugins['daily-notes'] = { instance: { options: { folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD' } } };
		const today = realMoment();
		const path = `Journal/${today.format('YYYY/MM/YYYY-MM-DD')}.md`;
		app.vault.seed('Journal/2020/01/2020-01-01.md', 'ancient\n');
		await load();
		app.workspace.fireLayoutReady();
		await runCommand();
		expect(app.vault.folders.has(`Journal/${today.format('YYYY/MM')}`)).toBe(true);
		expect(app.vault.files.get(path)).toBe('ancient\n');
	});
});

describe('navigation commands', () => {
	const run = (id: string) => {
		const command = (plugin as unknown as { commands: Array<{ id: string; callback: () => void }> }).commands.find((c) => c.id === id);
		if (!command) {
			throw new Error(`${id} not registered`);
		}
		command.callback();
		return flush();
	};

	it('opens the previous and next daily notes relative to the active one', async () => {
		app.vault.seed('2026-09-10.md', 'a\n');
		app.vault.seed('2026-09-15.md', 'c\n');
		app.workspace.activeFile = new TFile('2026-09-12.md');
		await load();
		await run('open-previous');
		await run('open-next');
		expect(app.workspace.opened).toEqual(['2026-09-10.md', '2026-09-15.md']);
	});

	it('reports when there is nothing to open', async () => {
		app.workspace.activeFile = new TFile('2026-09-12.md');
		await load();
		await run('open-previous');
		await run('open-next');
		expect(app.workspace.opened).toEqual([]);
		expect(notices).toEqual(['No earlier daily note.', 'No later daily note.']);
	});

	it('falls back to the most recent daily note when the active file is not one', async () => {
		app.workspace.activeFile = new TFile('Projects/plan.md');
		await load();
		await run('open-previous');
		expect(app.workspace.opened).toEqual(['2026-09-12.md']);
	});
});
