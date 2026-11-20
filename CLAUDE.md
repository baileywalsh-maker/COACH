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
- Demos now go on "COACH designs" (below), not the old "COACH Demo" page.
- Direct pushes from Claude were refused by permissions in the v144 chat, so for now
  Claude writes the files into this folder and Bailey pushes with GitHub Desktop.

## Mockups and demos: one page per app
- All design ideas, mockups and demos for COACH go on ONE artifact titled "COACH designs".
  Update that same page every time (republish to its link). Never make a new one.
- Its link: https://claude.ai/artifact/JPNdyYgguyEKx27A8FbQ1F (holds the live demo of the latest build; the "Try vN" buttons come from `demo/tryit.js`).
- Old ideas get replaced on the page, not kept. Decisions go in the handover instead.

@_source/COACH_handover.md
