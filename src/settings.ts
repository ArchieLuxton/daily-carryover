import { App, PluginSettingTab, Setting } from 'obsidian';
import type DailyCarryoverPlugin from './main';

export interface DailyCarryoverSettings {
	/** Fill a daily note automatically when it is created empty. */
	autoCarryOver: boolean;
	/** Show a notice naming the source note after an automatic carryover. */
	showNotice: boolean;
}

export const DEFAULT_SETTINGS: DailyCarryoverSettings = {
	autoCarryOver: true,
	showNotice: true,
};

export class DailyCarryoverSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: DailyCarryoverPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const config = this.plugin.dailyNoteConfig();
		const folder = config.folder === '' ? 'the vault root' : `"${config.folder}"`;
		new Setting(containerEl)
			.setName('Daily note location')
			.setDesc(`Taken from the core Daily notes plugin. Notes are in ${folder} and named with the format "${config.format}".`);

		new Setting(containerEl)
			.setName('Carry over automatically')
			.setDesc('When a daily note is created empty, fill it with the most recent earlier daily note.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoCarryOver).onChange(async (value) => {
					this.plugin.settings.autoCarryOver = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Show notice')
			.setDesc('After an automatic carryover, show which note the content came from.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showNotice).onChange(async (value) => {
					this.plugin.settings.showNotice = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
