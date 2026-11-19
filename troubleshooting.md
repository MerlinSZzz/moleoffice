# Troubleshooting

Problems hit while building Mole Office: what each looked like, what caused it, and — where there is
one — what fixed it.

**Why this file exists.** A problem solved and not written down gets solved again. This is the
file you search before spending an afternoon on something. Every entry says what the symptom
looked like, what the cause actually was, and how to tell if it comes back.

One entry per problem. Newest first. Keep the symptom line searchable — write what you would
have typed into a search box while stuck.

**Some entries are OPEN**, marked so on their first line. An open entry is a problem that has been
found and diagnosed and deliberately not fixed yet; it is here rather than in STATE.md because it
has a symptom somebody will hit and search for. Do not read the absence of a fix as an absence of
understanding — the cause is written down. STATE.md lists these too, alongside the outstanding work
that has no symptom.

---

## Home does not show a record changed straight in the database file; a restart brings it in

What it looks like: a record was changed by a program other than the server, such as sqlite3 or a repair
script under scripts/, while the server ran. The record page shows the change, and Home, the flow and the other
attention readings still show the record as it was. A restart of the server shows the change.

The cause: since wave 13y round 167 the attention thread keeps the records the attention rule reads, from one
read to the next. At each read it reads again only the records the change log names since the read before,
and every write the server makes writes a change row. A write made straight into the database file writes no
change row, so the thread does not know the record changed. The thread still reads which records are in the
project at every read, so a record added to the table or taken out of it that way is seen. A record changed
that way is not.

In normal running nothing writes the database file outside the server while it runs. Two programs can, when
they are run by hand on a file a server is serving:
- `npm run db:migrate`, when a data step under src/server/db/ that writes records with no change row has not
  run yet, and nothing in the same run changes the schema. The server never runs those steps itself: it
  refuses to serve a file a migration would still write to, and the stable upgrade stops it before it
  migrates. A merge that restarts the server ends it.
- `npm run db:seed -- --include-fixture`, which dates and stamps records with no change row.

The fix, with no restart: `POST /api/attention/read-everything-again` with the body `{}`. The next attention
read reads every record again, and the server's log says why, in a line that begins "The attention thread
read every record of project". A restart does the same, and a record's next write through the server brings
that record back. An import, or a migration that changes the schema, does it by itself, because each moves
SQLite's schema counter. A data step that only writes rows does not.

How to tell if it comes back: tests/the-kept-attention-records-are-the-whole-read.test.ts runs every write the
server makes to the records table and checks the kept records against a full read after each. A new write that
leaves no change row fails it.

---

## OPEN: the window says "Mole Office did not start, because the copy it runs from is not at the version its last upgrade left", and Check again still says it after the copy was put back

**Open until serve-dev starts the server again by itself when stable's branch or tags change.** That is
the first item after round 12 (decision UaAb_HvfZ-TB). Until then, putting the copy back takes two
steps, and the second is the one that gets forgotten.

**What the sentence means.** The stable office runs from its own clone, on branch stable, at the dated
tag its last upgrade left (`stable-YYYY-MM-DD-…`). The server checks this before it opens the database.
When the check fails, the server exits with code 78 and has touched nothing in the database. serve-dev
does not count that exit as a crash. It starts a stand-in on the office's port instead. The stand-in
answers 503 with the server's sentence, which begins "This server did not start: this checkout is not
at a dated stable tag" and names stable's HEAD.

**Why Check again does not bring it back.** After that refusal, serve-dev starts the server again only
when a file it watches changes. Some put-backs change no working file: `git checkout stable` from a
detached HEAD at the tagged commit, or making a deleted dated tag again. Then nothing serve-dev watches
changes, the stand-in keeps answering, and Check again shows the same sentence. `npm run mole-office
start` refuses a port that a stand-in holds. `npm run mole-office restart` needs the service lock, and
the refused server never took it.

**What to do, as an agent asked to do this.** This stops and starts the office that serves the person,
so read the chapter "The live server and database" first, and act only as it allows. The refusal
carries the first two steps in short after the server's sentence: in serve-dev's log, in the refusal
file and in the stand-in's 503 body (`THE_STABLE_TAG_PUT_BACK` in `src/config/stable-tag.mjs`).
1. In the stable checkout, put branch stable back at the dated tag of its last upgrade.
   `git -C <stable> symbolic-ref HEAD` must say `refs/heads/stable`, and `git -C <stable> tag
   --points-at HEAD` must list a `stable-YYYY-MM-DD-…` tag. Do not run the upgrade instead: it refuses
   unless stable's HEAD is at its baseline tag. Do not move branch stable to any other commit: only the
   upgrade moves it.
2. Stop the stable serve-dev by the process group id recorded when it was started, as the chapter
   "Processes and ports" says. Then start it again in the stable checkout:
   `node tools/serve-dev.mjs --built --prepared`, with MOLE_OFFICE_DEVELOPMENT_CHECKOUT,
   MOLE_OFFICE_DB (absolute), MOLE_OFFICE_PORT and NODE_ENV=production. If no record names that group,
   stop and report up. Do not look for the process by its name.
3. The owner presses Check again. If the copy is still not at a dated tag, the server refuses again in
   the same way, and nothing is touched.

---

## with checks on in merges-only mode, GET /api/worker/queue is slow

Settled asks used to appear again on every checks-only reading. On a database copy with 323 settled
asks, each reading took 10.5 to 11.1 seconds. The run's standing read the whole agent registry twice
for each ask. The reading now shares one registry, judges settlement first and builds the expensive
recipient readings only when needed.

In this mode the worker asks for `?only=checks&markDelivered=1`. After checking what the caller may
read, the office marks settled asks delivered once, with a reason read again from the stored records,
in one transaction.
It names them in `markedDelivered` and leaves them out of `queue`. The next reading does not list
them. A hand call of `?only=checks` keeps its rows and moves no delivery mark. Because it marks nothing,
that hand call builds every settled ask's row in full each time; on the copy it took 0.54 to 0.59
seconds, with health at most 463.4 ms. Holds and deliveries inherited from a copy are preserved.
For quiet asks, the marking form uses the handle door's existing narrower answering reader to
decide the same live-session hold.

