# COACH: handover for a new chat

This chat is for COACH only. Paste this whole file into the new chat. The source and the live build are in my laptop's `GitHub\COACH` folder (see below). Use the live files there as the `--old` build for the tests.

## What COACH is
My own calorie, nutrition and hydration tracker, for personal use only (not a product). It's a PWA that runs from my iPhone home screen. All data lives on the phone, with a daily automatic backup to a private gist on my GitHub.

Current version: **v144**.

## Where it's hosted (changed in v142)
- **GitHub Pages**, not Netlify. Repo **`COACH`** (capitals) on my account `baileywalsh-maker`. Live at **https://baileywalsh-maker.github.io/COACH/** (the link is case-sensitive).
- The repo is cloned on my laptop at **`C:\Users\baile\OneDrive\Documents\GitHub\COACH`** (GitHub Desktop). Jot and Ledger sit beside it (`jot`, `LEDGER`).
- **The source lives in the repo too:** `_source/coach_source.zip` and `_source/COACH_handover.md`. GitHub Pages doesn't publish folders starting with `_`, so it's not part of the site, and every version is kept in the repo's history.
- **How to start a new chat:** paste this handover and ask me to connect the `GitHub` folder above. Read the source from `COACH/_source/`, so no attachments are needed.
- **How to ship a build (the routine):**
  1. Build and run the tests here.
  2. Write the files from `dist/` straight into the `COACH` folder on my laptop, along with the updated `_source/coach_source.zip` and `_source/COACH_handover.md`.
  3. I open GitHub Desktop, choose COACH, type the version (e.g. "v144"), then **Commit to main → Push origin**. It's live in about a minute; close and reopen the app if it doesn't show.
  - Old `foods.<hash>.js` / `packets.<hash>.txt` files can stay in the folder. They do no harm.
- Jot and Ledger share the same web address (`/jot/`, `/LEDGER/`). Their saved data is kept apart (`jot:*`, `ledger:*`), and COACH never copies or touches it. This chat is for COACH only.
- Deploys are free now. Still run the tests before every build.
- Netlify is being kept for a short while as a fallback, then cancelled. The old Netlify home-screen copies have been deleted.

## Rules for every change (non-negotiable)
1. **Never wipe or break saved data.** Every update must read whatever is already on my phone. Stored names, keys and entry shapes stay compatible, and new features use new keys.
2. **Never invent nutrition figures.** Only real sources: USDA, CoFID (UK), AFCD (AU), Open Food Facts, or a chain's own published data. Missing = missing.
3. Plain, simple language. Short answers. Number every list in one running sequence so I can reply "do 1, 3".
4. Every build: write `dist/` into the COACH repo folder, update `_source/coach_source.zip` and this handover, and also send me `index.preview.html`.
5. Show a **demo** with every big change: edit the buttons in `demo/tryit.js`, run `python3 demo/make_demo.py`, and publish `demo/coach_demo.html` to the "COACH Demo" artifact: https://claude.ai/artifact/8vSTBxBWvUEYRcHFuagN5t (republish to the same artifact to keep the link).
6. **Run the test pack before shipping.** Add tests for anything new.
7. Never paste API keys in chat. My GitHub key is pasted into COACH's settings only.
8. Personal tool: don't add big new features. Fix what I actually hit.

