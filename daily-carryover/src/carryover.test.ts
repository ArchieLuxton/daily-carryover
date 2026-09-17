import moment from 'moment';
import { beforeEach, describe, expect, it } from 'vitest';
import { CarryoverService, type NoteStore } from './carryover';
import type { DailyNoteConfig } from './dailyNotes';

class FakeStore implements NoteStore {
	readonly files = new Map<string, string>();
	readonly log: string[] = [];

	constructor(initial: Record<string, string> = {}) {
		for (const [path, content] of Object.entries(initial)) {
			this.files.set(path, content);
		}
	}

	listMarkdownPaths(): string[] {
		return [...this.files.keys()].filter((path) => path.endsWith('.md'));
	}

	exists(path: string): boolean {
		return this.files.has(path);
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`missing ${path}`);
		}
		this.log.push(`read ${path}`);
		return content;
	}

	async process(path: string, fn: (current: string) => string): Promise<void> {
		const current = this.files.get(path);
		if (current === undefined) {
			throw new Error(`missing ${path}`);
		}
		const next = fn(current);
		if (next !== current) {
			this.log.push(`write ${path}`);
			this.files.set(path, next);
		}
	}

	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) {
			throw new Error(`exists ${path}`);
		}
		this.log.push(`create ${path}`);
		this.files.set(path, content);
	}
}

const root: DailyNoteConfig = { folder: '', format: 'YYYY-MM-DD' };
const yesterday = '---\ntags: [daily]\n---\n\n## Todo\n\n- [x] done thing\n- [ ] open thing\n\nfree text here\n';

let store: FakeStore;
let service: CarryoverService;

beforeEach(() => {
	store = new FakeStore({
		'2026-09-12.md': yesterday,
		'2026-09-10.md': 'older\n',
		'Projects/plan.md': 'not a daily note\n',
		'2026-09-15.md': '',
	});
	service = new CarryoverService(store, () => root, moment);
});

describe('CarryoverService.carryOver', () => {
	it('copies the most recent earlier note verbatim into an empty target', async () => {
		const outcome = await service.carryOver('2026-09-15.md');
		expect(outcome).toEqual({ kind: 'copied', sourcePath: '2026-09-12.md' });
		expect(store.files.get('2026-09-15.md')).toBe(yesterday);
		expect(store.files.get('2026-09-12.md')).toBe(yesterday);
	});

	it('treats a whitespace-only target as empty', async () => {
		store.files.set('2026-09-15.md', '\n\n');
		const outcome = await service.carryOver('2026-09-15.md');
		expect(outcome.kind).toBe('copied');
		expect(store.files.get('2026-09-15.md')).toBe(yesterday);
	});

	it('leaves a target with content untouched', async () => {
		store.files.set('2026-09-15.md', 'already written\n');
		const outcome = await service.carryOver('2026-09-15.md');
		expect(outcome).toEqual({ kind: 'not-empty' });
		expect(store.files.get('2026-09-15.md')).toBe('already written\n');
		expect(store.log).not.toContain('write 2026-09-15.md');
	});

	it('does nothing when there is no earlier daily note', async () => {
		store.files.set('2026-09-01.md', '');
		const outcome = await service.carryOver('2026-09-01.md');
		expect(outcome).toEqual({ kind: 'no-source' });
		expect(store.files.get('2026-09-01.md')).toBe('');
	});

	it('refuses paths that are not daily notes', async () => {
		const outcome = await service.carryOver('Projects/plan.md');
		expect(outcome).toEqual({ kind: 'not-daily-note' });
		expect(store.log).toEqual([]);
	});

	it('does not overwrite content that arrived between the read and the write', async () => {
		const racing: NoteStore = {
			...store,
			listMarkdownPaths: () => store.listMarkdownPaths(),
			exists: (path) => store.exists(path),
			read: async (path) => {
				const content = await store.read(path);
				store.files.set('2026-09-15.md', 'synced from another device\n');
				return content;
			},
			process: (path, fn) => store.process(path, fn),
			create: (path, content) => store.create(path, content),
		};
		const outcome = await new CarryoverService(racing, () => root, moment).carryOver('2026-09-15.md');
		expect(outcome).toEqual({ kind: 'not-empty' });
		expect(store.files.get('2026-09-15.md')).toBe('synced from another device\n');
	});

	it('uses a nested folder config when one is supplied', async () => {
		const nested: DailyNoteConfig = { folder: 'Journal', format: 'YYYY/MM/YYYY-MM-DD' };
		store = new FakeStore({
			'Journal/2026/09/2026-09-11.md': 'friday\n',
			'Journal/2026/09/2026-09-14.md': '',
		});
		service = new CarryoverService(store, () => nested, moment);
		const outcome = await service.carryOver('Journal/2026/09/2026-09-14.md');
		expect(outcome).toEqual({ kind: 'copied', sourcePath: 'Journal/2026/09/2026-09-11.md' });
		expect(store.files.get('Journal/2026/09/2026-09-14.md')).toBe('friday\n');
	});
});

describe('CarryoverService helpers', () => {
	it('reports whether a path is a daily note', () => {
		expect(service.isDailyNote('2026-09-15.md')).toBe(true);
		expect(service.isDailyNote('Projects/plan.md')).toBe(false);
	});

	it('builds the path for a given day', () => {
		expect(service.todayPath(moment('2026-09-17'))).toBe('2026-09-17.md');
	});

	it('creates a missing note once and leaves an existing one alone', async () => {
		expect(await service.ensureExists('2026-09-17.md')).toBe(true);
		expect(store.files.get('2026-09-17.md')).toBe('');
		expect(await service.ensureExists('2026-09-17.md')).toBe(false);
		expect(store.log.filter((entry) => entry.startsWith('create'))).toHaveLength(1);
	});
});

describe('CarryoverService.adjacentNote', () => {
	it('steps backwards and forwards from a daily note', () => {
		expect(service.adjacentNote('2026-09-15.md', 'before', moment('2026-09-17'))).toBe('2026-09-12.md');
		expect(service.adjacentNote('2026-09-10.md', 'after', moment('2026-09-17'))).toBe('2026-09-12.md');
		expect(service.adjacentNote('2026-09-10.md', 'before', moment('2026-09-17'))).toBeNull();
		expect(service.adjacentNote('2026-09-15.md', 'after', moment('2026-09-17'))).toBeNull();
	});

	it('anchors on today, inclusive, when the current file is not a daily note', () => {
		store.files.set('2026-09-17.md', 'today\n');
		expect(service.adjacentNote('Projects/plan.md', 'before', moment('2026-09-17'))).toBe('2026-09-17.md');
		expect(service.adjacentNote(null, 'before', moment('2026-09-17'))).toBe('2026-09-17.md');
		expect(service.adjacentNote(null, 'after', moment('2026-09-16'))).toBe('2026-09-17.md');
	});

	it('anchors on today when the current file is not a daily note and today has no note', () => {
		expect(service.adjacentNote(null, 'before', moment('2026-09-17'))).toBe('2026-09-15.md');
	});
});
