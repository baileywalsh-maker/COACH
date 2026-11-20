# COACH — notes for Claude

Read this first in any chat about COACH. The full handover is imported below.

## How changes ship now (v146)
- Before building, check `git log` here. Only one chat builds COACH at a time.
- Unzip `_source/coach_source.zip` outside the repo, build with `python3 build.py`, and run the tests with
  the live files in this repo as `--old`. Then copy `dist/` into the repo root and update `_source/`.
- Commit with the laptop shell (`git add -A && git commit -m "vN"`). Bailey clicks **Push origin** in GitHub Desktop.
  (Pushing from the cloud was refused by permissions.)
- Rolling back = revert the last commit. Every version stays in the history.
- This repo is **public**. Never commit keys, tokens, backups or personal figures.
- Everything COACH saves must sync with Muse. Keep `_source/COACH_SYNC.md` in step with any new data.

## Changed since the handover
- Demos go on "COACH designs" (below), not the old "COACH Demo" page.

## Mockups and demos: one page per app
- All design ideas, mockups and demos for COACH go on ONE artifact titled "COACH designs".
  Update that same page every time (republish to its link). Never make a new one.
- Its link: https://claude.ai/artifact/JPNdyYgguyEKx27A8FbQ1F (holds the live demo of the latest build; the "Try vN" buttons come from `demo/tryit.js`).
- Old ideas get replaced on the page, not kept. Decisions go in the handover instead.

@_source/COACH_handover.md
