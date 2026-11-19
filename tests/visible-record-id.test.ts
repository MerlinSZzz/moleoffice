// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON AND AN AGENT CAN POINT AT THE SAME RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * Measured in a browser at 1440 on 27 August 2026: the page of report `OOOt4Kouc5dT` drew its
 * kind, its reading family, its title, its summary line and its two dates, and nowhere on it was
 * the string `OOOt4Kouc5dT`. The home queue drew 27 items and not one id. Meanwhile every agent
 * report in this repository quotes ids exactly. So the owner reads `Report OOOt4Kouc5dT — Round
 * ten`, opens the page it names, and has nothing on the screen to match the first half against.
 *
 * The owner's rule, section 9 of the round eleven brief: *human-facing references should be
 * identity + meaning, never identity alone and never meaning alone.* Round eleven's DIRECTION.md
 * entry 3 turns it into three things this file checks:
 *
 *   1. the id is on the record's own page, near the title, with a way to copy it;
 *   2. it is REAL TEXT, so the browser's own find can match it — not an image, not a pseudo
 *      element, not only a tooltip;
 *   3. a pasted id is a search that finds that record.
 *
 * WHAT THIS FILE CANNOT SEE, and where it was checked instead. Whether the clipboard actually took
 * the id is not answerable here — there is no DOM in the runner and no clipboard behind it, so a
 * test here could only prove the button calls a function. It was pressed in a real browser and the
 * clipboard read back:  design/round-eleven/wave-a/identity-shots/copy-check.mjs, six checks, all
 * passing on 27 August.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import type { PanelRecord } from '../src/shared/types.ts'

// ============================================================================ the page

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
type RecordIdModule = typeof import('../src/web/components/RecordId.tsx')
type Ui = typeof import('../src/web/components/ui.tsx')
type RecordsPage = typeof import('../src/web/pages/RecordsPage.tsx')

let chooseMode: typeof import('../src/web/lib/mode.ts').setMode
let rp: RecordPage
let rid: RecordIdModule
let ui: Ui
let recordsPage: RecordsPage
let mode: typeof import('../src/web/lib/mode.ts')

