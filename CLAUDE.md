# COACH — notes for Claude

Read this first in any chat about COACH. The full handover is imported below.

## How changes ship now (replaces the GitHub Desktop routine in the handover)
- Claude pushes straight to this repo (`main`). GitHub Pages updates in about a minute.
- Bailey does nothing on the laptop. No zips, no GitHub Desktop.
- Source lives in `_source/coach_source.zip`. Unzip it somewhere outside the repo,
  build with `python3 build.py`, run the tests against the live files in this repo
  as `--old`, then copy `dist/` into the repo root.
- Every build also updates `_source/coach_source.zip` and `_source/COACH_handover.md`,
  in the same commit. Commit message = the version, e.g. `v143`.
- Rolling back = revert the last commit. Every version stays in the history.
- This repo is **public**. Never commit keys, tokens, backups or personal figures.

## Changed since the handover
- The "COACH Demo" artifact linked in the handover was deleted (Nov 2026 clean-up).
  Publish the next demo as a new artifact and update the link in the handover.

@_source/COACH_handover.md
