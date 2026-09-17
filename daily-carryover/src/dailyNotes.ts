import type moment from 'moment';
import type { Moment } from 'moment';

export type MomentFn = typeof moment;

export interface DailyNoteConfig {
	/** Vault-relative folder holding daily notes. Empty string means the vault root. */
	folder: string;
	/** Moment.js format used for daily note filenames. May contain slashes for nested folders. */
	format: string;
}

export const DEFAULT_DAILY_NOTE_CONFIG: DailyNoteConfig = {
	folder: '',
	format: 'YYYY-MM-DD',
};

/** Strips leading and trailing slashes so that '' always means the vault root. */
export function normaliseFolder(folder: string): string {
	return folder.replace(/^\/+|\/+$/g, '');
}

/** Builds the vault path a daily note for the given date would have. */
export function dailyNotePath(date: Moment, config: DailyNoteConfig): string {
	const folder = normaliseFolder(config.folder);
	const name = `${date.format(config.format)}.md`;
	return folder === '' ? name : `${folder}/${name}`;
}

/**
 * Parses a vault path as a daily note. Returns the note's date, or null if the
 * path is outside the daily note folder or its name does not match the format exactly.
 */
export function dailyNoteDate(path: string, config: DailyNoteConfig, m: MomentFn): Moment | null {
	if (!path.endsWith('.md')) {
		return null;
	}
	const folder = normaliseFolder(config.folder);
	const prefix = folder === '' ? '' : `${folder}/`;
	if (!path.startsWith(prefix)) {
		return null;
	}
	const relative = path.slice(prefix.length, -'.md'.length);
	const date = m(relative, config.format, true);
	return date.isValid() ? date : null;
}

export type Direction = 'before' | 'after';

/**
 * Finds the daily note nearest to the anchor date in the given direction.
 * Notes on the anchor's own day are never candidates, nor is the anchor path itself.
 */
export function findAdjacentDailyNote(
	paths: readonly string[],
	anchor: Moment,
	direction: Direction,
	config: DailyNoteConfig,
	m: MomentFn,
	excludePath: string | null = null,
): string | null {
	let best: { path: string; date: Moment } | null = null;
	for (const path of paths) {
		if (path === excludePath) {
			continue;
		}
		const date = dailyNoteDate(path, config, m);
		if (date === null) {
			continue;
		}
		const onCorrectSide = direction === 'before' ? date.isBefore(anchor, 'day') : date.isAfter(anchor, 'day');
		if (!onCorrectSide) {
			continue;
		}
		const closer = best === null || (direction === 'before' ? date.isAfter(best.date, 'day') : date.isBefore(best.date, 'day'));
		if (closer) {
			best = { path, date };
		}
	}
	return best?.path ?? null;
}

/**
 * Finds the daily note dated most recently before the target note. Notes on the
 * same day as the target, and the target itself, are never candidates.
 */
export function findPreviousDailyNote(
	paths: readonly string[],
	targetPath: string,
	config: DailyNoteConfig,
	m: MomentFn,
): string | null {
	const targetDate = dailyNoteDate(targetPath, config, m);
	if (targetDate === null) {
		return null;
	}
	return findAdjacentDailyNote(paths, targetDate, 'before', config, m, targetPath);
}

/** A note counts as empty when it holds nothing but whitespace. */
export function isEmptyNote(content: string): boolean {
	return content.trim() === '';
}