## Source pack layout (`coach_source.zip`)
- `src/`: the app, in parts. `src/parts.txt` lists them in order and the build joins them, top to bottom.
  - `00-head.html`, `50-page.html` (all the screens' HTML), `51-store-loader.html` (v142 storage, see below), `99-tail.html`
  - `css/`: 4 files (icons and fonts, design system, deep pages, the v120 redesign layer, which must stay last)
  - `js/`: 48 files named by what they hold. They are one script when joined, so order matters.
  - The food data is inserted at `<!--COACH_DATA-->` in `50-page.html`.
- `data/`: `LOCAL_FOODS.json`, `LABEL_DB.json`, `UK_BLOB.txt`, `AU_BLOB.txt`, `USDA_BLOB.txt`. Edit the JSON as JSON, never by hand.
- `static/`: `manifest.json`, `zxing.js`, icons, `uk_packets.txt`.
- `sw.template.js`: the service worker. The food data and packets sit in a `coach-data` cache that is kept between versions.
- `VERSION`: bump this for every build.
- `build.py`: `python3 build.py` builds `dist/`, `coach_vN.zip` and `index.preview.html`.
- `demo/`: `seed_body.js` (90 days of example data), `tryit.js` (the "Try v…" buttons, edit per version), `make_demo.py` (builds `demo/coach_demo.html` from `index.preview.html`).
- `tests/run.js`: the test pack, **133 checks**. Run it as `node tests/run.js --old <folder of last shipped build> --new dist` (set `CHROME=` to a Chrome path if Playwright's own browser isn't installed). `--only <suite>` runs one suite. It covers data surviving updates, targets lining up, reviews, hydration maths, remembered scores, the offline data file, the scanner (fake camera), cloud backup (mock GitHub), the weigh-in, every screen's speed and errors, the v142 store, and Muse sync (mock GitHub, v144).
  - The storage checks swap a v142+ `--old` build's store for plain localStorage, so they always test the move from a v141-style phone (v143).
  - Note: the v141 source was rebuilt in this chat from the v140 source plus the v141 app (it builds byte-for-byte the same). The ~14 extra checks written in v141 were lost with it. One v140 check was updated to the v141 budget wording.
- `proto/`: concept prototypes, not part of the app.

## v144 (this chat)
- **Sync with Muse.** Same pattern as Jot sync (v35): food, water, weight and training days sync to ONE file, `coach-sync.json`, in a **private** repo `baileywalsh-maker/coach-sync` (Bailey creates it, installs the Muse GitHub App on it, and pastes a fine-grained token — Contents read/write on that repo only — into Settings → Sync with Muse). Full design + Muse's instructions: `_source/COACH_SYNC.md`. Code: `src/js/44-muse-sync.js`.
- **What syncs:** one record per day (food entries, water in ml, complete tick, training tick) plus the weight log. What never syncs: profile, targets, target snapshots, My foods, label fixes, reviews, adjust log, recents, settings.
- **Merge:** three-way by day, then by entry id, against the last good sync — same rules as Jot. A day changed on both sides merges entry by entry (newer `upd` wins, listed in Settings); water keeps the larger amount; ticks are kept if either side ticked them; a date weighed on both sides keeps the phone's reading.
- **Entry ids:** food entries never had ids, so sync stamps a stable `id` (and `upd` when the food changes) on every save, in `saveEntries`. Entries restored from a backup get ids on the next sync. The id changes nothing the app shows, and old days keep working.
- **Token safety:** the token and the sync state live under `coachmusesync*` keys and are left out of both backup paths (a test checks this). They are never in the app code.
- **Still to do (needs Bailey):** create the private `coach-sync` repo, install the Muse GitHub App on it, make the token, paste it in Settings, open COACH, tap Sync now, and check a test entry Muse adds appears. Sync is **not** proved live until that run — same as Jot was.
- **Workouts:** the sync file has a `workouts` slot, empty for now — there is no workout logging yet, only the training-day tick. When workout logging lands, its entries go there, merged like food entries.

## v143 (this chat)
- **Search:** forgives typos (one slip in 5+ letter words, two in 8+), ignores accents ("nestle" finds Nestlé), finds words typed together ("mullerlight"). Close spellings sit below exact matches, marked "close spelling". If the live search finds little, it retries with the close spelling.
- **Faster search:** results worked out once per letter (was twice), live results remembered for the session, live search starts sooner (300 ms), packets load as soon as the add sheet opens.
- **UK packets:** 27,629 → 33,799. Added 6,170 UK products (UK, Aldi and Lidl barcodes only) scanned 2+ times on Open Food Facts, each checked: named, full figures, and calories adding up. 161 blank brands filled from Open Food Facts (confirmed only), Bundaberg Ginger Beer included. Raw files kept in `_source/import/`.
- **Costa food:** 50 items added from Costa's own in-store guide (Nov 2026), with sugar, sat fat, fibre and salt. Rows where Costa's own numbers didn't add up were dropped.
- **Cup sizes:** Starbucks (Short 240, Tall 355, Grande 473, Venti 591 ml; iced liquid Tall 192, Grande 273, Venti 326), Tim Hortons (Small 355, Medium 473, Large 591; iced stays unknown), Nando's (300 ml glass, bottomless counted per glass). KFC publishes no cup sizes, so those stay "size unknown".
- **Shorter text:** review summaries are now short points ("2,022 kcal a day · 878 under · trained 3 of 7"), "what to change" cards, the nutrient plan, Data screen notes and the burn card all cut. The suggested-change card shows Weight / You burn / You ate as three lines.
- **Tidy:** the food rules in `40-reviews.js` live in one place now (`FOOD_*`).

## v142
- **Bigger storage.** Data now lives in IndexedDB (gigabytes) instead of localStorage (about 5 MB on iPhone).
  - `51-store-loader.html` sets up `window.CS`, with the same calls as localStorage (`getItem`, `setItem`, `removeItem`, `key`, `length`, plus `keys()`, `whenSaved()`, `mode`). Every `localStorage.` call in `js/` now goes through `CS.`. Reads come from memory, and writes go to IndexedDB in batches.
  - The app script sits in `<script type="text/coach-app">` and only runs once the store has loaded (`COACH_BOOT()` in `99-tail.html`).
  - First open after the update: COACH copies every COACH item from localStorage, reads it back, checks every item matches, and only then switches (it sets flag `coach:idb` in localStorage and `__coach_idb_done` in IndexedDB). The old localStorage copy is never deleted.
  - If IndexedDB is missing or fails, COACH runs on localStorage as before. If the phone empties IndexedDB after the move, COACH restores from the kept copy and tells me to use Put back.
  - Jot and Ledger items, or a store with no `coach*`/`calorie*` items, are never copied in.
  - The Settings storage line now reads "storage X MB, plenty of room".
- **Less fine print**, cut across Profile, Settings, Water page, My foods, Weigh-in, the cloud backup card, Recently deleted and the heart panel. The profile's formula warning is now one line.
- **Profile Save bar fixed:** it now sits flush at the bottom with a solid fill, so nothing shows underneath it.

## Built in (high level)
- Day / Week / Data. The day card has four views you slide between: Today (ring), Body, Living day, Cockpit. Food log by meal, supplements, water card plus Hydration card.
- Same calorie and protein target every day. The training/rest tick is data only (+0.5 L water).
- Weekly review runs once Sunday is ticked complete. Weekly and monthly reviews have a calendar of unfinished days.
- Day score: calories 27, protein 23, quality 23, body systems 17, hydration 10.
- Hydration: water in each drink from its own figures. Dairy milk ×1.5, no coffee penalty, alcohol never counts, and wine/spirits lose 1 ml per g. There's a "Count as a drink" switch per food.
- Scanner: keeps scanning past unknown barcodes, needs two matching reads on iPhone, checks the phone first, and keeps the camera parked for 60 s.
- Speed: a loading screen covers the warm-up, day scores are remembered, and summaries are pre-built.
- Cloud backup: a secret gist on my GitHub, saved daily on the first open. "Put back" restores, and a new phone finds the backup once the key is pasted.
- Weigh-in starts at my last weight, with ±0.1 / ±0.5 buttons.
- v141 sweep:
  - Target safety (`targetChosenByYou()`).
  - Weekly budget wording.
  - One water target (`waterGoalMl()`).
  - Protein hit = protein floor.
  - Data cards count finished days.
  - Food ideas filter (`oddIdea()`).
  - Storage counted in bytes.
- v133–v140: Settings and Profile redesign, burn engine (`burnNow`/`adaptSuggestion` everywhere), pace line, today chips, week scoreboard, weight path, body card and views, sliding views done by hand.

## Search notes (found in this chat)
- Search already matches name **and** brand, both on the phone's UK packets and live on Open Food Facts.
- 567 of the 27,629 UK packets have a blank brand (Bundaberg Ginger Beer 9311493003289 is one of them), so brand searches miss those. The search needs exact letters ("bunderberg" finds nothing).

## Open items
1. Bundaberg Aussie original, Diet and Spiced: still to add from Bundaberg's own figures (web lookups hit a limit in v143).
2. About 400 of the old blank brands weren't checked yet (Open Food Facts kept throttling), plus ~1,700 of the new v143 packets have no brand. Brand search misses those.
3. KFC cup sizes: not published by KFC. Left as "size unknown".
4. Faster logging: waiting for my list of what feels slow.
5. Small, left alone: the streak counts logged days, not confirmed days.
6. After moving to GitHub, check: all days, foods and settings came back via Put back. Settings shows "plenty of room". Logging food and reopening keeps it.
7. Cancel Netlify once happy (the old home-screen copies are already deleted).
8. Open Food Facts' bulk data is only as good as its contributors: a few new packets may carry odd names.

## How to get data the cloud can't reach
v143 method that worked: open the site in the built-in browser, fetch the file in the page, save it to Downloads, then copy it into a subfolder with `cat a > b` (the bridge refuses freshly saved downloads as "hardlinked" for a few seconds) and stage it.

My laptop (Windows, Claude desktop app open) must be online. Connect my **Downloads** folder, open the chain's site in the built-in browser and download its nutrition PDF, stage it, and read it with pdfplumber. Check every row: total kcal ≈ kcal/100 g × weight, and drop rows that fail.
