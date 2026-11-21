# COACH: handover for a new chat

This chat is for COACH updates only. **The setup and rules are in `CLAUDE.md`** (repo root): the repo is the app, Claude pulls, builds, tests and pushes itself.

**Before building anything, `git pull` and read `git log`.** Muse and other chats can change COACH too. Build on what's live.

## What COACH is
My own calorie, nutrition, hydration **and training** tracker, for personal use only (not a product). It's a PWA that runs from my iPhone home screen. All data lives on the phone, with a daily automatic backup to a private gist on my GitHub. **Everything syncs with Muse** through a private repo (see v146).

Current version: **v148**.

## Where it's hosted (changed in v142)
- **GitHub Pages**, not Netlify. Repo **`COACH`** (capitals) on my account `baileywalsh-maker`. Live at **https://baileywalsh-maker.github.io/COACH/** (the link is case-sensitive).
- **The source lives in the repo as plain files** under `_source/` (not published, since GitHub Pages skips `_` folders). No zip any more (from Nov 2026).
- **How to ship:** see `CLAUDE.md`. In short: `git pull`, edit `_source/`, bump `_source/VERSION`, `bash _source/ship.sh` (build + tests + copy into the root), commit `vN`, pull again, push. Claude pushes; Bailey does nothing on the laptop.
  - Old `foods.<hash>.js` / `packets.<hash>.txt` files can stay in the root. They do no harm.
- Jot and Ledger share the same web address (`/jot/`, `/LEDGER/`). Their saved data is kept apart (`jot:*`, `ledger:*`), and COACH never copies or touches it. This chat is for COACH only.
- Deploys are free now. Still run the tests before every build.
- Netlify is being kept for a short while as a fallback, then cancelled. The old Netlify home-screen copies have been deleted.

