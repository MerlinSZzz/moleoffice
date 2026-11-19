# Lines to apply by hand — checkpoint 2, server

Two files below are owned by other agents this phase, so the edits are written out here instead
of being made. Each one gives the **file**, the **anchor line** to put it after, and the
**line number as of the version I read** (2026-08-07 19:20). Trust the anchor text over the
number: another agent may have moved things.

## Status, 2026-08-08 — READ THIS BEFORE THE REST

This is a plan, and most of it has been carried out. A plan that goes on describing work as
pending after it has been done is the same defect as a stale comment, and it is more expensive,
because this is the file the next agent reads to find out what is left.

| Section | State |
|---|---|
| 1. register the layout routes | **applied** — `src/server/index.ts` registers `layoutRoutes` |
| 2. check summary blocks at write time | **applied, in a better place** — the gate went into `src/server/lib/validate.ts`, which every write already goes through, rather than into the route. `records.ts` calls `validateRecordData`, which calls `checkModuleSummary`. |
| 3. what the new endpoints do | reference, nothing to apply |
| 4. two validators for one shape | **steps 1 and 2 done, step 3 outstanding** — see the section |
| 5. the block contract for the browser | **superseded** — the shapes are in `src/shared/types.ts` now and the browser imports them from there |
| 6. fold `panel_layouts` into the migrations | **applied, 2026-08-10** — `panel_layouts` is declared in `src/server/db/schema.ts` and created by migration `0003_fold_five_tables`, with `IF NOT EXISTS` added by hand. `ensureLayoutTable()` and its call were deleted in the same change, which was the condition section 6 set. The other four tables that were made the same way went in with it. |
| 7. things found but not changed | two of the three are done; see the section |

---

## 1. `src/server/index.ts` — register the layout routes

**1a.** After **line 63**, the line

```ts
const { queryRoutes } = await import('./api/queries.ts')
```

add:

```ts
const { layoutRoutes } = await import('./api/layout.ts')
```

It has to be a dynamic `await import` like its neighbours, for the reason the comment above
them gives: `api/layout.ts` reaches the database, and the database client reads `MOLE_OFFICE_DB` the
moment it is imported, which must not happen before `.env` is loaded.

**1b.** After **line 140**, the line

```ts
await app.register(queryRoutes, { prefix: '/api' })
```

add:

```ts
await app.register(layoutRoutes, { prefix: '/api' })
```

Order does not matter — `/api/layout/:id` collides with nothing.

---

## 2. `src/server/api/records.ts` — check summary blocks at write time

**2a.** After **line 24**, the line

```ts
import { actorFrom, parse, toChange } from '../lib/http.ts'
```

add:

```ts
import { checkModuleSummary } from '../lib/summary.ts'
```

**2b.** Replace the whole `PATCH /records/:id` handler, **lines 113–118**, which currently
reads:

```ts
  app.patch('/records/:id', async (req): Promise<{ record: PanelRecord }> => {
    const actor = actorFrom(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(patchBody, req.body, 'The request body is not usable:')
    return { record: updateRecord(id, body, actor) }
  })
```

with:

```ts
  app.patch('/records/:id', async (req): Promise<{ record: PanelRecord }> => {
    const actor = actorFrom(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(patchBody, req.body, 'The request body is not usable:')

    // A module's curated summary is checked here, before anything is written, so an agent that
    // emits a chart with no series is told which block is wrong while it is still running.
    // Checking at read time instead would move the error to whoever opens the page later, who
    // did not write it and cannot fix it, and would leave the bad data in the database.
    //
    // The kind is not in the body, so the record has to be read to find it. updateRecord would
    // 404 on an unknown id anyway; doing it here as well means a bad summary sent to an id that
    // does not exist reports the missing record, which is the more useful of the two errors.
    const existing = getRecord(id)
    if (!existing) throw new PanelError(`No record with id ${id}`, 404)
    checkModuleSummary(existing.kind, body.data)

    return { record: updateRecord(id, body, actor) }
  })
```

`getRecord` and `PanelError` are already imported at the top of that file, so no other import
changes are needed.

