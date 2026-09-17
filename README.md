# Daily Carryover

An Obsidian plugin that starts each new daily note as a verbatim copy of the most recent earlier daily note. Keep a freeform to-do list in your daily note, edit it through the day, and tomorrow's note begins exactly where today's ended. Every past note stays as it was, so the history of the list is preserved day by day.

There is no template and no parsing of tasks. Whatever the previous note contains, frontmatter included, is copied byte for byte.

## How it behaves

When a daily note is created and is empty, the plugin finds the latest daily note dated before it and copies that note's content in. Weekends and gaps do not matter: the source is whichever earlier note exists, however old. A notice names the source note.

The plugin never overwrites. If the new note already has content, for example from a Daily notes template or because it arrived from another device via Sync, nothing happens.

"Previous" is relative to the created note's date, not to today. Creating a note for tomorrow carries over from today.

Only files that sit in the daily note folder and whose names match the daily note date format exactly are treated as daily notes. Other files in the same folder are ignored.

The folder and date format are read from the core Daily notes plugin, so there is nothing to keep in step. If they cannot be read the plugin assumes the vault root and `YYYY-MM-DD`.

## Commands

"Carry over from previous daily note" runs the same logic by hand. It targets the active file if that is a daily note, and otherwise today's note, creating it if needed. If the target already has content it refuses with a notice. Empty the note and run the command again to carry over. The same command sits behind the calendar icon in the left ribbon.

"Open previous daily note" and "Open next daily note" step through the sequence of daily notes by date, skipping gaps. From inside a daily note they move relative to that note. From any other file they start from today, so "Open previous daily note" opens today's note if it exists and otherwise the most recent one before it.

None of the commands have default hotkeys. Bind them under Settings, Hotkeys, by searching for "Daily Carryover". Binding the core "Open today's daily note" command as well gives a complete keyboard workflow.

## Suggested Obsidian settings

Under Settings, Core plugins, Daily notes:

- "New file location" sets the folder and "Date format" sets the filename pattern. The plugin reads both, so change them here and nowhere else. The format may contain slashes to nest by year and month.
- Leave "Template file location" empty. A template fills the new note before this plugin sees it, and the plugin never overwrites content.
- Turn on "Open daily note on startup" if you want the day's note created and filled the moment Obsidian launches.

## Settings

Two toggles, both on by default: carry over automatically on creation, and show a notice after an automatic carryover.

## Install into your vault

The plugin is not in the community store. Build it and copy it into the vault.

```
npm install
npm run deploy
```

`npm run deploy` builds `main.js` and copies it, with `manifest.json`, into `.obsidian/plugins/daily-carryover/` in your vault. On macOS it finds the vault from Obsidian's own registry when there is exactly one; otherwise pass `--vault /path/to/vault` or set `OBSIDIAN_VAULT`.

Then in Obsidian open Settings, Community plugins, and toggle on Daily Carryover under Installed plugins. Restricted mode must be off.

After changing the code, run `npm run deploy` again and then "Reload app without saving" from the command palette.

## Development

```
npm test
npm run build
npm run dev
```

`npm test` runs the vitest suite. The path and date logic lives in `src/dailyNotes.ts` and the carryover logic in `src/carryover.ts`; both are free of Obsidian imports and are tested against an in-memory vault. `src/main.ts` wires them to the Obsidian API and is tested against `src/test/obsidianStub.ts`, which the vitest config aliases in place of the `obsidian` package because that package ships only type declarations. `npm run dev` rebuilds on every change.

## Known limitations

The plugin only acts while Obsidian is open, so a day you never open Obsidian gets no note. Two devices creating the same day's note at the same moment can produce a Sync conflict; in practice the first device to write wins and the second sees a non-empty note and stops. Reading the core Daily notes settings uses an internal Obsidian API that is undocumented but has been stable for years.
