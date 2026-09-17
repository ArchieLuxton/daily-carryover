import type { Moment } from 'moment';
import {
	dailyNoteDate,
	dailyNotePath,
	findAdjacentDailyNote,
	findPreviousDailyNote,
	isEmptyNote,
	type DailyNoteConfig,
	type Direction,
	type MomentFn,
} from './dailyNotes';

/** The subset of vault operations the carryover logic needs, so it can run against a fake in tests. */
export interface NoteStore {
	listMarkdownPaths(): string[];
	exists(path: string): boolean;
	read(path: string): Promise<string>;
	/** Atomically replaces a note's content with whatever the callback returns for the current content. */
	process(path: string, fn: (current: string) => string): Promise<void>;
	create(path: string, content: string): Promise<void>;
}

export type CarryoverOutcome =
	| { kind: 'copied'; sourcePath: string }
	| { kind: 'not-daily-note' }
	| { kind: 'no-source' }
	| { kind: 'not-empty' };

export class CarryoverService {
	constructor(
		private readonly store: NoteStore,
		private readonly config: () => DailyNoteConfig,
		private readonly m: MomentFn,
	) {}

	isDailyNote(path: string): boolean {
		return dailyNoteDate(path, this.config(), this.m) !== null;
	}

	todayPath(now: Moment): string {
		return dailyNotePath(now, this.config());
	}

	/**
	 * Finds the nearest daily note before or after the given file. When the file is not
	 * itself a daily note the search runs from today and includes today's note.
	 */
	adjacentNote(fromPath: string | null, direction: Direction, now: Moment): string | null {
		const config = this.config();
		const fromDate = fromPath === null ? null : dailyNoteDate(fromPath, config, this.m);
		const anchor = fromDate ?? (direction === 'before' ? now.clone().add(1, 'day') : now.clone().subtract(1, 'day'));
		return findAdjacentDailyNote(this.store.listMarkdownPaths(), anchor, direction, config, this.m, fromDate === null ? null : fromPath);
	}

	/** Creates the note for the given path if it does not exist. Returns true if it was created. */
	async ensureExists(path: string): Promise<boolean> {
		if (this.store.exists(path)) {
			return false;
		}
		await this.store.create(path, '');
		return true;
	}

	/**
	 * Fills the target note with the content of the most recent earlier daily note.
	 * The write only happens if the target is still empty at the moment of writing.
	 */
	async carryOver(targetPath: string): Promise<CarryoverOutcome> {
		const config = this.config();
		if (dailyNoteDate(targetPath, config, this.m) === null) {
			return { kind: 'not-daily-note' };
		}
		const sourcePath = findPreviousDailyNote(this.store.listMarkdownPaths(), targetPath, config, this.m);
		if (sourcePath === null) {
			return { kind: 'no-source' };
		}
		const content = await this.store.read(sourcePath);
		let written = false;
		await this.store.process(targetPath, (current) => {
			if (!isEmptyNote(current)) {
				return current;
			}
			written = true;
			return content;
		});
		return written ? { kind: 'copied', sourcePath } : { kind: 'not-empty' };
	}
}
