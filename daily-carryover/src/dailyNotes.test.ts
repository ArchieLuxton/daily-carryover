import moment from 'moment';
import { describe, expect, it } from 'vitest';
import {
	dailyNoteDate,
	dailyNotePath,
	findAdjacentDailyNote,
	findPreviousDailyNote,
	isEmptyNote,
	normaliseFolder,
	type DailyNoteConfig,
} from './dailyNotes';

const root: DailyNoteConfig = { folder: '', format: 'YYYY-MM-DD' };
const nested: DailyNoteConfig = { folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD' };

describe('normaliseFolder', () => {
	it('strips surrounding slashes', () => {
		expect(normaliseFolder('/Daily/')).toBe('Daily');
		expect(normaliseFolder('Daily')).toBe('Daily');
		expect(normaliseFolder('/')).toBe('');
		expect(normaliseFolder('')).toBe('');
	});
});

describe('dailyNotePath', () => {
	it('places notes at the vault root when no folder is set', () => {
		expect(dailyNotePath(moment('2026-09-17'), root)).toBe('2026-09-17.md');
	});

	it('expands nested formats under the folder', () => {
		expect(dailyNotePath(moment('2026-09-17'), nested)).toBe('Journal/2026/09/2026-09-17.md');
	});
});

describe('dailyNoteDate', () => {
	it('parses a root daily note', () => {
		expect(dailyNoteDate('2026-09-17.md', root, moment)?.format('YYYY-MM-DD')).toBe('2026-09-17');
	});

	it('parses a nested daily note', () => {
		expect(dailyNoteDate('Journal/2026/09/2026-09-17.md', nested, moment)?.format('YYYY-MM-DD')).toBe('2026-09-17');
	});

	it('rejects notes outside the folder', () => {
		expect(dailyNoteDate('Other/2026/09/2026-09-17.md', nested, moment)).toBeNull();
		expect(dailyNoteDate('Daily/2026-09-17.md', root, moment)).toBeNull();
	});

	it('rejects names that do not match the format exactly', () => {
		expect(dailyNoteDate('2026-09-17 meeting.md', root, moment)).toBeNull();
		expect(dailyNoteDate('2026-9-7.md', root, moment)).toBeNull();
		expect(dailyNoteDate('notes.md', root, moment)).toBeNull();
		expect(dailyNoteDate('2026-13-40.md', root, moment)).toBeNull();
	});

	it('rejects non-markdown files', () => {
		expect(dailyNoteDate('2026-09-17.canvas', root, moment)).toBeNull();
		expect(dailyNoteDate('2026-09-17.md.bak', root, moment)).toBeNull();
	});
});

describe('findPreviousDailyNote', () => {
	it('picks the latest note before the target, skipping gaps', () => {
		const paths = ['2026-09-10.md', '2026-09-12.md', '2026-09-11.md', '2026-09-15.md'];
		expect(findPreviousDailyNote(paths, '2026-09-15.md', root, moment)).toBe('2026-09-12.md');
	});

	it('ignores notes dated after the target', () => {
		const paths = ['2026-09-10.md', '2026-09-20.md'];
		expect(findPreviousDailyNote(paths, '2026-09-15.md', root, moment)).toBe('2026-09-10.md');
	});

	it('ignores the target itself and non-daily notes', () => {
		const paths = ['2026-09-15.md', 'Projects/todo.md', '2026-09-15 extra.md'];
		expect(findPreviousDailyNote(paths, '2026-09-15.md', root, moment)).toBeNull();
	});

	it('returns null when the target is not a daily note', () => {
		expect(findPreviousDailyNote(['2026-09-10.md'], 'random.md', root, moment)).toBeNull();
	});

	it('works with nested folders and only inside the daily folder', () => {
		const paths = [
			'Journal/2026/08/2026-08-30.md',
			'Journal/2026/09/2026-09-01.md',
			'Archive/2026/09/2026-09-14.md',
			'Journal/2026/09/2026-09-16.md',
		];
		expect(findPreviousDailyNote(paths, 'Journal/2026/09/2026-09-16.md', nested, moment)).toBe(
			'Journal/2026/09/2026-09-01.md',
		);
	});

	it('reaches back across a long break', () => {
		const paths = ['2025-12-24.md', '2026-09-17.md'];
		expect(findPreviousDailyNote(paths, '2026-09-17.md', root, moment)).toBe('2025-12-24.md');
	});
});

describe('isEmptyNote', () => {
	it('treats whitespace-only content as empty', () => {
		expect(isEmptyNote('')).toBe(true);
		expect(isEmptyNote('\n\n  \t\n')).toBe(true);
		expect(isEmptyNote('- [ ] thing')).toBe(false);
		expect(isEmptyNote('---\ntags: []\n---\n')).toBe(false);
	});
});

describe('findAdjacentDailyNote', () => {
	const paths = ['2026-09-01.md', '2026-09-09.md', '2026-09-12.md', '2026-09-20.md', 'Projects/plan.md'];

	it('finds the nearest note before an anchor date', () => {
		expect(findAdjacentDailyNote(paths, moment('2026-09-15'), 'before', root, moment)).toBe('2026-09-12.md');
	});

	it('finds the nearest note after an anchor date', () => {
		expect(findAdjacentDailyNote(paths, moment('2026-09-10'), 'after', root, moment)).toBe('2026-09-12.md');
	});

	it('excludes notes on the anchor day', () => {
		expect(findAdjacentDailyNote(paths, moment('2026-09-12'), 'before', root, moment)).toBe('2026-09-09.md');
		expect(findAdjacentDailyNote(paths, moment('2026-09-12'), 'after', root, moment)).toBe('2026-09-20.md');
	});

	it('returns null at either end of the sequence', () => {
		expect(findAdjacentDailyNote(paths, moment('2026-08-01'), 'before', root, moment)).toBeNull();
		expect(findAdjacentDailyNote(paths, moment('2026-10-01'), 'after', root, moment)).toBeNull();
	});
});
