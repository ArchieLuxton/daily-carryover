import { moment, normalizePath, Notice, Plugin, TFile } from 'obsidian';
import { CarryoverService, type CarryoverOutcome, type NoteStore } from './carryover';
import { DEFAULT_DAILY_NOTE_CONFIG, normaliseFolder, type DailyNoteConfig } from './dailyNotes';
import { DEFAULT_SETTINGS, DailyCarryoverSettingTab, type DailyCarryoverSettings } from './settings';

/** Shape of the core Daily notes plugin's stored options, reached through Obsidian's internal plugin registry. */
interface DailyNotesInternalOptions {
	folder?: string;
	format?: string;
}

interface InternalPluginRegistry {
	plugins?: Record<string, { instance?: { options?: DailyNotesInternalOptions } } | undefined>;
}

export default class DailyCarryoverPlugin extends Plugin {
	settings: DailyCarryoverSettings = { ...DEFAULT_SETTINGS };
	private service!: CarryoverService;
	/** Paths the plugin is creating itself, so the create event does not trigger a second carryover. */
	private readonly creating = new Set<string>();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.service = new CarryoverService(this.vaultStore(), () => this.dailyNoteConfig(), moment);

		this.addSettingTab(new DailyCarryoverSettingTab(this.app, this));
		this.addCommand({
			id: 'carry-over',
			name: 'Carry over from previous daily note',
			callback: () => void this.carryOverManually(),
		});
		this.addCommand({
			id: 'open-previous',
			name: 'Open previous daily note',
			callback: () => void this.openAdjacent('before'),
		});
		this.addCommand({
			id: 'open-next',
			name: 'Open next daily note',
			callback: () => void this.openAdjacent('after'),
		});
		this.addRibbonIcon('calendar-plus', 'Carry over from previous daily note', () => void this.carryOverManually());

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on('create', (file) => {
					if (file instanceof TFile) {
						void this.onFileCreated(file);
					}
				}),
			);
			void this.fillTodayIfEmpty();
		});
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<DailyCarryoverSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...stored };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Folder and filename format from the core Daily notes plugin, falling back to its own defaults. */
	dailyNoteConfig(): DailyNoteConfig {
		const registry = (this.app as unknown as { internalPlugins?: InternalPluginRegistry }).internalPlugins;
		const options = registry?.plugins?.['daily-notes']?.instance?.options ?? {};
		const folder = options.folder?.trim() ?? '';
		const format = options.format?.trim() ?? '';
		return {
			folder: normaliseFolder(folder === '' ? DEFAULT_DAILY_NOTE_CONFIG.folder : folder),
			format: format === '' ? DEFAULT_DAILY_NOTE_CONFIG.format : format,
		};
	}

	private async onFileCreated(file: TFile): Promise<void> {
		if (this.creating.has(file.path)) {
			return;
		}
		if (!this.settings.autoCarryOver || !this.service.isDailyNote(file.path)) {
			return;
		}
		const outcome = await this.service.carryOver(file.path);
		this.reportAutomatic(outcome);
	}

	/** Covers a daily note created during startup, before the create listener was attached. */
	private async fillTodayIfEmpty(): Promise<void> {
		if (!this.settings.autoCarryOver) {
			return;
		}
		const path = this.service.todayPath(moment());
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			return;
		}
		const outcome = await this.service.carryOver(path);
		this.reportAutomatic(outcome);
	}

	private async carryOverManually(): Promise<void> {
		const active = this.app.workspace.getActiveFile();
		const path = active !== null && this.service.isDailyNote(active.path) ? active.path : this.service.todayPath(moment());

		this.creating.add(path);
		try {
			await this.ensureParentFolder(path);
			const created = await this.service.ensureExists(path);
			const outcome = await this.service.carryOver(path);
			this.reportManual(outcome, path);
			if (created || active?.path !== path) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					await this.app.workspace.getLeaf().openFile(file);
				}
			}
		} finally {
			this.creating.delete(path);
		}
	}

	/** Opens the nearest daily note before or after the active file, or relative to today if the active file is not a daily note. */
	private async openAdjacent(direction: 'before' | 'after'): Promise<void> {
		const active = this.app.workspace.getActiveFile();
		const target = this.service.adjacentNote(active?.path ?? null, direction, moment());
		if (target === null) {
			new Notice(direction === 'before' ? 'No earlier daily note.' : 'No later daily note.');
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(target);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
	}

	private async ensureParentFolder(path: string): Promise<void> {
		const parent = path.slice(0, path.lastIndexOf('/'));
		if (parent === '' || this.app.vault.getAbstractFileByPath(parent) !== null) {
			return;
		}
		await this.app.vault.createFolder(parent);
	}

	private reportAutomatic(outcome: CarryoverOutcome): void {
		if (outcome.kind === 'copied' && this.settings.showNotice) {
			new Notice(`Carried over from ${this.displayName(outcome.sourcePath)}`);
		}
	}

	private reportManual(outcome: CarryoverOutcome, targetPath: string): void {
		const target = this.displayName(targetPath);
		switch (outcome.kind) {
			case 'copied':
				new Notice(`Carried over from ${this.displayName(outcome.sourcePath)}`);
				break;
			case 'not-empty':
				new Notice(`${target} already has content. Empty it and run again to carry over.`);
				break;
			case 'no-source':
				new Notice(`No daily note earlier than ${target} to carry over from.`);
				break;
			case 'not-daily-note':
				new Notice(`${target} is not a daily note.`);
				break;
		}
	}

	private displayName(path: string): string {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file.basename : path;
	}

	private vaultStore(): NoteStore {
		const vault = this.app.vault;
		const fileAt = (path: string): TFile => {
			const file = vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				throw new Error(`Not a file: ${path}`);
			}
			return file;
		};
		return {
			listMarkdownPaths: () => vault.getMarkdownFiles().map((file) => file.path),
			exists: (path) => vault.getAbstractFileByPath(path) instanceof TFile,
			read: (path) => vault.read(fileAt(path)),
			process: async (path, fn) => {
				await vault.process(fileAt(path), fn);
			},
			create: async (path, content) => {
				await vault.create(normalizePath(path), content);
			},
		};
	}
}
