# Changelog (android-native)

## 0.3.0 — Iteration 3

### Added
- Lightweight UX polish: loading/error/empty states for library/player/playlists.
- User playlists:
  - create/rename/delete,
  - add/remove tracks,
  - play whole playlist.
- Playback session persistence:
  - queue,
  - current index,
  - position,
  - repeat/shuffle.
- Restore policy with safe fallback for unavailable tracks.
- Runtime fallback: unavailable current track is removed and playback continues.
- Native release workflow for signed APK + AAB (`android-native-release.yml`).
- New unit tests:
  - `PlaylistMutationsTest`
  - `PlaybackSessionRestorePolicyTest`

### Changed
- App version bumped to `0.3.0` (`versionCode = 3`).
- Release build now checks signing env via `verifyReleaseSigningEnv` (clear fail-fast).
- Smoke UI test updated to cover playlists tab.

### Fixed
- Session restore no longer crashes when previously saved tracks are missing/revoked.

## 0.2.0 — Iteration 2
- Deterministic playback state machine.
- Serialized command pipeline.
- Improved queue reliability and reconnect handling.
- Error classification + log throttling.

## 0.1.0 — Iteration 1
- Initial native playback baseline (Media3 + Compose + MediaStore/SAF).