**2c. Recommended, not required.** The same check on create, so a module cannot be *born* with a
broken summary. In `POST /records`, **line 86**, after

```ts
    const body = parse(createBody, req.body, 'The request body is not usable:')
```

add:

```ts
    checkModuleSummary(body.kind, body.data)
```

I have left this as a recommendation only because the brief named PATCH. There is no argument
against it that I can see: without it, `POST /api/records` is a way round the check.

---

## 3. What the new endpoints do

Add to the API contract in `README.md` when someone is next in it.

| Method | Path | Body | Success | Failures |
|---|---|---|---|---|
| `GET` | `/api/layout/:id` | — | `200 { layout }` | `400` bad id, `404` never saved |
| `PUT` | `/api/layout/:id` | `{ layout }` | `200 { ok: true }` | `400` bad id or body, `413` over 64 KB |

- `:id` is the page the layout belongs to, chosen by the browser. `home` today. It must match
  `^[A-Za-z0-9._-]{1,64}$`.
- `layout` is **opaque JSON** owned by the browser — any JSON value, including `null`. The
  server stores the bytes and hands them back unchanged. It checks only that the key is present
  and that the serialised value is under 64 KB (UTF-8 **bytes**, so Chinese panel titles count
  properly).
- **`404` means never saved, and is not an error to hide.** It is how the browser tells "lay the
  panels out from scratch" apart from "the user deliberately cleared this page" — the second one
  is a `200` with an empty layout. Do not treat a 404 here as a failed request in `src/web/api.ts`;
  it is a normal answer that needs its own return value, e.g. `getLayout(): Promise<unknown | null>`.
- Writes are attributed from the usual `x-mole-office-actor-*` headers and stored in `updated_by`.
  They are deliberately **not** written to the `changes` table — see the header comment in
  `api/layout.ts` for why. Do not "fix" that.

---

## 4. Two validators for one shape — the thing to fix first

While I was writing `src/server/lib/summary.ts`, another agent defined the **same** curated
summary block model in `scripts/seed.ts` and wrote real blocks with it for two of the demo
corpus's modules. Its own header comment predicted this: *"do that before a second writer of
blocks exists, because two definitions of a stored shape always drift apart."* I am the second
writer.

I did **not** invent a competing shape. `src/server/lib/summary.ts` is the seed's model
expressed as zod, field for field, storing at the same key (`data.summaryBlocks`). It is proved
compatible, not assumed: `tests/summary-schema.test.ts` runs `SCANNER_SUMMARY` and
`OCR_SUMMARY` through the zod schemas and asserts they come back **unchanged**, and
asserts the two `SUMMARY_BLOCK_TYPES` lists are equal. If either side drifts, that test goes red
instead of the API quietly refusing data the seed happily stores.

**The fix, in order:**

1. ~~Move the interfaces out of `scripts/seed.ts`~~ **DONE**, and they went to
   `src/shared/types.ts` rather than to a new `src/shared/summary.ts` — that file is already the
   one both ends read, and a second shared file would have been one more place to look. Both
   `scripts/seed.ts` and `src/server/lib/summary.ts` now take the block types from there;
   `blocksAgree` in `lib/validate.ts` is a compile-time proof that the zod output and the shared
   interfaces are the same type in both directions.
2. ~~Keep the **zod schemas in `src/server/lib/summary.ts`** as the single validator.~~ **DONE**
   as far as the API is concerned: every HTTP write goes through them.
3. **STILL OUTSTANDING.** Have `scripts/seed.ts`
   `import { validateSummaryBlocks } from '../src/server/lib/summary.ts'` and delete its
   hand-rolled `SummaryBlockError`, `chartSeries`, `chartAxis`, `chartSpec`, `tableBlock` and
   `validateSummaryBlocks` (about 200 lines). Its call sites do not change — same function name,
   same throw-on-first-problem behaviour, and `PanelError` carries the same `status = 400` that
   `SummaryBlockError` does. What does change is the wording of the refusals, so
   `tests/summary.test.ts` has to be rewritten against the zod messages; that test asserts on
   phrases like `index 1` and ``reuses the id "b-text"`` which the zod validator words
   differently.
4. Then `tests/summary.test.ts` and `tests/summary-schema.test.ts` can be merged.