On the copy, the first marking reading took 0.366 seconds and marked 323 asks; the next readings
took 0.136 and 0.113 seconds and marked none. Health took at most 210 ms during the first reading,
compared with 28.1 ms at rest. The targets of 0.2 seconds for the first reading and 50 ms for health
are still unmet. The synchronous marking transaction still holds the server, and it stays whole.
This measured result was accepted for this round. The candidate select was then addressed with its
own proof: on the copy its median fell from 74.1 and 93.3 ms to 28.9 and 29.1 ms. It built the list
of every record id of the project and of the message centre on every reading; it now looks one
record up by its id.

A check waiting to start made every marking reading slow. A later copy, of 17 October 2026, brought
337 settled asks and one check waiting to start. With that check, the readings after the first took
0.44 to 0.48 seconds, and health waited up to 475.2 ms during them. With only that check's delivery
marked delivered, in a temporary copy, they took 0.100 and 0.116 seconds. The check's row built the
project's two whole lists of runs on every reading, to decide whether a live session held the check.
A check row now reads only its own agent's runs, with the handle door's narrower reader, and looks up
the run it names by its id. With the check waiting, the readings after the first now take 0.122 to
0.143 seconds, in six readings of three runs. Health waited more than 100 ms in 3 of those 6
readings: 121.2, 130.6 and 122.4 ms. Without the check, on the same code, it waited at most 79.8 and
71.3 ms. Why health waits longer than the reading's 50 ms pause is not known; nobody has measured it.
The first reading, which marks the 337 asks, took 0.71 and 0.78 seconds and now takes 0.40. The hand
call of `?only=checks` is no faster, because its settled-ask rows still build the whole lists. On this
copy it took 0.524 to 0.593 seconds before and 0.535 to 0.571 seconds after.

The worker read every queued delivery and then kept only current check asks and asks of settled runs.
It left other deliveries queued, so their backlog added work to every poll. In a synthetic test office,
2,012 queued rows prepared 2,075 statements; 4,012 prepared 4,080. The per-message hop reading grew with
the backlog, and the whole reading also read the message pool and dead letters.

SQL first keeps messages whose `aboutRun` names
a record of this project whose stored `theCheck.message` is that message. The existing check readers
still decide which rows qualify. The reading keeps their fields, reads the conversation pool only if
the conversation guard needs it, and reads no dead letters. The criterion doubles 2,000 unrelated
deliveries to 4,000 and requires the statement count to hold. The empty queue reading uses at most
two statements. Workers in other modes keep their existing reads.

---

## A check completed its answers without a verdict

The office may ask for one more whole check. The tool asks once for the verdict in its own session.
If that completed answer also gives no verdict, exit 42 lets the message worker report this ending
to the office. The office files a linked ask through the ordinary queue, so the project switch,
hourly cap and 5-hour hold still apply. The earlier ask's delivery names the new ask.

If both whole checks complete without a verdict, the check stays failed and the run stays
inspecting. The office sends its ordinary failure notice and one quiet secretary line naming both
sessions. Nothing starts again by itself. Its starter or a person can use the run's ask-again press
to file a fresh ask. An unfinished check, missing session id, stop or failed start does not use this
automatic repeat. Running the tool by hand does not file an ask either.

---

## Nothing is listening: `ECONNREFUSED 127.0.0.1:8787`, or `curl: (7) Failed to connect`

**Symptom.** Every request fails at once, from `curl`, from an agent, or as a page of failed API
calls in the browser with the UI itself loading fine. The commonest failure there is, and it had no
entry here until 2026-08-12.

**The three causes, in the order they happen.**

1. **No server is running.** `npm run dev` in this directory, or `npm start` if you have run
   `npm run build`. The API says which file it is serving in its first line of output.
2. **The server died and Vite did not.** In `npm run dev` the two halves are separate processes.
   If the server half exits — a refused migration, a bad setting, a port already taken — the browser
   app keeps serving perfectly and only its `/api/` calls fail. The terminal has the reason; look
   above the last few `[vite] http proxy error` lines.
3. **It is running on a different port from the one you are asking.** `MOLE_OFFICE_PORT` moves the API
   and `MOLE_OFFICE_WEB_PORT` moves the browser app, and `.env` is read by both halves.

```bash
ss -ltn | grep -E ':(8787|5173) '        # is anything there at all
curl -s http://127.0.0.1:8787/api/health  # ok, how many records, and WHICH FILE it is serving
```

`GET /api/health` carries `path` on every reply, so it answers "am I talking to the live corpus or a
scratch copy" without reading anyone's terminal.

**Related and different:** a server that answers but with the wrong data is the orphaned-process
entry near the bottom of this file, not this one.

---

## `npm run dev` fails with `Port 5173 is already in use` instead of moving to 5174

**Not a bug, and it was changed on purpose on 2026-08-12.** Vite's default is to take the next free
port and print one line about it. That is wrong for Mole Office, because the browser app is half of a
pair: the app on the unannounced port still proxies `/api/` to `MOLE_OFFICE_PORT`, so a second
`npm run dev` gives you a working-looking UI at an address you did not choose, reading and writing
**the first instance's database**. It was measured doing exactly that.

`server.strictPort` is now on, so it stops instead. Either stop the instance that holds the port, or
give this one its own pair:

```bash
ss -ltnp | grep :5173
MOLE_OFFICE_PORT=8801 MOLE_OFFICE_WEB_PORT=5273 npm run dev
```

The same rule applies to an **empty** setting. `MOLE_OFFICE_PORT=` in `.env` used to stop the server and
leave Vite falling back to 8787 — on a scratch checkout that meant the page came up proxied to the
developer's live corpus. Both halves now refuse it. Unset is different from empty and still means
the default.

---

## The server refuses to start: "REFUSING TO SERVE … it is NOT up to date"

**Date:** 2026-08-12. **This is the fix for the entry below, seen from the front.**

