// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE VERSION HISTORY SAYS WHOSE WORDS A WRITE STOOD ON, NOT ONLY WHO MADE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/records/:id/revisions` carried `warrant` on every entry, beside `who`, and the panel a
 * person opens to read a trail drew `agent · claude-code` and nothing else. So a write an agent made
 * on the owner's own quoted words looked exactly like one it made on its own authority, on the one
 * screen somebody goes to in order to check that. The record page's own panel drew the act; the
 * version history did not. Problem `LUdiXkVMUGcr`.
 *
 * `design/messages/ACCEPTANCE.md` W2: *the act is marked "on the owner's words" wherever the product
 * would otherwise say who did it*.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY EACH HALF IS NEEDED
 * ---------------------------------------------------------------------------------------
 *
 * A test that only checked the marked row would pass with the mark drawn on every row. A test that
 * only checked the unmarked row would pass with the mark deleted. Both are here, on rows read out of
 * one real record through the real API.
 *
 * AND A THIRD HALF: that the four words on the screen ARE the shared constant. `toContain` on the
 * constant's value passes just as happily against four words typed into the component, which would
 * be a fifth copy of a sentence three other surfaces already draw from one place. So the source is
 * asserted to carry no copy of its own — which is what makes a change to `ON_THE_OWNERS_WORDS`
 * change what this screen says.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT RENDERS TO MARKUP AND NOT IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node` and this project has ruled out adding a DOM. What must be IN
 * the markup — the four words, the owner's own sentence, the quotation marked as somebody else's words, and
 * the revocation reading as one — is exactly what `renderToStaticMarkup` can answer. How it looks at
 * 390 and in dark is a photograph question and was checked that way.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h, type ReactElement } from 'react'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { ON_THE_OWNERS_WORDS } from '../src/shared/warrant.ts'
import type { RevisionEntry, RevisionListing } from '../src/server/lib/revisions.ts'

let t: TestDb
let app: FastifyInstance

const PROJECT = 'default'

const AS_AGENT: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const AS_PERSON: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

/** The warrant this file acts on: its words, and where and when they were said, kept as written. */
const THE_OWNERS_WORDS = {
  saidBy: THE_TEST_OFFICES_OWNER.id,
  words: 'POINTING我认为可以accept了',
  where: 'terminal',
  when: '2026-09-03 09:14',
} as const

function about(...ids: string[]): Record<string, unknown> {
  return { ...THE_OWNERS_WORDS, for: ids }
}

/**
 * A BROWSER-SHAPED GLOBAL, because the panel reaches modules that touch `window` while they load.
 *
 * The same stand-in `tests/an-agent-acts-on-the-owners-own-words.test.ts` uses, for the same reason:
 * it is what lets a node test ask what a panel DRAWS rather than only what the API answers.
 */
function aBrowserShapedGlobal(): void {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  aBrowserShapedGlobal()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================================ fixtures

/** A problem asked of the PERSON, so closing it is a governance write and needs a warrant. */
function askedOfTheOwner(symptom: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'problem',
    title: `Whose move · ${symptom}`,
    data: { whose_move: 'person', symptom },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = AS_AGENT,
): Promise<number> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  expect(res.statusCode, res.body).toBe(200)
  return res.statusCode
}

async function versions(id: string): Promise<RevisionListing> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}/revisions`, headers: AS_PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as RevisionListing
}

/** Markup with the hoisted style blocks taken out, so a class name in the CSS is not evidence. */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/**
 * EVERYTHING THE MARKUP SHOWS A READER, WITH THE TAGS TAKEN OUT AND THE ENTITIES PUT BACK.
 *
 * React writes an apostrophe as `&#x27;` and a double quote as `&quot;`, so `On the owner's words`
 * is not a substring of the markup even when it is on the screen. Every assertion below is about
 * what a person reads, so every one of them reads this.
 */
