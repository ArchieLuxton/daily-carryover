# Daily Carryover

An Obsidian plugin that fills each new daily note with a copy of the previous daily note. I keep a freeform to-do list in my daily note and edit it during the day. The next morning the new note starts with the same text, and the old note is left alone, so I can read back through earlier days and see what the list looked like.

The plugin does not use a template and does not parse tasks. It copies the previous note as it is, including any frontmatter.

## How it works

When a daily note is created and is empty, the plugin looks for the most recent daily note with an earlier date and copies its content into the new note. If the last note was written on Friday and the new one is Monday, Friday's note is used. If you have not opened Obsidian for a month, the note from a month ago is used. A notice shows which note was copied.

The plugin does not overwrite existing content. If the new note already contains something, for example text from a Daily notes template or a copy that arrived from another device through Sync, the plugin leaves it alone.

The previous note is chosen relative to the new note's date rather than today's date. If you create a note for tomorrow, it is filled from today's note.

A file is treated as a daily note only if it is in the daily note folder and its filename matches the daily note date format exactly. Other files in the folder are ignored.

The folder and date format are taken from the core Daily notes plugin settings. If those settings cannot be read, the plugin assumes the vault root and `YYYY-MM-DD`.

## Commands

"Carry over from previous daily note" runs the copy by hand. It works on the active file if that file is a daily note, and otherwise on today's note, creating it if necessary. If the target note already has content the command stops and shows a notice. To copy anyway, delete the content and run the command again. The calendar icon in the left ribbon runs the same command.

"Open previous daily note" and "Open next daily note" move to the nearest daily note before or after the current one, ignoring days with no note. If the active file is not a daily note, the search starts from today, so "Open previous daily note" opens today's note if there is one and otherwise the latest note before today.

The commands have no default hotkeys. To add some, open Settings, Hotkeys and search for "Daily Carryover". You may also want a hotkey for the core "Open today's daily note" command.

## Obsidian settings

The relevant settings are under Settings, Core plugins, Daily notes.

- "New file location" is the daily note folder and "Date format" is the filename pattern. The plugin reads both from here. The format can contain slashes, such as `YYYY/MM/YYYY-MM-DD`, to put notes in nested folders.
- Leave "Template file location" empty. A template puts content in the new note before this plugin runs, and the plugin will not overwrite it.
- "Open daily note on startup" creates and fills today's note when Obsidian starts.

## Plugin settings

There are two toggles, both on by default. One enables the automatic copy when a daily note is created. The other shows a notice naming the source note after an automatic copy.

## Installation

The plugin is not in the community plugin store. Build it and copy the files into your vault.

```
npm install
npm run deploy
```

`npm run deploy` builds `main.js` and copies it and `manifest.json` into `.obsidian/plugins/daily-carryover/` inside the vault. On macOS the script reads the vault path from Obsidian's own vault list when there is only one vault. Otherwise pass `--vault /path/to/vault` or set the `OBSIDIAN_VAULT` environment variable.

In Obsidian, open Settings, Community plugins and enable Daily Carryover under Installed plugins. Restricted mode must be off.

After changing the code, run `npm run deploy` again, then run "Reload app without saving" from the command palette.

## Development

```
npm test
npm run build
npm run dev
```

`npm test` runs the vitest suite. `npm run dev` rebuilds whenever a source file changes.

`src/dailyNotes.ts` contains the path and date logic and `src/carryover.ts` contains the copy logic. Neither imports from `obsidian`, and both are tested against an in-memory vault. `src/main.ts` connects them to the Obsidian API. Its tests use `src/test/obsidianStub.ts`, which the vitest config substitutes for the `obsidian` package because that package contains type declarations only.

## Limitations

The plugin runs only while Obsidian is open. A day on which you never open Obsidian gets no note.

If two devices create the same day's note at the same time, Sync may report a conflict. Usually the first device writes the copy, the second device then sees a note with content and does nothing.

The core Daily notes settings are read through an internal Obsidian API. It is not documented, but it has not changed in several years.