**Symptom:** `npm run dev` or `npm start` exits instead of listening, printing `REFUSING TO SERVE
<file>. It holds N rows of authored work (429 records, 428 links, …), it is NOT up to date, and
bringing it up to date would write to it.` Under `tsx watch` it will do this again on every save
until the database is migrated. The tables in the brackets are every authored table with a row in
it, so a database holding only a plan — drafts, capacity, allocations and no records at all — is
protected exactly like one holding records.

**Cause:** the database has a pending migration and a server start will not run one against a
database that holds work. The message lists what a migration would write — the schema files by
name, and each data migration by what it would move — and ends with the command.

**Fix:** run it yourself, having taken a copy. The message names the exact line. For the default
database it is

```bash
npm run db:backup && MOLE_OFFICE_DB=data/mole-office.db npm run db:migrate
```

Then start the server again. `npm run db:migrate` prints the whole report, including everything the
migrations refuse to guess at, which the refusal deliberately does not repeat.

**If you did not expect a pending migration**, the likelier explanation is that the server is
pointed at a database it should not be — a colleague's file, an old copy, a `MOLE_OFFICE_DB` left over
in the environment. The message names the file it is refusing. Check that first; migrating the
wrong database is the mistake this refusal exists to make expensive.

---

## Starting the server applied a migration to the live database and nobody asked for it

**Date:** 2026-08-11. **FIXED 2026-08-12** — see the entry above for what you see now.

**Symptom:** the database file (`data/mole-office.db` by default; `data/panelx.db` in an office made
before 30 September 2026) changes checksum and its schema changes, with no migration command run
by anybody. `sqlite3 data/mole-office.db "select count(*) from __drizzle_migrations"` returns a bigger
number than it did yesterday. In the instance that produced this entry, `0004` — a migration that
**rebuilds three tables and copies every row** — went from "has only ever run against byte copies"
to applied on the only copy of the live database, between one reading of `STATE.md` and the next.

**Cause:** `src/server/index.ts` called `migrate()` unconditionally at every start. There was no
flag, no prompt and no dry run. So *starting a server* was a schema write. The live database sat one
migration behind for eleven hours purely because the process holding 8787 had started before the
migration file was written; when somebody restarted that process at 02:15 on 11 August, in this
directory with `MOLE_OFFICE_DB` unset, the pending migration ran.

**It then happened again, worse, and that is what forced the fix.** The first repair made the boot
path call `migrateInPlace` — the same function `npm run db:migrate` calls — so that starting the
server and running the command could not disagree about what "migrated" means. That was right about
half-migration and wrong about this: `npm run dev` runs the server under `tsx watch`, so **every
save of a server file restarts it**, and each restart ran the migrations again. A dev server left
running against the live corpus overnight ran the workspace migration — which **moves 394 records
into three projects** — unattended, triggered by a file save, with nobody watching and no backup
taken at that moment. Nothing was lost. That was luck.

**How to tell it is about to happen:** compare the rows in `__drizzle_migrations` against the files
in `drizzle/`, on a read-only copy, before you start anything:

```bash
sqlite3 data/mole-office.db ".backup /tmp/check.db"
sqlite3 -readonly /tmp/check.db "select count(*) from __drizzle_migrations;"
ls drizzle/*.sql | wc -l
```

If the second number is larger, the database is behind. **The server will now say so itself and
refuse to start**, so this check is a way to find out before you try rather than a way to avoid an
accident.

**Fixed** in `prepareToServe` in `src/server/db/migrate.ts`, which the boot path calls instead of
migrating:

- a database holding **nothing anybody would miss** is migrated on the way up exactly as before, so
  a fresh clone, a test's scratch file and the seeded database `tools/review.mjs` photographs all
  still come up with nothing run first. Two ways to hold nothing, both of them facts the database
  states about itself: no records, links or changes at all, or every record stamped `fixture`, which
  is what `records.origin` calls a row that came out of the seed;
- any other database is **checked and never written to**. The real migrations are run
  against a throwaway copy held in memory and the copy is compared with the image it was made from.
  If anything at all would be written, the server refuses to serve and names the command; if nothing
  would be, it serves and says so in one line.

**Why any pending write refuses, and not only a row-moving one.** Nothing can tell what a pending
migration does without running it: `0004` is a generated *schema* file and it rebuilds three tables
and copies every row through them. Reading the SQL and guessing would be the substitution CLAUDE.md
rule 2 forbids, so the uncertain case is treated as the dangerous one.
`design/DECISIONS-PENDING.md` §13 is about `0004` in particular and is untouched by this; this entry
is about the mechanism.

**Found while building the check, and OPEN: `scripts/reset.ts` migrates differently from everything
else.** It calls drizzle's `migrate()` directly — the same half-migration that was removed from
`src/server/index.ts` above — so a database from `npm run db:reset` has the schema files applied and
none of the four data migrations. The visible symptom is that its `workspaces` table is EMPTY: not
even the `default` row every other row in the file refers to. The check caught it immediately, by
refusing to serve the database `tools/review.mjs` had just seeded. The one-line fix is for
`scripts/reset.ts` to call `migrateInPlace` like the other two callers; until somebody makes it, the
gap is closed on the way past by the boot path, which migrates a seeded database because every
record in it says it came from the seed.

---

## The API told me to send `step:<id>` and then answered 400 when I did

**Date:** 2026-08-11. **OPEN — found, not fixed, and a test holds it in place.**

**Symptom:** `PUT /api/presentation/pipeline:<id>/nodes/step:<block id>` → **400**: *"`step:…` is the
old way of naming a pipeline step, from before a block was a record."* The caller is following the
sentence `GET /api` serves for that very endpoint, which says `:target` is "a record id, or
`step:<step id>` for a step inside a pipeline's own scope".

**Cause:** `step:` was retired deliberately when a block became a record — a block is addressed by
its record id like everything else on the drawing, and the prefix survives only as
`RETIRED_STEP_PREFIX` in `src/server/lib/presentation.ts:103`, for reading targets a person typed
before the migration. **The behaviour is right; three published strings did not follow it**:
`src/server/api/presentation.ts:14`, `:147` (the URL-schema refusal) and `:420` (the served note).

