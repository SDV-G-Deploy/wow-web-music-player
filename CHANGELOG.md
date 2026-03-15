# CHANGELOG

## v5
- Playlist management v2:
  - queue drag & drop reorder (desktop)
  - touch drag-drop reorder target (mobile-friendly)
  - explicit move up/down fallback controls
  - remove track from queue (demo + local)
  - clear queue action with confirmation
- User playlists (local-only):
  - create from queue, add individual queue tracks (`+PL`), rename, delete
  - saved in `localStorage` (`wwmp-user-playlists-v1`)
  - load playlist back to queue in one click
  - export/import playlists JSON
- UX/safety updates:
  - no server-side uploads for playlist operations
  - confirmation dialogs for destructive actions
  - toast statuses for saved/imported/deleted/error flows
- Kept v4 core behavior intact (crossfade, shuffle/repeat, visual presets, media session, local upload).
- Expanded playback/queue tests: reorder/remove/move-step logic + playlist-load mapping.

## v5-pre (stabilization pass)
- Fixed playback navigation freeze on prev/next by removing stale state usage in async/media-session/end handlers and adding transition lock + fallback error handling.
- Synced queue/repeat/crossfade/play state via refs for stable behavior with timers and media actions.
- Fixed preset **C3** visual usage: C3 now affects global background gradient and dedicated aurora layer (not just minor text tint).
- Mobile-first UI cleanup:
  - condensed primary screen
  - moved secondary controls into collapsible **Advanced controls** panel
  - reduced visual noise and spacing on small screens
- Added minimal playback navigation tests (`test:playback`) for queue next/prev/shuffle logic.
- Expanded README with full usage, shortcuts, Pages, preset IO, limitations, troubleshooting.

## v4
- Integrated-LUFS-style loudness estimation + compensation.
- Preset editor with JSON export/import.
- Local file upload flow (multi-file) with validation and status.

## v3
- Queue, shuffle, repeat mode handling.
- Crossfade playback between dual audio decks.

## v2
- Visualizer and animated aurora styling.
- Basic media controls and timeline seeking.

## v1
- Initial React/Vite music player prototype.
