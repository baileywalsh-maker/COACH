# COACH — notes for Claude

Read this first in any chat about COACH. The full handover (how the app works,
version history, open items) is imported at the bottom.

## The setup (same as Jot, from Nov 2026)
1. **This repo IS the current app.** `baileywalsh-maker/COACH`, hosted on GitHub Pages at
   https://baileywalsh-maker.github.io/COACH/ (case-sensitive). No zips, no uploads.
   - Repo root = the live files (`index.html`, `sw.js`, `foods.<hash>.js`, `packets.<hash>.txt`, icons…).
   - `_source/` = the source, as plain files. GitHub Pages doesn't publish `_` folders.
2. **Claude pushes straight to `main`.** Bailey doesn't touch the laptop. He opens COACH
   on his phone, closes it once, and the next open is the new version (about a minute after the push).
3. **Muse runs COACH day to day and can change its code too.** Before any change:
   `git pull`, then read the recent commits (`git log`) and the "Muse's app changes" list in
   `_source/COACH_SYNC.md`. Never assume the code is where you left it. Build on what's in `main`,
   keep any Muse changes, and mention them to Bailey in one line.
4. **Pull again right before pushing**, so nothing Muse did in the meantime is lost.
5. **Every update:** run the tests (add tests for anything new), bump `_source/VERSION`, and never
   wipe or break data already saved on his phone (same keys, same entry shapes; new features use new keys).
6. **Keep this file up to date** whenever the setup or the app changes.
7. **Mockups and demos go on ONE page: "COACH designs"**
   https://claude.ai/artifact/JPNdyYgguyEKx27A8FbQ1F. Republish to that link every time and never
   make a new one. Show the real app (built from the real code), not a drawing. Old ideas get replaced.
8. **What Bailey gets back:** a short summary of the changes, plus a picture if something visual
   changed. No zips. No handover docs unless he asks or the chat is getting full.
9. **This repo is PUBLIC.** It must never hold personal data, keys, tokens or backups.
   Before each push, check the diff for them. (Last full scan of the history: clean, Nov 2026.)
- Everything COACH saves must sync with Muse. Keep `_source/COACH_SYNC.md` in step with any new data.

## How to ship an update
```
git pull
# edit files under _source/ (bump _source/VERSION)
bash _source/ship.sh      # builds, tests against the live files, copies the build into the root
git add -A && git commit -m "vN" && git pull --rebase && git push
```
- `ship.sh` needs Python 3, Node and Playwright with Chrome (set `CHROME=` / `NODE_PATH=` if needed).
- Commit message = the version, e.g. `v147`.
- Old `foods.<hash>.js` / `packets.<hash>.txt` in the root do no harm; leave them.
- Rolling back = revert the last commit. Every version stays in the history.
- Demo: edit `_source/demo/tryit.js`, run `python3 _source/demo/make_demo.py` (after a build),
  and publish `_source/demo/coach_demo.html` to the "COACH designs" link above.

@_source/COACH_handover.md