**What to send instead:** the block's own record id. `.../nodes/<block id>` → 200.

**Not fixed, and note why it is not a one-line fix:** `tests/kinds-api.test.ts:479` asserts the
served note *contains* `step:<step id>`, so the suite pins the wrong sentence. The note and the test
have to move together.

---

## `POST /api/import` says it takes no body, and ignored the one I sent

**Date:** 2026-08-11. **OPEN — found, not fixed.**

**Symptom:** `POST /api/export {"x":1}` → 200, files written. `POST /api/import {"x":1}` → 200,
`applied: true`, every authored row replaced. Both endpoints' published sentences say **"Takes NO
BODY."** Compare `POST /api/source/reindex {"anything":1}` → **400**, quoting the key it was sent.

**Cause:** the two export/import routes declare no body schema and never look at the request body,
so an unexpected one is dropped rather than refused. `reindex` calls the check the other two do not.

**Why it matters even though the body does nothing:** the two routes that ignore a body are the two
that rewrite everything, and this project's own house rule is that nothing is silently ignored. A
caller that sends `{"dryRun":true}` to `POST /api/import` — a plausible guess, since
`POST /api/sessions/discover` takes exactly that — gets a full destructive import and a 200.

**Not fixed.** The fix is the same refusal `reindex` already uses, declared beside the two routes in
`src/server/api/export.ts` and `src/server/api/import.ts`.

---

## I stored a chart and nothing ever draws it

**Date:** 2026-08-11. **OPEN — found, not fixed.**

**Symptom:** a chart object written into `data.extra` — on any kind — is answered **201** with
`incomplete: []`, is stored exactly as sent, and appears on no page. The `ChartBlock` description
served by `GET /api/kinds` says the opposite: a chart "belongs in a module's `summaryBlocks` and
nowhere else: written into any other key it is **refused, not stored**."

**Cause:** `extra` is checked as an object and no further, on purpose — it is the declared place for
anything the schema has no field for, and validating its contents would defeat it. So the ChartBlock
sentence is true of every *declared* field and false of the one field every kind declares. The
outcome it promises cannot happen — content filed where nothing will ever draw it — is what happens.

**What to do meanwhile:** a chart goes in a `module`'s `data.summaryBlocks`. Nothing else draws one.

**Not fixed.** The sentence is what should change, at `src/shared/kinds.ts:553`: the honest claim is
that nothing outside `summaryBlocks` is ever *drawn*, not that nothing outside it is *stored*.

---

## Anything that can reach the port can replace the whole database with one empty POST

**Date:** 2026-08-11. **FIXED the same day.** Found by an agent attacking the product from outside,
not by the suite and not by reading the file.

**Symptom:** every record, every link and every change row in the database is suddenly the content
of the `mirror/` directory beside it, including the `decision` records an agent is refused, and
**the change log says nobody did it**. There is no row recording the rewrite and no actor on it,
because an import deliberately writes no history — measured 2026-08-11 on a scratch copy: 1,053
change rows before `POST /api/import`, 1,053 after. So the only trace is that the content moved.
The archive is Markdown on disk, so whatever anything could edit there is what the database becomes.

Reproduce it on a scratch copy, on the build before the fix:

```bash
curl -X POST localhost:<scratch port>/api/import -H 'x-mole-office-actor-type: agent'
# 200. Every authored table replaced. No 403, no change row, no actor.
```

**Cause:** `POST /api/import` never read an actor. The handler's first parameter was named `_req`
and the underscore said, correctly, that nothing in the request was used — so from inside the file
nothing looked wrong. A route that never mentions an actor reads like a route that has nothing to
do with actors.

**Why it mattered more than the guards that were being added at the same time.** In the same week
this project closed the human-only rule on `deleteRecord` and on `restoreRecord`, on the correct
argument that an agent deleting a `decision` is an agent changing it. All of that is worth nothing
while one unauthenticated POST rewrites the same rows wholesale. **When you add an access control,
enumerate every route that can write the rows it protects, not every route that mentions the rule.**

**The fix.** The route reads the actor and calls `assertMayWrite`, the same guard `POST /api/records`
and `PATCH` use, so the refusal cannot drift from the rule or from its wording. The guard is at HTTP
and deliberately NOT in `applyImport()`: `scripts/import.ts` and `scripts/restore-check.ts` call the
library directly and must keep working, because they are run by an operator who already holds the
database file. See explore.md, *Where the import is guarded — at HTTP, or in the library*.

**How to tell it is back:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:<scratch port>/api/import \
  -H 'x-mole-office-actor-type: agent'      # must be 403
```

Measured on 2026-08-11: `agent` → 403 with the note-and-link workaround printed. **With no actor
headers at all it still applies**, because absence is read as the human everywhere in this product;
that is the deliberate hole described in explore.md under *Authentication now, or attribution and a
loopback bind*, not a second bug.

---

## A write is filed as the person because a header was sent empty

**Date:** 2026-08-11. **FIXED the same day.**

**Symptom:** an agent's writes are attributed to `human`, the person, in the change log even though the
agent sets `x-mole-office-actor-type` on every request. `GET /api/changes` shows the agent's own rows
under the human's name, and a `decision` POST the agent expected a 403 for comes back 201.

**Cause:** the header was sent, and sent EMPTY. A client building headers from a template fills a
variable that is not set and produces `x-mole-office-actor-type:` with nothing after it. `actorFrom`
tested the value for truthiness, so an empty string took the same branch as a missing header and
was promoted to `human`. A misspelt value (`agnet`) had been refused with a 400 for a week; an
empty one was not, and empty is the one a script produces by accident.

**The fix.** All three headers — `x-mole-office-actor-type`, `x-mole-office-actor-id` and `x-mole-office-session` —
refuse a present-but-blank value with a 400 that says why: a header that is present and blank is
refused rather than read as absence. Sending no header at all is still the person typing by hand.

**How to tell it is back:** send the header with an empty value and read the status.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:<scratch port>/api/records \
  -H 'content-type: application/json' -H 'x-mole-office-actor-type;' \
  -d '{"kind":"note","title":"blank header probe","data":{}}'    # must be 400, not 201
```