## Rules for every change (non-negotiable)
1. **Never wipe or break saved data.** Every update must read whatever is already on my phone. Stored names, keys and entry shapes stay compatible, and new features use new keys.
2. **Never invent nutrition figures.** Only real sources: USDA, CoFID (UK), AFCD (AU), Open Food Facts, or a chain's own published data. Missing = missing.
3. Plain, simple language. Short answers. Number every list in one running sequence so I can reply "do 1, 3".
4. Every build: push it to the repo (see `CLAUDE.md`). Don't send me files I don't need. Update this handover only when I ask, or when the chat is getting full.
5. Show a **demo** with every big change: edit the buttons in `_source/demo/tryit.js`, run `python3 _source/demo/make_demo.py`, and publish `_source/demo/coach_demo.html` to the **"COACH designs"** artifact: https://claude.ai/artifact/JPNdyYgguyEKx27A8FbQ1F. It's one page for all COACH mockups and demos, so republish to the same link and never make a new one. When showing how a design will look, show exactly how it will look (built with COACH's real styles).
9. **Everything in COACH must sync with Muse.** Any new saved data must reach the sync file, and `_source/COACH_SYNC.md` (Muse's instructions) must be updated to match. Secrets never sync.
6. **Run the test pack before shipping.** Add tests for anything new.
7. Never paste API keys in chat. My GitHub key is pasted into COACH's settings only.
8. Personal tool: don't add big new features. Fix what I actually hit.

## Source layout (`_source/`)
- `src/`: the app, in parts. `src/parts.txt` lists them in order and the build joins them, top to bottom.
  - `00-head.html`, `50-page.html` (all the screens' HTML), `51-store-loader.html` (v142 storage, see below), `99-tail.html`
  - `css/`: 5 files (icons and fonts, design system, deep pages, `03b-train.css`, then the v120 redesign layer, which must stay last)
  - `js/`: 50 files named by what they hold. They are one script when joined, so order matters. New: `44-muse-sync.js`, then `44-train.js`.
  - The food data is inserted at `<!--COACH_DATA-->` in `50-page.html`.
- `data/`: `LOCAL_FOODS.json`, `LABEL_DB.json`, `UK_BLOB.txt`, `AU_BLOB.txt`, `USDA_BLOB.txt`, `EXERCISES.json` (888 exercises), `STRENGTH.json` (Strength Level standards for 64 lifts). Edit the JSON as JSON, never by hand.
- `static/`: `manifest.json`, `zxing.js`, icons (the live v143 ones), `uk_packets.txt`.
- `sw.template.js`: the service worker. The food data and packets sit in a `coach-data` cache that is kept between versions.
- `VERSION`: bump this for every build.
- `build.py`: builds `dist/` and `index.preview.html` (both ignored by git). `ship.sh` runs it, tests, and copies `dist/` into the root.
- `demo/`: `seed_body.js` (90 days of example data), `tryit.js` (the "Try v…" buttons, edit per version), `make_demo.py` (builds `demo/coach_demo.html` from `index.preview.html`).
- `tests/run.js`: the test pack, **150 checks**. Run it through `ship.sh`, or as `node tests/run.js --old <folder of the live files only> --new dist` (set `CHROME=` to a Chrome path if Playwright's own browser isn't installed). `--only <suite>` runs one suite. It covers data surviving updates, targets lining up, reviews, hydration maths, remembered scores, the offline data file, the scanner (fake camera), cloud backup (mock GitHub), the weigh-in, every screen's speed and errors, the v142 store, search (v143), Train (v144) and Muse sync with a mock GitHub (v146).
  - The storage checks swap a v142+ `--old` build's store for plain localStorage, so they always test the move from a v141-style phone (v143).
  - Note: the v141 source was rebuilt in this chat from the v140 source plus the v141 app (it builds byte-for-byte the same). The ~14 extra checks written in v141 were lost with it. One v140 check was updated to the v141 budget wording.
- `proto/`: concept prototypes, not part of the app.

## v148: Eat | Train on its own row
- The switch moved off the tab row (looked crammed) onto its own full-width row above the tabs, with words: "Eat" and "Train" (option 1 on the designs page). Picked by Bailey from 3 mocks (own row, pill under COACH, big words).

## v147: tighter Day screen + Eat/Train in the tab row
- **Header:** streak | COACH | profile + settings, so COACH is dead centre. The Eat/Train switch now sits at the start of the tab row (`#nav-row`, left of Day/Week/Data or Workout/History/Exercises). Same ids, so `setMode` and the tests work unchanged.
- **Day screen, option B from the designs page** (about 25% shorter, 3.9 → 3.0 screens): "+ Add" sits beside each meal's total; food rows are one line (name, amount, kcal; brand under the name when there is one); protein/carbs/fat moved to the food's page (`#fd-macros` under the subtitle); slimmer chips, date bar and "Add a supplement"; body systems in 3 columns without the "x of y nutrients" line; tighter water cards. All CSS is scoped to `#view-day` at the end of `04-redesign-v120.css`.
- Tests: new `tidy` suite (8 checks).

## v146: Sync with Muse covers everything
- **Standing rule:** everything in COACH must be visible to and editable by Muse. Any new feature's saved data goes into the sync (store keys sync automatically if they start with `coach`/`calorie`; anything needing structure gets its own part plus an `insights` entry). Update `_source/COACH_SYNC.md` with it.
- The sync file now has `workouts`, `store` (every other key) and read-only `insights` (ranks, muscle map, bests, targets). Secrets and caches are left out (`MUSE_SYNC_SKIP`). Any `lsSet` on a coach/calorie key schedules a sync. Files over 1 MB are fetched raw. 90 days of data is about 150 KB.

## v145: merge
- Two chats both shipped a "v144" from v143: **Train** (this chat) and **Sync with Muse** (another chat). v145 has both. The Muse code came across line for line from its built page (`src/js/44-muse-sync.js`, the Settings block and its hooks). Its own tests and `_source/COACH_SYNC.md` came from that chat, but its test suite was never pushed, so the Muse checks here are basic.
- **Lesson:** only one chat should build COACH at a time. Before building, check `git log` in the repo. If someone else has pushed, start from their build.

## v144 (other chat): Sync with Muse
- **Sync with Muse.** Same pattern as Jot sync (v35): food, water, weight and training days sync to ONE file, `coach-sync.json`, in a **private** repo `baileywalsh-maker/coach-sync` (Bailey creates it, installs the Muse GitHub App on it, and pastes a fine-grained token — Contents read/write on that repo only — into Settings → Sync with Muse). Full design + Muse's instructions: `_source/COACH_SYNC.md`. Code: `src/js/44-muse-sync.js`.
- **What syncs:** one record per day (food entries, water in ml, complete tick, training tick) plus the weight log. What never syncs: profile, targets, target snapshots, My foods, label fixes, reviews, adjust log, recents, settings.
- **Merge:** three-way by day, then by entry id, against the last good sync — same rules as Jot. A day changed on both sides merges entry by entry (newer `upd` wins, listed in Settings); water keeps the larger amount; ticks are kept if either side ticked them; a date weighed on both sides keeps the phone's reading.
- **Entry ids:** food entries never had ids, so sync stamps a stable `id` (and `upd` when the food changes) on every save, in `saveEntries`. Entries restored from a backup get ids on the next sync. The id changes nothing the app shows, and old days keep working.
- **Token safety:** the token and the sync state live under `coachmusesync*` keys and are left out of both backup paths (a test checks this). They are never in the app code.
- **Still to do (needs Bailey):** create the private `coach-sync` repo, install the Muse GitHub App on it, make the token, paste it in Settings, open COACH, tap Sync now, and check a test entry Muse adds appears. Sync is **not** proved live until that run — same as Jot was.
- **Workouts:** synced from v145.


## v144: Train (the workout side)
- **Eat / Train switch** in the header swaps all the tabs. Train has Workout, History and Exercises. All in `js/44-train.js` and `css/03b-train.css`.
- Hevy-style logging: routines, previous numbers, tick to log, rest timer (kept as an end time), warm-up/drop/failure sets, notes, swap/move exercises. Saves on every change.
- Storage, new keys only: `coachtrain:mode`, `:active`, `:idx`, `:w:<id>`, `:routines`, `:custom`, `:prefs`, `:rest`. Included in the gist backup.
- Library: `data/EXERCISES.json`, 888 exercises: about 180 Hevy-named core lifts plus free-exercise-db (public domain). Search forgives typos (4+ letters) and gym shorthand.
- Ranks: `data/STRENGTH.json`, Strength Level standards for 64 lifts by sex and bodyweight. Six ranks: Rookie, Apprentice, Contender, Strong, Beast, Champion (5/20/50/80/95% lines). Estimated 1RM is Epley (≤12 reps), and bodyweight lifts are judged on reps. Machine ranks are flagged as rough.
- Muscle map: front and back, using the Day card figure. Red weak (below 20%), yellow average (20–50%), green strong (50–95%), animated gold champion (95%+), grey no data. A lift counts fully for its main muscle and half for the others. Exercises tab shows Highlights (top 3 lifts, strongest and weakest group) plus a Stat library (groups, then lifts, then the lift page).
- Links to food: a workout marks the day as training. Water top-up is 0.5 L per hour (minimum 0.5 L). The Day chip names the session. Reviews get a Training line. Calories burned (Compendium METs) are shown only, never added to the target. Pre-workout card shows food from the 3 h before the start, and food added from it is a normal entry tagged `pw`.
- Started fresh: no Hevy import.
- Next ideas: body view muscle highlights on the Day card, more ranked lifts, cardio pace.

## v143
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
1. **Body view muscle highlights:** muscles trained light up on the Day card's body figure (left out of v144).
2. **More ranked lifts:** only 64 lifts have Strength Level standards, so the rest show no rank.
3. Bundaberg Aussie Original, Diet and Spiced, from Bundaberg's own figures (web lookups hit a limit in v143).
4. About 400 old packets plus about 1,700 of the v143 packets have no brand. Brand search misses those.
5. KFC cup sizes: not published by KFC, so they stay "size unknown".
6. Train feedback: waiting for my list after real sessions (speed, feel, anything missing).
7. Small, left alone: the streak counts logged days, not confirmed days.
8. Cancel Netlify once happy (the old home-screen copies are already deleted).
9. Open Food Facts' bulk data is only as good as its contributors, so a few packets may carry odd names.

## How to get data the cloud can't reach
v143 method that worked: open the site in the built-in browser, fetch the file in the page, save it to Downloads, then copy it into a subfolder with `cat a > b` (the bridge refuses freshly saved downloads as "hardlinked" for a few seconds) and stage it.

My laptop (Windows, Claude desktop app open) must be online. Connect my **Downloads** folder, open the chain's site in the built-in browser and download its nutrition PDF, stage it, and read it with pdfplumber. Check every row: total kcal ≈ kcal/100 g × weight, and drop rows that fail.
