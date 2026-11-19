// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION I3: an agent reads a folder into ONE draft, and nothing enters the project until a
 * person presses accept.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Filing a reading writes one row and no records at all.
 *   2. A piece with no file behind it, or no words quoted from one, is refused.
 *   3. A piece that could never become a record is refused when the draft is filed, not when the
 *      person presses accept.
 *   4. An agent may not accept a piece. Not even the agent that filed the draft.
 *   5. A person accepting one piece writes exactly one record, marked with the folder, the files
 *      and the draft it came from.
 *   6. A person rejecting one writes nothing.
 *   7. The page draws the pieces, the files and the quotes, and the press works on it.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let draftId: string

const WORKSPACE = 'default'

const AS_AN_AGENT: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code-the-reader',
}
const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const said = await reply.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(said) as Record<string, unknown>
  } catch {
    parsed = {}
  }
  return { status: reply.status, said, body: parsed }
}

async function howManyRecords(): Promise<number> {
  const reply = await fetch(`${app.api}/api/records`, { headers: AS_AN_AGENT })
  const body = (await reply.json()) as { records: unknown[] }
  return body.records.length
}

/** The reading this file works from. Two pieces, both with a file and a quote. */
const AREADING = {
  folder: '/somewhere/a-stranger-keeps-their-work',
  note: 'Read for this test.',
  couldNotTell: [{ what: 'Whether anybody still uses it', because: 'Nothing in the folder is dated.' }],
  pieces: [
    {
      kind: 'note',
      title: 'The scripts talk to a service called Modal',
      summary: 'The guide says what it is for.',
      data: {},
      from: ['GUIDE.md'],
      quote: 'Modal runs your Python functions on remote cloud workers.',
    },
    {
      kind: 'note',
      title: 'There is a trained model file beside the scripts',
      summary: null,
      data: {},
      from: ['train.py', 'trained_model.pt'],
      quote: 'Return the trained weights back to your machine and save them locally.',
    },
  ],
}

beforeAll(async () => {
  app = await liveApp({ name: 'folder-reading', viewport: { width: 1440, height: 1000 } })
  // THE WRITER IS A REGISTERED AGENT BEFORE IT FILES ANYTHING. The refusal for an agent id no
  // registry holds now lives in `actorFrom` (src/server/lib/http.ts), so this door refuses a
  // made-up name as every writing door does. The subject here is the draft and not who may file
  // one, so the reader is registered first and nothing else about this file changes.
  const registered = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: { ...AS_THE_PERSON },
    body: JSON.stringify({ handle: 'claude-code-the-reader', name: 'The reader' }),
  })
  expect(registered.status, await registered.text()).toBe(201)
}, 300_000)

afterAll(async () => {
  await app.stop()
})