`-H 'x-mole-office-actor-type;'` is curl's spelling for "send this header with an empty value"; the more
obvious `-H 'x-mole-office-actor-type:'` tells curl to REMOVE the header, which tests absence instead and
is correctly a 201. Getting that wrong is why this was missed by hand-testing.

---

## Two agents ticked the same module's checklist and one of them lost everything it wrote

**Date:** 2026-08-11. **FIXED the same day.** Measured, not theorised: zero of four items survived.

**Symptom:** a module's checklist holds four lines that are not the four you wrote. Your write was
answered 200 and appended change rows, and the lines it replaced belonged to somebody else. Or, in
the reverse direction, lines you added minutes ago are simply gone and nothing in the change log
looks like an error.

```
item ids BEFORE: ['utc-defaults', 'panel-layouts', 'summary-comment']
item ids AFTER : ['sc-1', 'sc-2', 'sc-3', 'sc-4']
survived: []
```

**Cause:** a lost update, and the ordinary one. `data.parts` is an array, and `dataPatch` merges key
by key but replaces an array whole, so ticking one line meant reading the record, rewriting the
whole array and PATCHing all of `data` back. Two agents that read the same module a minute apart
each rewrote the array from what IT had read, and the second write won silently. Nothing about
either request was malformed, so nothing refused it. Parallel agents are what this product is FOR,
so this is not a rare case.

**The fix, and it is three routes rather than one guard.**

- **To ADD a line:** `POST /api/records/<id>/checklist` with `{"partId":…,"id":…,"text":…,"state":…}`.
  It carries one line, so a caller that has not read the checklist cannot overwrite the lines it has
  not seen.
- **To CHANGE a line:** `PATCH /api/records/<id>/checklist/<itemId>`, which was already there. Its
  body is the item's own keys and nothing else — `ifVersion` is not one of them and is refused with
  the list of keys a `ProgressItem` takes.
- **To REMOVE a line, or to rewrite `data` wholesale at all:** a `data` write that drops checklist
  lines the record holds right now is refused with a 400 naming each dropped id, unless it carries
  `{"ifVersion":"<the version the read handed you>"}`. `version` comes back on
  `GET /api/records/:id` and on every 201 and 200. A stale one is a 409 saying what the version is
  now; nothing is written in either case.

**How to tell it is back:** take a module with a checklist and send a `data` that leaves the
checklist out, with no `ifVersion`.

```bash
curl -s -X PATCH localhost:<scratch port>/api/records/<a module with parts> \
  -H 'content-type: application/json' -d '{"data":{"context":"probe"}}'
# must be 400 naming the dropped item ids, not 200
```

**Note the shape of the fix, because it is the one this repository keeps arriving at.** The guard is
not "warn about concurrent edits". It is a route that cannot express the dangerous write, plus a
compare-and-set for the case where the dangerous write is what you actually mean.

---

## A pipeline I just created lists blocks that do not exist, and now a block cannot be deleted at all

**Date:** 2026-08-11. **OPEN — found, not fixed.** Found by an adversarial pass against the
documentation, which copied the product's own published example and was answered 201.

**Symptom:** any of these, and they do not look like the same bug:

- a pipeline you created draws nothing, though `data.blockIds` reads back with every id you sent and
  `GET /api/records/<id>` reports it `"incomplete": []` — measured 2026-08-11, a pipeline whose
  `blockIds` name nothing reads back complete;
- `DELETE /api/records/<pipeline>/blocks/<block>` answers 400 and tells you to send the same request
  against a DIFFERENT pipeline — and that one answers 400 and sends you back;
- `DELETE /api/records/<block id>` refuses for the same reason, so no route in the product can
  remove the record.

**Cause:** `GET /api/kinds/pipeline` publishes three rules about `blockIds` and the create path
enforces one of them. Measured on 2026-08-11:

| rule | `POST /api/records` | `PATCH /api/records/:id` |
|---|---|---|
| 1 · every id names a live `block` record | **201, stored** | 400 |
| 2 · no id appears twice | 400 | 400 |
| 3 · no block is listed by two pipelines | **201, stored** | 400 |

`checkBlockIds` in `src/server/lib/records.ts` implements all three correctly, and `grep -n
checkBlockIds` gives the definition and exactly one call, inside `patchRecord`. Neither
`createRecordWithReport` nor `createRecord` calls it. The duplicate check that does fire on create is
a separate implementation living in the field spec in `src/shared/kinds.ts` — which is why exactly
one of the three survives the create path.

The undeletable block follows from rule 3. Three ordinary requests produce it:

```
POST /api/records {"kind":"pipeline","title":"X","data":{"blockIds":[]}}      -> X
POST /api/records/X/blocks {"name":"alpha","state":"todo"}                    -> the block
POST /api/records {"kind":"pipeline","title":"Y","data":{"blockIds":["<the block>"]}}   -> 201
```

Each delete route now refuses because *the other* pipeline's order still lists the block, and names
that other pipeline in the refusal. Both refusals are correct; together they are a cycle.

**Not fixed.** The behaviour is what is wrong, not the rules — the rules are right and the refusals
`PATCH` produces are good sentences. `POST /api/records` should call `checkBlockIds` for
`kind === 'pipeline'` the way `patchRecord` does. Until it does, the comment above `checkBlockIds`
saying "an id nothing holds now refuses the write" is true of one write path and not of the other.

**The way out today**, if you are stuck with the cycle: `PATCH` one of the two pipelines with a
`dataPatch` whose `blockIds` leaves the shared block out, then delete it through the pipeline that
still holds it. Measured 2026-08-11 — the PATCH is a 200 and the delete that had been refusing is
then a 200. It works because `PATCH` enforces all three rules, so the pipeline you edit has to be
left in a state that is legal, which is the whole difference between the two paths.

**How to tell it is still here:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:<scratch port>/api/records \
  -H 'content-type: application/json' \
  -d '{"kind":"pipeline","title":"phantom probe","data":{"blockIds":["no-such-block"]}}'