beforeAll(async () => {
  // The same stand-in tests/record-page.test.ts uses, and for the same reason: these modules reach
  // api.ts and router.tsx, which touch `window` while they are being evaluated. Nothing here is
  // under test.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  chooseMode = (await import('../src/web/lib/mode.ts')).setMode
  rp = await import('../src/web/pages/RecordPage.tsx')
  rid = await import('../src/web/components/RecordId.tsx')
  ui = await import('../src/web/components/ui.tsx')
  recordsPage = await import('../src/web/pages/RecordsPage.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

/**
 * Markup with the hoisted style blocks cut out.
 *
 * WITHOUT THIS EVERY TEST BELOW PASSES FOR THE WRONG REASON. The component carries its own
 * stylesheet, so the class names it styles are in the rendered string whether or not anything drew
 * them, and so is the word `content` in any rule that used one.
 */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/**
 * WHAT A PERSON WOULD READ OFF THIS MARKUP. Every tag gone, so nothing inside an attribute counts.
 *
 * WITHOUT THIS THE HEADLINE TEST OF THIS FILE PASSED WITH THE FEATURE DELETED, which is measured
 * rather than guessed: with the id taken back off the header, `toContain(ID)` on the raw markup
 * still passed, because the Edit button's address is `#/r/OOOt4Kouc5dT/edit` and the id is in that
 * href. An address is not something a reader can see, select, or find with Ctrl+F.
 */
const visible = (markup: string): string => markup.replace(/<[^>]+>/g, ' ')

const ID = 'OOOt4Kouc5dT'

function report(): PanelRecord {
  return {
    id: ID,
    kind: 'report',
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: 'Round ten: what was built, what was not, and what is waiting on you',
    summary: null,
    data: {},
    createdAt: '2026-08-27 04:00:00',
    updatedAt: '2026-08-27 05:00:00',
    deletedAt: null,
  }
}

// Criterion change: 7FEOshq3mBGG keeps record addresses in developer mode.
const head = (over: { editing?: boolean } = {}) => {
  chooseMode('inspect')
  const markup = body(
    h(rp.RecordHead, {
      record: report(),
      // NOTHING IS JOINED TO IT, which is a statement about this fixture and not a gap in it.
      relations: [],
      projects: [{ id: 'panelx', title: 'Mole Office', note: null, recordCount: 1 } as never],
      incomplete: [],
      deleted: false,
      editing: over.editing ?? false,
      busy: false,
      onSaved: () => {},
      onDelete: async () => {},
    }),
  )

  chooseMode('normal')
  return markup
}

describe('the record page prints the id in developer mode', () => {
  /**
   * THE ONE THAT GOES RED IF THE ID COMES OFF THE PAGE. Everything else in this describe is about
   * the id being usable; this is about it being there at all, which is what was measured missing.
   */
  it('draws the id in the header, beside the title and the dates', () => {
    expect(visible(head())).toContain(ID)
  })

  /**
   * AND IT IS THERE WHILE THE RECORD IS BEING EDITED. The header swaps the title for a text box in
   * editing, and an id that vanished when somebody pressed Edit would be missing from exactly the
   * screen where they are most likely to be talking to an agent about this record.
   */
  it('keeps the id on the screen while the record is being edited', () => {
    expect(visible(head({ editing: true }))).toContain(ID)
  })

  /**
   * REAL TEXT, WHICH IS WHAT CTRL+F READS. The browser's own find is to match the
   * id where it is drawn. Find-in-page walks rendered text nodes: it does not read an alt, it does
   * not read a title, and it does not read generated content. So the id has to be BETWEEN two
   * tags, and this asserts that rather than merely that the string is somewhere in the markup —
   * which a tooltip alone would satisfy.
   */
  it('draws it between tags, not inside an attribute', () => {
    expect(head()).toMatch(new RegExp(`>${ID}<`))
  })

  /**
   * A way to copy it, named after the id it copies rather than being one of forty buttons saying
   * copy — and its name carries what the last press did, because an accessible name replaces the
   * button's own word and a name that always said "copy" would hide a copy that was refused.
   */
  it('offers a copy control that names the id it would copy', () => {
    expect(head()).toContain(`aria-label="copy: the record id ${ID}"`)
    expect(head()).toContain(`Put the record id ${ID} on the clipboard.`)
  })

  /**
   * IDENTITY AND MEANING TOGETHER, WHICH IS THE HALF THAT IS EASY TO LOSE. An id on a page with no
   * title is the owner's rule broken in the other direction, and it is the cheaper thing to build.
   */
  it('draws the title on the same header, so the id never stands alone', () => {
    const read = visible(head())
    expect(read).toContain(ID)
    expect(read).toContain('Round ten: what was built')
  })
})

describe('one component decides where an id sits, so six surfaces cannot each decide', () => {
  const draw = (where: 'card' | 'page' | 'inline') => body(h(rid.RecordId, { id: ID, where }))

  /**
   * THE PLACEMENT RULE, ENFORCED HERE AND NOT BY THE CALLER. A card puts the id bottom right: the
   * component wraps it in a slot that drops to the floor of the card and pushes to the right wall.
   * A caller passing `where` is choosing a surface, not a position.
   */
  it('wraps a card id in the slot that puts it bottom right', () => {
    expect(draw('card')).toContain('rid-card')
    // And an id inside a sentence gets no slot at all, because the sentence decides where it goes.
    expect(draw('inline')).not.toContain('rid-card')
  })

  /** The copy button belongs to the record's own page and to nowhere else — a list is not the place. */
  it('puts the copy control on the page and not on a card', () => {
    expect(draw('page')).toContain('rid-copy')
    expect(draw('card')).not.toContain('rid-copy')
    expect(draw('inline')).not.toContain('rid-copy')
  })
})

// ============================================================================ lists and cards

/**
 * THE ID IS ON THE LISTS TOO, WHICH IS THE HALF THAT WAS MISSING.
 *
 * MEASURED BEFORE THIS WAS WRITTEN. An independent reader counted the elements carrying the id
 * class in Chromium at 1440 in Normal mode on 27 August 2026 and found none on Home, Everything,
 * Governance, Modules, Agents or Bundles. The component existed and one page used it.
 *
 * The owner's requirement, section 9: *list/card: low-visual-weight ID, preferably monospace,
 * placed consistently (for example bottom-right)*, and *Ctrl+F should be able to find the visible
 * ID*.
 *
 * WHY THE ROW IS WHERE THIS IS CHECKED. 21 lists across the product draw their record rows with
 * `Row`, and a `Row` already says which record it is, through the `target` it carries so a person
 * can talk to an agent about it. The id follows that mark. There is no second prop a list could
 * forget, so a list that says what it is cannot fail to say which record it is.
 */
describe('a list row carries its record id in developer mode', () => {
  beforeEach(() => { mode.setMode('inspect') })
  afterEach(() => { mode.setMode('normal') })
  const ROW_ID = 'Vb7Qk2Ln9Xz1'

  const row = (over: { target?: boolean } = {}) =>
    body(
      h(ui.Row, {
        title: 'The gripper mount survey',
        href: `#/r/${ROW_ID}`,
        ...(over.target === false
          ? {}
          : { target: { kind: 'record' as const, recordId: ROW_ID, workspaceId: 'panelx' } }),
      }),
    )

  /**
   * THE ONE THAT GOES RED IF THE ID COMES OFF THE ROWS. `visible` strips every tag, so the href —
   * which also holds the id — cannot make this pass. That trap caught the header test in this same
   * file once already.
   */
  it('draws the id as text a reader can see and find', () => {
    expect(visible(row())).toContain(ROW_ID)
    expect(row(), 'the id is inside an attribute rather than between two tags').toMatch(
      new RegExp(`>${ROW_ID}<`),
    )
  })

  /** The look and the corner come from RecordId, so twenty lists cannot become twenty placements. */
  it('draws it through the one component and not a pill of its own', () => {
    expect(row()).toContain('rid-card')
    expect(row()).toContain('class="rid-text"')
  })

  /**
   * IDENTITY AND MEANING TOGETHER on the row, which is the owner's rule in full. A row is never
   * only an id: the title is the thing it is called and it is on the same row.
   */
  it('keeps the title beside it, so the id never stands alone', () => {
    expect(visible(row())).toContain('The gripper mount survey')
  })

  /**
   * AND A ROW THAT IS NOT A RECORD DRAWS NOTHING. A row with no target says nothing about what it
   * is, and inventing an id for it would be a guess. Absence beats a guess.
   */
  it('draws no id on a row that never said which record it is', () => {
    expect(row({ target: false })).not.toContain('rid-text')
  })
})

/**
 * THE CATALOGUE'S OWN ROW, which is a table and not a `Row`, and is the list the owner opens when the owner
 * wants every record. Its id column was Developer-only until 27 August 2026; the criterion that said
 * so was rewritten in its own commit, and tests/records-queries-pages.test.ts holds it.
 */
describe('the catalogue draws the id in the column the whole table agrees exists', () => {
  it('names the id column only in Developer mode, from the list the head and cell both read', () => {
    // Plan 7FEOshq3mBGG keeps machine details out of normal pages.
    expect(recordsPage.columnsFor('normal')).not.toContain('id')
    expect(recordsPage.columnsFor('inspect')).toContain('id')
  })
})

// ============================================================================ reading it by eye

// ============================================================================ pasting an id in

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { searchRoutes } = await import('../src/server/api/search.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const app = Fastify()
  installErrorHandling(app)
  await app.register(searchRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  const harness = await freshApp()
  t = harness.db
  app = harness.app
})

afterEach(async () => {
  await app.close()
  t.close()
})

async function search(query: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: `/api/search?${query}`, headers })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return JSON.parse(res.body) as Record<string, unknown>
}

/**
 * WHAT THE SEARCH DOES WITH A PASTED ID.
 *
 * MEASURED FIRST, BEFORE ANYTHING WAS WRITTEN, against the running server on 27 August 2026:
 * `GET /api/search?q=OOOt4Kouc5dT` already answered with `exact` naming the report, alongside 4
 * text matches out of 440 records searched. So the branch was built and NOT tested — there was no
 * assertion anywhere in tests/ that mentioned `exact`, and deleting the branch broke nothing. That
 * is what this section is: the missing proof for behaviour that already existed, so the next
 * person to tidy `search.ts` finds out.
 */
describe('a pasted id is a search that finds that record', () => {
  /**
   * THE ONE THAT GOES RED IF THE ID BRANCH IS DELETED. The record's own text says nothing about
   * its id — nobody's title contains their own nanoid — so a word search alone answers with
   * nothing at all. `exact` is the whole of the answer here.
   */
  it('finds the record when nothing in the corpus mentions the id', async () => {
    const made = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'A note about the bench',
      data: {},
      actor: AGENT,
    })

    const found = await search(`q=${made.id}`)

    expect(found['exact']).toMatchObject({ id: made.id, title: 'A note about the bench', path: `/r/${made.id}` })
    // AND THE WORD SEARCH FOUND NOTHING, which is the point: an id is not a word, and without the
    // branch above this reply would be an empty list and a sentence saying nothing matched.
    expect(found['counts']).toMatchObject({ matched: 0, searched: 1 })
    expect(String(found['note'])).toContain('IS the id of')
  })

  /**
   * THE DEFECT THE BRANCH WAS BUILT FOR, kept as a test. Search the id of a record other records
   * quote, and every text match is correct and none of them is the thing you asked for.
   */
  it('keeps the record apart from the records that merely mention its id', async () => {
    const made = t.api.createRecord({
      workspaceId: 'default',
      kind: 'proposal',
      title: 'Which repository the module claims belong to',
      data: {},
      actor: AGENT,
    })
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: `Somebody quoting ${made.id} in a sentence`,
      data: {},
      actor: AGENT,
    })

    const found = await search(`q=${made.id}`)

    expect(found['exact']).toMatchObject({ id: made.id, kind: 'proposal' })
    // The mention is still a result, because "who talks about this" is a real question. It is just
    // not the answer to "show me this record".
    expect(found['counts']).toMatchObject({ matched: 1 })
  })

  /**
   * AN ID IS GLOBAL AND A READER MAY BE IN ANOTHER PROJECT. Answering "no such record" because the
   * reader happens to be reading a different project would be false, so the reply names the
   * project instead — and still carries nothing else from it.
   */
  it('says which project the record is in when it is not this one', async () => {
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'robotics', title: 'Robotics', note: 'the other project' })
    const made = t.api.createRecord({
      workspaceId: 'robotics',
      kind: 'note',
      title: 'A beacon in robotics',
      data: {},
      actor: AGENT,
    })

    const found = await search(`q=${made.id}`)

    expect(found['exact']).toMatchObject({ id: made.id, workspaceId: 'robotics', elsewhere: true })
    expect(String(found['note'])).toContain('robotics')
  })

  /**
   * AND AN ORDINARY WORD IS NOT AN ID. `presentation` is twelve characters of the same alphabet an
   * id is built from, so the shape check alone would treat it as one; what stops that being wrong
   * is that the lookup decides, and no record answers to it.
   */
  it('does not turn a twelve-letter word into an id', async () => {
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'A note on presentation',
      data: {},
      actor: AGENT,
    })

    const found = await search('q=presentation')

    expect(found['exact']).toBeNull()
    expect(found['counts']).toMatchObject({ matched: 1 })
  })

  /**
   * AN ID WITH A WORD'S SHAPE IS STILL LOOKED UP (inspector's check bNyZG3KeMECX, round 37c).
   * isARecordId reads PJQLJ-nv-MCX as a word, because it decides how a word in a sentence is drawn.
   * Search asks whether a record has this id, so it must not read that rule: if it did, this record
   * would never be looked up and the reply would say no record has this id without having looked.
   * nanoid makes such an id about 3 times in 10,000, so the record is given one here.
   */
  it('finds a record whose id has a word\'s shape', async () => {
    const { isARecordId } = await import('../src/shared/messages.ts')
    const wordShaped = 'PJQLJ-nv-MCX'
    expect(isARecordId(wordShaped)).toBe(false)
    const made = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'A record whose id reads as words',
      data: {},
      actor: AGENT,
    })
    t.client.sqlite.prepare('UPDATE records SET id = ? WHERE id = ?').run(wordShaped, made.id)

    const found = await search(`q=${wordShaped}`)

    expect(found['exact']).toMatchObject({ id: wordShaped, title: 'A record whose id reads as words' })
    expect(found['counts']).toMatchObject({ matched: 0 })
  })
})