describe("a stranger's folder becomes a draft, not records", () => {
  it('files one draft and no records at all', async () => {
    const before = await howManyRecords()
    const filed = await post('/api/import/draft', AREADING, AS_AN_AGENT)
    expect(filed.status, filed.said).toBe(201)
    const draft = filed.body['draft'] as { id: string; pieces: { state: string }[]; where: Record<string, number> }
    draftId = draft.id
    expect(draft.pieces.length, 'the draft did not carry every piece it was given').toBe(AREADING.pieces.length)
    expect(
      draft.pieces.every((piece) => piece.state === 'proposed'),
      'a piece arrived in the project already decided',
    ).toBe(true)
    expect(await howManyRecords(), 'filing a reading wrote a record').toBe(before)
  })

  it('refuses a piece with no file behind it, and one with nothing quoted', async () => {
    const noFile = await post(
      '/api/import/draft',
      { ...AREADING, pieces: [{ ...AREADING.pieces[0], from: [] }] },
      AS_AN_AGENT,
    )
    expect(noFile.status, 'a piece with no file behind it was stored').toBe(400)
    const noQuote = await post(
      '/api/import/draft',
      { ...AREADING, pieces: [{ ...AREADING.pieces[0], quote: '' }] },
      AS_AN_AGENT,
    )
    expect(noQuote.status, 'a piece quoting nothing was stored').toBe(400)
  })

  it('refuses a piece that could never become a record, while the agent still has the folder open', async () => {
    const wrong = await post(
      '/api/import/draft',
      {
        ...AREADING,
        pieces: [{ ...AREADING.pieces[0], kind: 'claim', data: { state: 'made-up-word' } }],
      },
      AS_AN_AGENT,
    )
    expect(wrong.status, 'a piece with a field no kind accepts was stored').toBe(400)
    expect(String(wrong.body['error']), 'the refusal does not name the field that is wrong').toContain('state')
    expect(String(wrong.body['error']), 'the refusal does not say which piece').toContain('piece 1')
  })

  it('refuses every agent the press that puts a record in the project', async () => {
    const reading = await fetch(`${app.api}/api/import/drafts/${draftId}`, { headers: AS_AN_AGENT })
    const body = (await reading.json()) as { draft: { pieces: { id: string }[] } }
    const piece = body.draft.pieces[0]!
    const before = await howManyRecords()
    const refused = await post(
      `/api/import/drafts/${draftId}/pieces/${piece.id}`,
      { press: 'accept' },
      AS_AN_AGENT,
    )
    expect(refused.status, 'an agent accepted a piece into the project').toBe(403)
    expect(String(refused.body['error']), 'the refusal does not say who asked').toContain('claude-code-the-reader')
    expect(await howManyRecords(), 'a record was written by a refused request').toBe(before)
  })

  it('writes one record when a person accepts, marked with where it came from', async () => {
    const reading = await fetch(`${app.api}/api/import/drafts/${draftId}`, { headers: AS_AN_AGENT })
    const body = (await reading.json()) as { draft: { pieces: { id: string; title: string }[] } }
    const piece = body.draft.pieces[0]!
    const before = await howManyRecords()
    const accepted = await post(
      `/api/import/drafts/${draftId}/pieces/${piece.id}`,
      { press: 'accept' },
      AS_THE_PERSON,
    )
    expect(accepted.status, accepted.said).toBe(200)
    expect(await howManyRecords(), 'accepting one piece wrote something other than one record').toBe(before + 1)
    const written = accepted.body['piece'] as { recordId: string; state: string }
    expect(written.state).toBe('accepted')
    const record = await fetch(`${app.api}/api/records/${written.recordId}`, { headers: AS_AN_AGENT })
    const got = (await record.json()) as { record: { title: string; origin: string; data: { source?: string } } }
    expect(got.record.title).toBe(piece.title)
    expect(got.record.origin, 'the record was not marked as authored work').toBe('authored')
    expect(got.record.data.source, 'the record does not say which folder it came from').toContain(AREADING.folder)
    expect(got.record.data.source, 'the record does not say which draft it came from').toContain(draftId)
    expect(got.record.data.source, 'the record does not say which file it came from').toContain('GUIDE.md')
  })

  it('writes nothing when a person rejects', async () => {
    const reading = await fetch(`${app.api}/api/import/drafts/${draftId}`, { headers: AS_AN_AGENT })
    const body = (await reading.json()) as { draft: { pieces: { id: string; state: string }[] } }
    const piece = body.draft.pieces.find((one) => one.state === 'proposed')!
    const before = await howManyRecords()
    const rejected = await post(
      `/api/import/drafts/${draftId}/pieces/${piece.id}`,
      { press: 'reject' },
      AS_THE_PERSON,
    )
    expect(rejected.status, rejected.said).toBe(200)
    expect(await howManyRecords(), 'rejecting a piece wrote a record').toBe(before)
    expect((rejected.body['piece'] as { state: string }).state).toBe('rejected')
  })

  it('draws every piece with its files and its quote, and the press works', async () => {
    const second = await post('/api/import/draft', AREADING, AS_AN_AGENT)
    expect(second.status, second.said).toBe(201)
    const secondDraft = second.body['draft'] as { id: string; pieces: { id: string; title: string }[] }
    const piece = secondDraft.pieces.find((one) => one.title === 'The scripts talk to a service called Modal')!
    const page = app.page
    await page.goto(`${app.site}/#/folder-reading`)
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.fr-piece', { timeout: 30_000 })
    const text = await page.locator('main').innerText()
    expect(text, 'the page does not name the folder').toContain(AREADING.folder)
    expect(text, 'the page does not draw a piece').toContain('The scripts talk to a service called Modal')
    expect(text, 'the page does not say which file a piece came from').toContain('GUIDE.md')
    expect(text, 'the page does not show the words a piece rests on').toContain('remote cloud workers')

    const before = await howManyRecords()
    const pressed = `.fr-piece[data-draft="${secondDraft.id}"][data-piece="${piece.id}"]`
    await page.locator(pressed).getByRole('button', { name: 'Accept' }).click()
    // THE PRESSED PIECE ITSELF, NOT ANY ACCEPTED PIECE. The page draws every draft, and the first
    // draft already holds a piece an earlier case accepted, so a wait for any accepted piece is met
    // before the press is answered and the count below read the old number (problem Z49v0FpzxfaM).
    // The page marks this piece accepted only after the server answered and the list was read again,
    // and the server writes the record before it stores the piece as accepted, so one count is enough.
    await page.waitForSelector(`${pressed}.fr-accepted`, { timeout: 30_000 })
    expect(await howManyRecords(), 'pressing Accept on the page wrote no record').toBe(before + 1)
  }, 240_000)
})