# 400 means it has been fixed. 201 means this entry is still live.
```

---

## A session shows as Unassigned and nothing in the API says how to place it

**Date:** 2026-08-11. **FIXED the same day.** All seven agents that used PanelX (the product's name
then) during the dogfood hit this; five read the browser source to work it out, and the one that did
not has its session filed under the wrong module.

**Symptom:** an agent files a `session` record, does a day's work through the API, and the run still
appears under "Unassigned" on the sessions page. `GET /api/sessions` gave a list of sessions and no
statement of what puts a run under a project, so there was nothing to read except
`src/web/components/SessionPanel.tsx` — and an agent that has been told to use the API instead of the
source has no reason to look there.

**Cause:** the rule ran only in the browser. The server returned the sessions and the browser decided
where each one belonged, so the answer existed but was not published. Writing was fully discoverable
from `GET /api` and `GET /api/kinds`; reading your own work back was not.

**The fix — it is served now, on the endpoint that was already being read.** `GET /api/sessions`
carries:

- `placementRule` — the rule itself, in four sentences, on every reply;
- `placementRead` — what that rule had to read to answer;
- `placement` on every row — the one pipeline or module the run is filed under, the evidence that put
  it there, everything else it reaches under `also`, and a sentence naming the chain so it can be
  argued with.

A run nothing places is `{"kind":"unassigned"}` **with the reason and with `howToPlace`**: the
copy-ready `POST /api/sessions/:id/link` that would file it. That is an answer rather than a gap.

**What actually places a run**, since this is the question people search for: a typed link from the
session record to a pipeline or module; or a link to a BLOCK, which files the run under the pipeline
holding that block; or a write in the change log to any of those; or a write to a record that is
itself linked to one. Strongest evidence wins, ties break on how many links or records support the
claim. **Nothing reads the run's name.** Naming your run after a pipeline does not place it under
that pipeline and never did — that is the specific expectation that put one dogfood session under
the wrong module.

**How to tell it is back:** `GET /api/sessions` with no `placementRule` on the reply, or rows with no
`placement` key. Verified 2026-08-11: linking an unplaced session to a pipeline moved its row from
`{"kind":"unassigned"}` to `{"kind":"in"}` naming that pipeline, in the reply to the link request
itself.

---

## Every relative time is wrong by the machine's timezone offset, and anything under an hour old says "just now"

**Date:** 2026-08-09. **FIXED the same day.** Found by the design exploration, not by a test — and
not by any of the 1,129 tests that were passing while it was live.

**Symptom:** `relativeTime` understates every age by the machine's offset from UTC. On the machine
where it was found, which was on British Summer Time and so one hour ahead, a change made 90 minutes ago reads
**"30m ago"**, one made 150 minutes ago reads "2h ago", and **everything from 0 to 59 minutes old
reads "just now"** — because the computed age is negative and negative is less than the 45-second
threshold.

Reproduce it without starting anything:

```js
// stored by localStamp, read by parseStamp
const written = '2026-08-09 00:30:05'   // 20 minutes ago, local
new Date(written.replace(' ', 'T') + 'Z')   // -> 01:30 local. One hour in the future.
```

**Cause:** The two halves disagree about what a stored stamp means, and nothing makes them agree.
`localStamp` in `src/server/lib/records.ts:92` writes **local** time — it uses `getFullYear`,
`getHours` and so on, deliberately, because a day has to mean the operator's day. `parseStamp` in
`src/web/components/ui.tsx:1044` reads that same string and appends **`Z`**, which tells JavaScript
it is UTC. So every stamp is read as though the operator lived in Greenwich.

This is the defect this codebase keeps producing, in its purest form: two places that must agree,
with nothing making them agree, and no test failing when they do not. It is invisible on a machine
running in UTC, which is why it survived. See explore.md, *The defect this codebase keeps
producing*.

**Why it matters more than an hour's error suggests.** The product exists to stop a session that has
been waiting for an answer from looking like one that is busy. A session idle for fifty minutes
currently reads "just now". That is the exact silence the design is supposed to remove, produced by
the interface itself.

**The fix.** Not "correct the seventh copy" — there is now only one copy. `src/shared/time.ts` holds
the writer and the reader together, and everything else derives from it: `records.ts` re-exports
`localStamp`, `attention.ts` re-exports `parseLocalStamp`, `SessionPanel.tsx` is one line,
`ui.tsx`'s `parseStamp` calls it, the three server readers are one line each, and `kinds.ts` builds
its date validator from the same exported grammar so the validator and the parser cannot disagree
about what a date looks like.

**Two things worth knowing about why it survived.**

*The test suite could not have caught it.* All 1,129 tests ran in the machine's own timezone, and
at offset zero local and UTC are identical, so a test that writes a stamp and reads it back agrees
with itself perfectly. `tests/time.test.ts` now runs every check in six zones — UTC, `Europe/London`
(+1), `America/New_York` (−4, where the failure is the opposite sign and hides better),
`Asia/Kolkata` (+5:30) and `Australia/Eucla` (+8:45) for offsets that are not whole hours, and
`Pacific/Kiritimati` (+14), where a UTC misreading moves the DATE rather than the hour. Reverting
the one-line fix turns five of those tests red, and the failure message names the zone.

*A test was asserting the bug was correct.* `tests/ui.test.ts` had one titled **"reads the server's
UTC stamp as UTC, not as local time"**. The server has never written UTC stamps. So the single test
covering this function agreed with the mistake, and it too passed either way on a UTC machine. It
has been replaced with one that asserts wall-clock fields, which mean the same thing in every zone,
and the old version is quoted in place with why it was wrong. **When a defect survives a suite this
large, check whether a test is holding it there.**

**How to tell it is back:** run the snippet above, or `TZ=Asia/Kolkata npx vitest run tests/time.test.ts`.
The whole suite also passes under `TZ=Asia/Kolkata`, `TZ=Pacific/Kiritimati` and `TZ=UTC`, which is
worth re-running after anything that touches dates.

---

## A change row on a record page shows raw JSON with a line through it, instead of a diff

**Date:** 2026-08-08. **FIXED 2026-08-10.** This entry was still marked OPEN on 2026-08-11, three
days after the fix landed, which is why it is left here rather than deleted: a stale OPEN sends the
next reader to build something that exists.

**Symptom:** On a record page, under *Recent changes*, a row that changed a record's `data` rendered
the whole JSON payload as one long string with a strikethrough through the old value. Where a reader
expects "context: A → B" they got the entire object, twice.

**Cause:** The change log rendered before/after values as text, and `data` is an object. Text
rendering plus `.chg-old { text-decoration: line-through }` (`src/web/components/ChangeLog.tsx`) is
right for a title or a summary, where the old and new values are short strings. For `data` it was
technically honest and unreadable, which is the same failure the write path exists to prevent at
the other end — a record that *looks* filed but renders as raw JSON.

**The fix.** `diffValues` in `src/web/components/ChangeLog.tsx:336` compares two decoded values and
reports only what differs, deepest name first: two plain objects key by key, two arrays paired by id
rather than by position, anything else as a whole. Three answers are kept apart on purpose — an
absent key is not a null (`:214`), and an empty diff means "both read, nothing differs" and is drawn
as that rather than as nothing (`:332`). Drawn from `RecordPage.tsx:758`, covered by
`tests/record-page.test.ts`.

**How to tell it is back:** change a record's `data` and look at its page. You should see one line
per changed key, not the object twice.

---

## The sessions PAGE is 13,914px tall, and 34,296px on a phone

**Date:** 2026-08-08. **FIXED.** Confirmed fixed on 2026-08-10 by the stages audit and re-checked
by reading the code and the pictures. This entry was marked OPEN for two days after it stopped
being true.

**Symptom:** `/sessions` scrolled for a very long time. Measured by `node tools/review.mjs`:
13,914px at 1440 and 34,296px at 390. The number was never fixed — it was however many sessions
and unclaimed processes the machine happened to have when you looked.

**Cause:** The page rendered every unclaimed process on the machine, with no cap. The home page's
Sessions **panel** did cap — it stopped at a row limit and showed a tally counting all of them —
but that cap lived in the panel, and the page was a second place that rendered the same content
under a different rule. Two places that must agree with nothing making them agree; see explore.md,
*The defect this codebase keeps producing*.

**The fix, and it is the one the entry asked for.** There is now one component. `MachineSurface`
in `src/web/components/SessionPanel.tsx` groups the sweep by holding process and cuts the list at
`MACHINE_HOLDERS_SHOWN`, and both readers draw it: the page at
`src/web/pages/SessionsPage.tsx:345` (re-checked 2026-08-11) and the home preview. So the "second place under a different
rule" no longer exists — the rule is written once and used twice, rather than capped twice.

**Where it stands now:** `tools/review/sessions-1440-light.png` measures 1440×2,911 and
`sessions-390-light.png` measures 390×6,524, read from the PNG headers on 2026-08-10.

**Read those two numbers carefully, because they are not the evidence.** The height of this page
is set by how many processes the machine is holding at the moment the picture is taken, so a small
number could just mean a quiet machine. The code is the evidence: one capped component with two
callers. If you want to check it yourself, read `MachineSurface` rather than re-running the
screenshots.

**How to tell it is back:** a second component that renders unclaimed processes. Five figures in
`node tools/review.mjs` is the symptom, not the test.

---

## A session reference that is the id of the wrong kind of record binds as a run name and never resolves

**Date:** 2026-08-08. **OPEN — found, not fixed.**

**Symptom:** An agent sends `x-mole-office-session: <some record id>` and files a session record. It gets
a 201, and a `sessionBinding` saying the name was claimed. From then on nothing joins up:
`GET /api/sessions/:id` shows no work for the session, and `GET /api/changes` reports the rows as
stored-by-name forever. Running the discovery migration does not repoint them.

**Cause:** The id sent was a real record id — of a **note**, or a **module**, or anything that is not
a `session`. `resolveSessionRef` (`src/server/lib/records.ts`) correctly refuses it: an id of the
wrong kind resolves to `matchedBy: 'unresolved'`, `recordId: null`, with a `why` sentence saying so.
But `createRecordWithReport`, further down the same file, only asks two questions of that result —
was it matched by record id, and is its `recordId` non-null. A wrong-kind id answers no to both, so
it falls into the final branch, which treats the reference as an unclaimed **run name** and binds it.
The binding can never take effect: the next `resolveSessionRef` for that string hits the wrong-kind
check first, before it ever looks at bound names, and returns unresolved again. The reference is
bound and unresolvable at the same time, and both the 201 and the binding report read as success.

**Not fixed.** The shape of the fix is to distinguish the two "unresolved" results — nothing answers
to this string, versus this string is an id of the wrong kind — and refuse the second rather than
bind it. The refusal message already exists; it is `why` on the resolved reference, and it names the
kind and title of what was found.

**Re-measured 2026-08-11, and the entry above was missing the half that costs the afternoon: IT
WORKS UNTIL YOU RESTART THE SERVER.** `resolveSessionRef` consults an in-process cache
(`resolvedSessions`) BEFORE it reaches the wrong-kind check, and the binding writes into that cache.
So for the life of the process that made the binding, everything looks right — the name resolves,
`matchedBy` is `name`, `storedByName` is 0, rows join to the record. Restart the server and the same
reference answers `matchedBy: 'unresolved'` with 0 rows, because the cache is empty and the
wrong-kind check now runs first. Measured, same database, two processes:

```
before restart:  GET /api/changes?session=<the note id>   2 rows, matchedBy name,       recordId set
after  restart:  GET /api/changes?session=<the note id>   0 rows, matchedBy unresolved, recordId null
                 GET /api/changes?session=<the session record id>   3 rows, matchedBy recordId
