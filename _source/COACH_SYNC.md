# COACH sync with Muse — v145 (everything, v146)

## The shape of it

The phone and Muse never talk to each other directly. They share one file:

- **Private repo:** `baileywalsh-maker/coach-sync` (private — Bailey creates it;
  Muse's GitHub App cannot create repos, it can only write to repos it is
  installed on, so Bailey also installs the Muse GitHub App on it)
- **File in it:** `coach-sync.json`
- **Phone side:** COACH reads/writes that file with a token Bailey pastes into
  Settings → Sync with Muse (see below)
- **Muse side:** Muse reads/writes that same file through the GitHub
  connector (`get_file_contents` / `create_or_update_file` on
  `baileywalsh-maker/coach-sync`)

The **public** `COACH` repo holds the app code only. It never holds food logs,
weights, backups, tokens or any personal data. The sync file format and the
token rules are the whole privacy story — read them before touching sync.

This mirrors Jot's sync (`jot/_source/SYNC.md`) exactly: same token rules,
same three-way merge, same quiet failures. Only the data shape differs —
Jot syncs one flat list of notes, COACH syncs one record per day plus the
weight log. The code is `src/js/44-muse-sync.js`.

## The file

```json
{
  "__coachSync": 1,
  "version": 12,
  "updatedAt": "2026-11-19T15:50:00.000Z",
  "updatedBy": "phone",
  "days": {
    "2026-11-19": {
      "entries": [ { "id": "mabc123", "name": "Chicken breast, cooked",
                     "grams": 200, "kcal": 330, "protein": 62, "carbs": 0,
                     "fat": 8, "meal": "Lunch", "upd": 1730000000000,
                     "at": 1730000000000 } ],
      "waterMl": 1500,
      "complete": true,
      "training": true
    }
  },
  "weight": [ { "date": "2026-11-19", "kg": 82.4 } ],
  "workouts": {}
}
```

What syncs: **everything COACH saves.** Since v146 the file has five parts:

- `days`: one record per date: food entries (`calorielog:`, supplements included, as entries with `"supp": true`), plain water in ml (`caloriewater:`), the complete tick (`caloriecomplete:`) and the training-day tick (`calorietrain:`).
- `weight`: the weight log (`calorieweightlog`).
- `workouts`: every finished workout, keyed by id. Shape: `{id, name, d: "YYYY-MM-DD", start, end (ms), rt (routine id or null), ex: [{n: exercise name, note, sets: [{t: "n"|"w"|"d"|"f", done: true, kg, reps, km, sec, pr: 1}]}]}`. Set types are normal, warm-up, drop and failure. `kg` is per dumbbell for dumbbell lifts, added weight for bodyweight lifts and kg taken off for assisted lifts. Exercise names must match COACH's library (e.g. "Bench Press (Barbell)"), or they appear as custom exercises.
- `store`: every other thing COACH saves, under its own storage name, e.g. `calorieprofile` (profile), `calorietarget`, `calorietargetsnap:YYYY-MM-DD`, `coachmyfoods`, `coachlabels`, `coachsupps`, `caloriereviews`, `coachmonthreviews`, `calorieadjustlog`, `caloriesavedmeals`, `calorierecents`, `coachtrain:routines`, `coachtrain:custom` (Bailey's own exercises), `coachtrain:prefs`, `coachtrain:active` (a workout in progress), `coachtrain:mode`, plus display settings. A JSON value appears as JSON. Any other value appears as `{"__raw": "text"}`.
- `insights` (**read-only**): worked out fresh by the phone on every sync. It holds today's targets, the hydration target, every lift's rank (Rookie → Champion, % of lifters beaten, next rank), bests per exercise, and the muscle map (Weak/Average/Strong/Champion/Not sure per muscle). Anything Muse writes here is ignored and replaced.

Never in the file: the sync token and sync state (`coachmusesync*`), the backup token (`coachcloudtoken`), the USDA key (`coachfdckey`), and throwaway caches (Open Food Facts cache, thumbnails, scan diagnostics, local backups, corrupt-day copies, the rest timer, the workout list, which is rebuilt from `workouts`).

Muse **may** change anything in `days`, `weight`, `workouts` and `store`. Bailey wants Muse to have full access. Be careful with targets and the profile: only change them when Bailey asks.

**Merging:** each workout and each store item is compared with the last good sync. Changed on one side only: that side wins. Added on either side: kept. Deleted on one side and untouched on the other: deleted. Changed on both sides: a workout keeps the newer copy (`upd`, then `end`), and a store item keeps the phone's. Settings lists every such case.

Entry fields: an entry is exactly what the phone stored for that food —
name, grams, kcal, protein, carbs, fat, sugar, sat, micros, meal, basis,
qty, unit, plate, supp, perItem — plus two sync fields the phone adds:
`"id"` (a stable id, stamped the first time the entry is saved) and
`"upd"` (milliseconds, when the entry last changed; `"at"` is when it
was logged, today only). Never invent nutrition figures: a food Muse
adds needs real figures from the app's own tables or a real source, the
same rule as the app itself. If the figures are not known, say so
rather than guessing.

## The token (phone side)

- Bailey makes a **fine-grained personal access token** in GitHub:
  Settings → Developer settings → Personal access tokens → Fine-grained
  tokens. Repository access: **only `baileywalsh-maker/coach-sync`**.
  Permissions: **Contents — Read and write** only. Nothing else.
  No expiry is convenient; 90 days is safer — if it expires, sync just
  stops and Settings says the token was not accepted.
- He pastes it into COACH → Settings → Sync with Muse → token field.
- It is stored in the store under `coachmusesync-token` only. It is never
  written into the app code, never included in a backup (both backup
  paths skip every `coachmusesync*` key — a test checks this), and only
  ever sent to `https://api.github.com`. Revoking it in GitHub stops
  syncing instantly.
- This is a **separate token** from the cloud-backup key (which has gist
  scope and cannot write a repo). Do not reuse that key.
- Muse **never sees the token** and must never ask for it. If Bailey says
  sync stopped working, the first thing to check is whether the token
  expired or was revoked — Settings will say "GitHub did not accept the
  token".

## How the phone syncs

- Off by default. Switching it on shows the token box and a Sync now button.
  Status line says Off / no token yet / Last synced … / Last sync failed: …
- **Auto:** on opening the app (2s after load), ~8 seconds after any food,
  water, weight, training-day or complete change, and when the app is
  hidden/closed (best effort).
- **Manual:** Settings → Sync now.
- **Merge (three-way, by day, then by entry id):** the phone keeps a snapshot
  of the days as they were at the last good sync (`coachmusesync` in the
  store). A day changed on one side only is taken from that side. A day
  added on either side is kept. A day deleted on one side and unchanged on
  the other is deleted. A day changed on **both** sides is merged entry by
  entry, with Jot's rules: an entry changed on one side only is taken from
  that side, an entry added on either side is kept, an entry changed on
  both sides keeps the newer copy (`upd`, then `at`) and is listed in
  Settings ("kept the newer copy"). Water changed on both sides keeps the
  larger amount. Training and complete ticks changed on both sides are
  kept if either side ticked them. The weight log merges by date; a date
  weighed on both sides keeps the phone's reading and Settings says so.
  Nothing is ever deleted silently outside that rule.
- **Conflicts with GitHub itself:** if the file changed under the phone
  (HTTP 409 on PUT), the phone re-fetches, re-merges and retries once.
- **Failures are quiet and safe:** no token, bad token (401/403), offline,
  or a bad file all leave the phone's days exactly as they are and say
  so in Settings. A failed sync never wipes local data.

## How Muse adds a food entry / a weigh-in (Muse's instructions)

1. Read the current file from the private repo:
   `get_file_contents` on `baileywalsh-maker/coach-sync`, path `coach-sync.json`.
   If it is a 404, there is nothing synced yet — tell Bailey to open COACH
   and tap Sync now once, then try again. Do **not** invent a file.
2. Decode the base64 content. Keep every day, every entry and every field
   exactly as it is, except the change Bailey asked for. Keep the key
   order of the file as you found it — the phone compares snapshots, and
   a reordered file looks like a change on every day.
3. To **add a food entry** to a day: append to that day's `entries`
   `{ "id": "<uid>", "name": "<Bailey's words>", "grams": <grams>,
   "kcal": <kcal>, "protein": <g>, "carbs": <g>, "fat": <g>,
   "meal": "<Breakfast|Lunch|Dinner|Snack|Supplement>",
   "upd": <now ms>, "at": <now ms> }`. Add `"sugar"`, `"sat"` and
   `"micros"` only when the figures are really known — missing is
   better than invented. Use `uid()` style ids:
   `Date.now().toString(36) + random 5 chars` — never reuse an id, and
   never use an id already in the file. If the day does not exist yet,
   create it as `"YYYY-MM-DD": { "entries": [ … ] }`. Do not touch
   `waterMl`, `complete` or `training` on that day unless Bailey asked.
   A supplement is an entry with `"supp": true` and `"meal": "Supplement"`.
4. To **add a weigh-in**: append `{ "date": "YYYY-MM-DD", "kg": <kg> }`
   to `weight`, or replace the `kg` on that date's entry if one is
   already there. Do not touch the profile — the phone's profile weight
   is Bailey's to change, and the adaptive engine reads the weight log
   directly.
5. To **delete a food entry**: remove that one object from that day's
   `entries` and nothing else. To edit one: change its fields and set
   `upd` to now. Never change another entry's `id` or `upd`.
6. To **log water**: set that day's `waterMl` to the new total in
   millilitres (0 or 100+, never 1–8 — tiny numbers are read as legacy
   glass counts). To tick a training day: set `"training": true` on
   that day. Do not tick a day complete unless Bailey asked — ticking
   it runs his weekly review.
7. Bump `version` by 1, set `updatedAt` to now (ISO), `updatedBy` to
   `"muse"`. Leave `workouts` exactly as it is.
8. Write it back with `create_or_update_file` on the same repo/path,
   passing the `sha` from step 1 and a message like
   `Coach sync: add "Chicken breast" to 2026-11-19`. If the write fails
   with a sha conflict, re-read the file and redo the change on the
   fresh copy — never overwrite blindly.
9. Tell Bailey the entry is synced and that it will appear in COACH the
   next time he opens it (or immediately if COACH is open — the phone
   auto-syncs on open and ~8s after its own edits; it does not poll
   while open, so if COACH is already open, ask him to close and reopen
   it, or tap Sync now in Settings).

## Limits (say these plainly, don't paper over them)

- Sync covers **everything except secrets and caches** (see The file). A
  store item changed on both sides keeps the phone's copy.
- The phone does **not** poll while open. Something Muse adds shows up
  when COACH is next opened, or after a manual Sync now — not live
  while Bailey stares at the app.
- If Bailey edits an entry on the phone and Muse edits the same entry
  before the phone syncs, the newer copy wins and the older edit is
  lost. The phone reports this in Settings; Muse cannot see it happened.
- If two phones ever shared one token, last-write-wins per entry still
  applies, but the snapshot logic assumes one phone. COACH is one phone.
- The token is a bearer credential on the phone: anyone with the phone
  unlocked and the token could read/write the private repo. That is the
  same trust level as the phone itself. Revoke the token if the phone is
  lost.
- Entries restored from a backup get fresh ids and `upd` set to now on
  the next sync. If the same entry is then edited on both sides before
  the phone syncs, the phone's copy looks newer and wins. The conflict
  is still listed in Settings.

## Tests

`node tests/run.js --only musesync --new dist` — checks against a pretend
GitHub (fake `api.github.com` route): off by default, bad token refused
and not kept, first sync uploads every day and the weight log, a Muse
entry pulled on open, a phone entry pushed, a delete propagating both
ways, both-ways conflict keeps newer + is reported, water keeps the
larger amount, token never in a backup. Full suite:
`node tests/run.js --old <last shipped build> --new dist`.


## How Muse adds or edits a workout (v146)

1. Fetch the file fresh (and keep its `sha`).
2. To add one: pick a new id (`Date.now().toString(36)` plus 4 random characters), set `d`, `start` and `end` in ms, `name`, and `ex` with each set marked `done: true`. Set `upd` to now.
3. To edit one: change its sets or name, and set `upd` to now. Never change its `id`.
4. To change a routine, edit `store["coachtrain:routines"]`: `[{id, name, ex: [{n, sets}]}]`.
5. Write the file back with the `sha`. If GitHub says it changed, fetch again and redo the edit.
6. The phone picks it up when COACH is next opened, or after Sync now. Ranks, the muscle map and history update by themselves.