function words(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

/**
 * One row of the version list, drawn the way the panel draws it.
 *
 * `said` is what a person reads. `markup` is the tags as well, and only the class assertions use it:
 * `px-owner-words` is not a word on the screen, it is the mark that says the words inside it are
 * somebody's own and not the interface talking.
 */
async function row(
  recordId: string,
  entry: RevisionEntry,
  all: readonly RevisionEntry[],
): Promise<{ said: string; markup: string }> {
  const history = await import('../src/web/components/RecordHistory.tsx')
  const markup = body(
    h(history.VersionRow, {
      entry,
      all,
      recordId,
      recordKind: 'problem' as const,
      nowSeq: null,
      // Criterion change: 7FEOshq3mBGG keeps actor addresses and the detailed trail in developer mode.
      mode: 'inspect' as const,
      editable: false,
      open: false,
      comparing: false,
      onOpen: () => {},
      onCompare: () => {},
      onPutBack: () => {},
    }),
  )
  return { said: words(markup), markup }
}

/** A record closed on a warrant: version 1 is the person's, version 2 is the act. */
async function aRecordClosedOnTheOwnersWords(): Promise<{ id: string; all: RevisionEntry[] }> {
  const id = askedOfTheOwner('the gripper drops the part on the third cycle')
  await patch(id, { dataPatch: { state: 'accepted' }, warrant: about(id) })
  return { id, all: (await versions(id)).revisions }
}

/** Which entry is which. The listing is newest first, so a seq is what names a row. */
function at(all: readonly RevisionEntry[], seq: number): RevisionEntry {
  const one = all.find((entry) => entry.seq === seq)
  if (one === undefined) throw new Error(`no version ${String(seq)} in the listing`)
  return one
}

// ============================================================================ what the API carries

describe('the entries carry both halves of the sentence', () => {
  it('serves the owner’s words on the write that stood on them, and null on the one that did not', async () => {
    const { id, all } = await aRecordClosedOnTheOwnersWords()
    expect(at(all, 1).warrant, 'the person’s own write carries a warrant').toBeNull()
    expect(at(all, 2).warrant?.words, 'the act does not carry the owner\'s words').toBe(THE_OWNERS_WORDS.words)
    expect(at(all, 2).warrant?.where).toBe('terminal')
    expect(at(all, 2).warrant?.when).toBe(THE_OWNERS_WORDS.when)
    expect(at(all, 2).warrant?.for).toEqual([id])
  })

  it('serves which version a revocation took back, so a restore is not read as one', async () => {
    const { id, all } = await aRecordClosedOnTheOwnersWords()
    for (const entry of all) expect(entry.revokesSeq, `version ${String(entry.seq)}`).toBeNull()
    const undone = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/2/revoke`,
      headers: AS_PERSON,
    })
    expect(undone.statusCode, undone.body).toBe(200)
    const after = (await versions(id)).revisions
    expect(at(after, 3).revokesSeq, 'the revocation does not say what it took back').toBe(2)
    expect(at(after, 3).warrant, 'a revocation is the person’s own write and stands on nobody’s words').toBeNull()
  })
})

// ============================================================================ what the row draws

describe('a version written on the owner’s words says so', () => {
  it('draws the four words and the owner\'s own sentence on that row', async () => {
    const { id, all } = await aRecordClosedOnTheOwnersWords()
    const drawn = await row(id, at(all, 2), all)
    expect(drawn.said, 'the row does not say it was done on the owner\'s words').toContain(ON_THE_OWNERS_WORDS)
    expect(drawn.said, 'the owner\'s own sentence is not on the row').toContain(THE_OWNERS_WORDS.words)
    expect(drawn.markup, 'the owner\'s words are not marked as somebody else’s').toContain('px-owner-words')
    // WHO ACTED, AND WHERE AND WHEN THE WARRANT WAS GIVEN — the sentence built in @shared/warrant.ts, which is
    // the same one the record page draws. Without it the mark is a claim with nothing behind it.
    expect(drawn.said).toContain('agent "claude-code" did this on the person\'s words')
    expect(drawn.said).toContain('in a terminal conversation')
    expect(drawn.said).toContain(THE_OWNERS_WORDS.when)
  })

  it('says none of it on a version that stood on nobody’s words', async () => {
    const { id, all } = await aRecordClosedOnTheOwnersWords()
    const drawn = await row(id, at(all, 1), all)
    expect(drawn.said, 'an ordinary write is marked as done on the owner\'s words').not.toContain(ON_THE_OWNERS_WORDS)
    expect(drawn.said, 'an ordinary write carries somebody’s quoted words').not.toContain(THE_OWNERS_WORDS.words)
    expect(drawn.markup).not.toContain('px-owner-words')
    // The row still says everything it said before this mark existed.
    expect(drawn.said).toContain('Version 1')
    expect(drawn.said).toContain(THE_TEST_OFFICES_OWNER.id)
  })
})

// ============================================================================ once the owner takes it back

describe('an act the owner took back reads as a revocation', () => {
  it('stops saying the four words on the act, and keeps the owner\'s words and the trail', async () => {
    const { id } = await aRecordClosedOnTheOwnersWords()
    const undone = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/2/revoke`,
      headers: AS_PERSON,
    })
    expect(undone.statusCode, undone.body).toBe(200)
    const all = (await versions(id)).revisions

    const act = await row(id, at(all, 2), all)
    expect(act.said, 'a revoked act still claims to stand on the owner\'s words').not.toContain(ON_THE_OWNERS_WORDS)
    expect(act.said, 'the row does not say the owner took it back').toContain('taken back at version 3')
    expect(act.said, 'the trail lost the owner\'s words when the owner revoked the act').toContain(THE_OWNERS_WORDS.words)
    // THE SHARED SENTENCE FOR A REVOCATION, the one @shared/warrant.ts writes for every surface.
    expect(act.said).toContain(`person "${THE_TEST_OFFICES_OWNER.id}" revoked this on`)
    expect(act.said).toContain('and it was undone')

    const revocation = await row(id, at(all, 3), all)
    expect(revocation.said, 'the revocation is drawn as an act on the owner\'s words').not.toContain(ON_THE_OWNERS_WORDS)
    expect(revocation.said, 'the revocation does not read as one').toContain('took version 2 back')
    expect(revocation.said).toContain(`person "${THE_TEST_OFFICES_OWNER.id}" revoked this on`)
    expect(revocation.said).toContain('and it was undone')
    expect(revocation.markup, 'the revocation quotes words it was not made on').not.toContain('px-owner-words')
  })
})
