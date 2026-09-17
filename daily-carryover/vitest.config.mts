import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(new URL('./src/test/obsidianStub.ts', import.meta.url)),
		},
	},
	test: {
		include: ['src/**/*.test.ts'],
	},
});