```

So this reads as intermittent, and it is not: a run that tests its own attribution passes, and the
next agent to look finds nothing. **Two more things measured at the same time.** The binding is
STORED and not only cached — `GET /api/sessions/<the session record>` still reports the name under
`names` — so the record claims a name the resolver will not honour. And
`POST /api/sessions/discover {"dryRun":true}` lists that name under `dangling` with the reason *"no
session record ... has ever been bound to that name"*, which is false; it is the same wrong-kind
check answering, one layer further out. Work already repointed stays reachable by the session
record's id; anything written under the reference after the restart is orphaned again.

**How to tell it is back / still here:** POST a session record with `x-mole-office-session` set to the id
of a note. The reply claims a binding. **Then restart the server before you believe it** — that is
the step that shows the defect, and its absence is why this entry described the symptom wrongly for
three days.

---

## An orphaned server holds the port and serves stale data — it once caused a wrong diagnosis

**Date:** 2026-08-07. Fourth occurrence. This entry replaces a shorter one that only described
the port being held, which is the harmless half of the problem.

**Symptom:** any of these, and they do not look like the same bug:

- you killed the server, saw `Terminated`, and port 8787 is still in use;
- a start fails with `EADDRINUSE`, or worse, succeeds and talks to something you did not start;
- `npm run db:reset` runs cleanly and the API still returns the old records;
- a record you just wrote reads back with fields missing, or is not there at all.

**Cause:** two mechanisms that combine into something much more confusing than either.

1. `npx tsx` does the work in a child process. Killing the parent leaves the child listening —
   `ss -ltnp | grep ':8787 '` shows a `node` whose parent is gone.
2. SQLite holds its file by open descriptor, not by name. An orphan started before a
   `db:reset` keeps reading and writing the **deleted** database file for as long as it lives.
   The file on disk is new; the process is answering out of the old inode, and nothing about
   its replies looks unusual.

**The occurrence that cost the most.** An orphan from an earlier run held a deleted
`data/panelx.db` and owned the port. Records written through the API came back missing fields,
consistently and repeatably. The conclusion drawn — written down, and acted on — was that the
API was dropping fields on write. It was not. There were two databases and two servers: writes
went to one process and reads were served by the other. Nothing measured against a server you
did not just start yourself is evidence.

**Confirm it in two commands.** Who is really on the port, and whether their database still
exists:

```bash
ss -ltnp | grep ':8787 '                       # a pid you did not start is the answer
ls -l /proc/<pid>/fd | grep -i '\.db.*deleted'
```

Reproduced deliberately on 2026-08-07 to check that second command is worth typing: with the
database file removed under a running server, `/api/health` went on reporting `51` records and
the descriptor read `/tmp/panelx_docs_audit.db (deleted)`. SQLite keeps three — `.db`, `.db-wal`
and `.db-shm` — so a stale write can survive in the WAL too.

**Fix.** Start it in its own process group, kill the group rather than the process, and verify
that the port is free before believing anything:

```bash
setsid npx tsx src/server/index.ts > /tmp/mole-office.log 2>&1 < /dev/null &
# later:
pid=$(ss -ltnp | grep ':8787 ' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
kill -TERM -$(ps -o pgid= -p "$pid" | tr -d ' ')
ss -ltn | grep 8787          # must print nothing before you say you stopped it
```

Two habits that make the failure impossible rather than merely detectable. When you are testing
something, start on a port nobody else could be using and point `MOLE_OFFICE_DB` at a scratch copy —
then an orphan of yours cannot be mistaken for the real server, and cannot corrupt the real
database. And never clean up with `pkill -f "tsx src/server/index.ts"`; see the entry below, it
matches the shell running it.

**What instructions cannot fix.** The cleanup step is at the end of a response, and an agent
that is interrupted, runs out of context, or fails mid-response never reaches it. All four
occurrences happened with the rule already written down — the rule is not the weak part, the
ending is. So make it the *first* step of the next session instead of the last step of this one:

```bash
ss -ltn | grep -E ':(8787|5173) '   # before starting anything at all
```

**How to tell it is back:** results that change depending on which process answered — a reset
that does not reset, a field that vanishes on read, a count that disagrees with the UI.

**Note:** This is the same class of problem as a simulation left idle for eleven days on a
development machine, and exactly what the resource ledger (stage E6) is meant to catch. It has now happened
four times while building the tool designed to catch it, which is a fair measure of how easy it
is to miss.

---

## `npx tsc --noEmit` fails on the config before compiling anything

**Date:** 2026-08-07
**Symptom:** `error TS5102: Option 'baseUrl' has been removed` and
`error TS5090: Non-relative paths are not allowed`. No source file errors shown at all,
because the compiler stops at the config.

**Cause:** TypeScript 7 removed `baseUrl` and now rejects non-relative values in `paths`.
Most tutorials and older projects still show the old form.

**Fix:** Delete the `baseUrl` line and make path targets relative:
```json
"paths": { "@shared/*": ["./src/shared/*"] }
```

**How to tell it is back:** Type-check errors that name `tsconfig.json` rather than a source file.

---

## `npm run dev` shows a blank page, no errors in the terminal

**Date:** 2026-08-07
**Symptom:** Vite starts, the server starts, the browser shows nothing. The network tab shows
`/api.ts` returning 404 from the API server.

**Cause:** Vite matches proxy keys by prefix. The key `'/api'` also matched the browser app's own
module at `/api.ts`, so Vite forwarded the app's own source file to Fastify, which had no such
route. The app then never loaded.

**Fix:** Add a trailing slash to the proxy key: `'/api/'`. Real API calls still match.

**How to tell it is back:** Blank page in development while the production build works.

---

## Playwright will not launch: "Please run npx playwright install"

**Date:** 2026-08-07
**Symptom:** Screenshot script fails even though a chromium build exists in
`~/.cache/ms-playwright`.

**Cause:** Playwright pins an exact browser build per version. Cached browsers from a different
Playwright version are not used.

**Fix:** `npx playwright install chromium` after installing or upgrading Playwright.

---

## `pkill -f "tsx src/server/index.ts"` kills the shell running it

**Date:** 2026-08-07
**Symptom:** Command exits with code 144 and does nothing.

**Cause:** `pkill -f` matches against full command lines, including the command line of the
shell that is running the `pkill` itself, because the pattern appears in it.

**Fix:** Find the process by the port it holds rather than by a name that matches your own
command line.