Until step 3 happens, **a rule changed in one file must be changed in the other**. What stops
that being silent is `tests/summary-schema.test.ts`, which runs every block the seed really
writes through the zod schemas.

### Where the zod schema is stricter than `scripts/seed.ts`

Four rules exist only on the server side. All four refuse a write; none of them alters stored
data. If any is judged wrong, each is one line to delete.

| Rule | Why | Where |
|---|---|---|
| An axis with `min >= max` is refused | It draws the chart inside out, which reads as a real result rather than a mistake | `chartSpec` superRefine |
| Two series in one chart may not share an `id` | The legend then addresses the wrong line | same |
| Unknown keys are refused, not dropped | House rule from `api/records.ts`: a misspelt field that was quietly dropped looks like a successful write that lost your text. `seed.ts` rebuilds objects from known fields, so it drops them silently | every `strictObject` |
| `tex` must be structurally **closed** — balanced braces, even number of unescaped `$` | See below | `texProblem` |

The `tex` one deserves its own note, because `seed.ts` says tex is deliberately not parsed and
that is right. Nothing here looks at command names: `\notarealcommand{x}` is accepted, and there
is a test asserting it. What is checked is only whether the string closes. An unclosed brace is
broken under every renderer and it fails by *swallowing* the rest of the expression rather than
by complaining. Refusing the write is not the thing `seed.ts` warns against — that was
validation which **drops** what it cannot render, and this drops nothing. If you disagree,
delete the `.refine` on `const tex` and keep `texProblem` exported for MathText to use.

---

## 5. The summary block contract, for the browser components

**Superseded by section 4 step 1, and this is the paragraph that proves why plans have to be
dated.** It used to say the least-bad import for `SummaryBlocks.tsx`, `Chart.tsx` and
`MathText.tsx` was a type-only one from `../../server/lib/summary.ts`, and then retyped the whole
block schema underneath as a markdown table — a fourth copy of a shape that already had three.

Both are wrong now, and the second was the more dangerous: a field list in a document is believed
and never rebuilt. The shapes live in `src/shared/types.ts`; import them from there, as values or
as types, with no `import type` dance and nothing to keep in step:

```ts
import type { SummaryBlock, ChartSpec } from '@shared/types.ts'
```

For the field list, read `src/shared/types.ts` itself, or ask the running server:
`GET /api/kinds/module` follows the nested shapes through and answers with `SummaryBlock`, the
five block types and what a `ChartSpec` contains. That answer comes out of `KIND_SPECS`, which is
the same object the write path validates against, so it cannot describe a field the server
refuses.

What is worth keeping from this section is the REASONING, which is not in the schema:

`SummaryBlock` is a discriminated union on `type`, so a `switch` with no `default` plus an
exhaustiveness check turns "a block type was added and not handled" into a TypeScript error
rather than a blank area of the page.

Blocks are stored on a module record at **`data.summaryBlocks`** (not `data.summary`, which is
the generated one-line summary and stays a plain string). Every block has `id: string`, unique
within the summary — enforced server-side, because duplicate ids make React reuse the wrong
element, so editing one block visibly changes another.

Five things about the shape that are contract, not preference:

1. **Nothing carries a colour.** Meaning is carried by `state`, which the renderer turns into
   `--st-<state>` plus a word and a shape. This is the token rule: if meaning lived in a colour,
   a theme swap could change what the colour MEANS. `dashed` exists for the same reason — a
   dashed line still reads as "this one" in the mono theme and in a black-and-white printout.
2. **Table cells are `string | number`,** and numbers stay numbers. The renderer needs that to
   right-align and format them; `"n/a"` and `"not measured"` are real cells that must not be
   forced into a placeholder number.
3. **Axis `label` is required.** An unlabelled axis is a number with no unit, which is how a
   plot lies. `unit` is separate so ticks can carry it without repeating the word.
4. **`alt` on an image is required and non-empty,** and `path` must be absolute. The server
   refuses both, so the component never needs a fallback for either.
5. **An annotation always has a label.** A reference line with no label is a mystery line.

Two things the server deliberately does **not** check, which the components must therefore
handle and must fail **visibly** on:

- Whether an image `path` exists on disk. Mole Office points at the archive, it does not own it, and
  a machine being switched off is not a reason to refuse a write. Show a missing file as broken
  at read time, the way a link to a deleted record is shown — never as an empty space.
- Which LaTeX commands `MathText` supports. Only the string's structure is checked server-side.
  An unsupported command must render as a visible error naming it, or as the raw source, never
  as silently dropped text.

---

## 6. DONE 2026-08-10: fold `panel_layouts` into the migrations

`api/layout.ts` used to create its own table with `CREATE TABLE IF NOT EXISTS`, because
`db/schema.ts` and `drizzle/` belonged to other agents that phase. That worked and cost one thing:
the table had no migration path, so a column added to it would never have reached a database that
already had it.

**This has been carried out.** `panelLayouts` is declared in `src/server/db/schema.ts`, migration
`0003_fold_five_tables` creates it with a hand-added `IF NOT EXISTS`, and `ensureLayoutTable` and
its call site were deleted in the same change — which is the condition the last paragraph of this
section set. `session_resources`, `source_files`, `source_index` and `source_file_hashes`, which
were made the same way in `lib/resources.ts` and `lib/sourceindex.ts`, went in with it.

`readLayoutRow` / `writeLayoutRow` still use raw `sqlite` rather than drizzle. That is the one part
of this section that is outstanding, and it is a tidy-up rather than a defect: there is now exactly
one definition of the table, which is what mattered.

What follows is the plan as it was written, kept so the reasoning can be checked against what
landed. The declaration below is close to what is in `schema.ts` today, not identical to it.

When `db/schema.ts` is next open, add:

```ts
import { primaryKey } from 'drizzle-orm/sqlite-core'

/**
 * Saved panel positions, one row per page. Deliberately NOT a record: a layout is written on
 * every drag, and every write through lib/records.ts appends to `changes`, which is what the
 * daily view is a filter on. See the header of api/layout.ts.
 */
export const panelLayouts = sqliteTable(
  'panel_layouts',
  {
    workspaceId: text('workspace_id').notNull().default('default'),
    id: text('id').notNull(),
    /** Opaque JSON owned by the browser, stored as text. */
    layout: text('layout').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** "human:owner" or "agent:claude-code". Attribution without polluting the change log. */
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.id] }) }),
)
```

then generate the migration and **edit the generated SQL to say `CREATE TABLE IF NOT EXISTS`**.
`drizzle-kit` emits a bare `CREATE TABLE`, which will fail on every database where
`ensureLayoutTable()` has already run — that is every database this feature has ever touched.

Delete `ensureLayoutTable` and its call in `api/layout.ts` in the same commit, and switch
`readLayoutRow` / `writeLayoutRow` to drizzle. Leaving both is the bad outcome: two definitions
of one table that can drift.

---

## 7. Things I found but did not change

- ~~**`ModuleData` in `src/shared/types.ts` does not declare `summaryBlocks`.**~~ DONE. It is
  declared next to `summary`, and the block interfaces are declared in the same file — see
  section 4 step 1.
- ~~**`PathRef['kind']` is declared inline**~~ DONE. `PATH_KINDS` is exported from
  `src/shared/types.ts`, and `ModuleView.tsx` — which had duplicated the eight words while there
  was nothing to import — reads it from there.
- ~~**`now()` in `lib/records.ts` is not exported**, so `api/layout.ts` has its own copy.~~ DONE.
  `lib/records.ts` now exports `localStamp(when)` and `now()`, and the five hand-made copies
  (`api/layout.ts`, `lib/resources.ts`, `api/source.ts`, `lib/sourceindex.ts` and the original)
  are one function. It stays LOCAL time so it sorts correctly against the other tables, and that
  reason is now written down once instead of five times — five copies of it were five chances for
  one to drift to UTC and file a late evening's work under tomorrow.
- **`tests/summary.test.ts` was written by another agent while I was working**, covering the
  seed's validator. Mine is in `tests/summary-schema.test.ts` so the two do not collide. They
  merge when section 4 step 3 is done — still true, and still the largest thing left in this file.
