// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROW SAYS WHO THE KEY PROVED, BESIDE THE NAME THE HEADERS GAVE. Criterion P83, point 5, on
 * the ruling of 13 September 2026 (Q1(b) and Q2).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Where a request carries a key, the act is attributed to the key's holder, and a header naming
 * somebody else is recorded beside the proved id on the row that records the act. `actor_id` keeps
 * the header's name — the ruling's Q1(b), because six of the office's own processes send the office's key
 * under an agent's name on every request and the change log must keep naming the agent — and the new
 * column carries the proof.
 *
 * ONE CASE IS REFUSED NOW. An AGENT's key under another agent's name is refused by the owner's decision of 25 September
 * 2026, so case 1 expects the refusal and no row.
 * tests/a-key-and-a-header-that-name-two-agents-are-refused.test.ts holds that rule on every door.
 * The office's key and the person's key under another name still write, and the column still
 * carries the proof for them. The person's key is the case that would have been silently lost at
 * src/server/lib/http.ts's `actorFrom`: there the key replaces the name, so `actor_id` is the person
 * and the discarded name survives only in the new column. That is what makes the column more than
 * decoration.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL SOCKET AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The rule is about a request that CARRIES A KEY to a listener. A key is compared in one place and
 * works on either kind of request, but the facts this row records are about what a caller proved on
 * the wire; a real listener is what the six tools and the browser use. So this listens and drives it
 * with `fetch`.
 *
 * EVERY KEY VALUE HERE IS MADE UP OR MINTED BY THIS TEST'S OWN SERVER, and none is printed: the
 * office's and the person's are `randomBytes`, and the agent's is answered once by the registration
 * door below.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, liveApp, theOfficesOwnId, waitForThePage, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** Made-up secrets. Never the office's real ones, and never printed. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

let t: TestDb
let app: FastifyInstance
let door = ''
/** Minted by this test's own registration door, so it is a key the office made and not a fixture. */
let quillKey = ''
/**
 * The registry id the office gave quill when it registered it. It is not the handle. A key proves
 * the id of the agent that holds it, so this is what the column stores as the proved holder.
 */
let quillId = ''

const NOTE = (title: string): Record<string, unknown> => ({
  kind: 'note',
  title,
  data: { body: `Written to read the row for "${title}".` },
})

interface Proved {
  id: string
  how: string
  claimed: string
}

interface Row {
  type: string
  id: string
  proved: Proved | null
}

async function ask(
  path: string,
  method: 'POST' | 'GET',
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; said: Record<string, unknown> }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: res.status, said: (await res.json()) as Record<string, unknown> }
}

/** Write one note through the real listener and return the record id and the status. */
async function writeANote(title: string, headers: Record<string, string>): Promise<{ status: number; id: string; error: string }> {
  const said = await ask('/api/records', 'POST', { 'content-type': 'application/json', ...headers }, NOTE(title))
  const record = said.said['record'] as { id?: string } | undefined
  return { status: said.status, id: record?.id ?? '', error: String(said.said['error'] ?? '') }
}

/** The newest change row about one record, with its proved-holder JSON parsed. */
function changeOn(recordId: string): Row | undefined {
  const row = t.client.sqlite
    .prepare(
      'SELECT actor_type AS type, actor_id AS id, proved_holder AS proved FROM changes ' +
        'WHERE record_id = ? ORDER BY rowid DESC LIMIT 1',
    )
    .get(recordId) as { type: string; id: string; proved: string | null } | undefined
  if (row === undefined) return undefined
  return { type: row.type, id: row.id, proved: row.proved === null ? null : (JSON.parse(row.proved) as Proved) }
}

/** The newest revision row about one record, with its proved-holder JSON parsed. */
function revisionOn(recordId: string): Proved | null {
  const row = t.client.sqlite
    .prepare('SELECT proved_holder AS proved FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    .get(recordId) as { proved: string | null } | undefined
  if (row === undefined || row.proved === null) return null
  return JSON.parse(row.proved) as Proved
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // A REGISTRATION UNDER THE PERSON'S KEY, so the agent's key is one the office made and answered
  // once. The person's key alone is enough to file it; the reply carries the key and nothing stores
  // it on this side.
  const registered = await ask(
    '/api/agents/started',
    'POST',
    { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': A_MADE_UP_PERSON_KEY },
    { handle: 'quill', name: 'Quill', role: 'worker', runtime: 'dsh' },
  )
  expect(registered.status, JSON.stringify(registered.said)).toBe(201)
  quillKey = String((registered.said['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
  expect(quillKey, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  quillId = String((registered.said['agent'] as { id?: string } | undefined)?.id ?? '')
  expect(quillId, 'the registration answered no registry id').not.toBe('')
  /**
   * AND THE NAME THE KEY IS USED UNDER IS REGISTERED TOO. The records door refuses a write under an
   * agent id no registry row holds, so a second agent has to exist before `tamp` can stand in for the
   * name a key disagrees with. With `tamp` registered, quill's key under `tamp`'s name is refused for
   * the mismatch itself (case 1), and not because `tamp` is unknown.
   */
  const tamp = await ask(
    '/api/agents/started',
    'POST',
    { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': A_MADE_UP_PERSON_KEY },
    { handle: 'tamp', name: 'Tamp', role: 'worker', runtime: 'dsh' },
  )
  expect(tamp.status, JSON.stringify(tamp.said)).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the actor keeps the header’s name and the column carries the proof', () => {
  it('1. an AGENT’s key under another agent’s name is refused, and no row is written', async () => {
    const wrote = await writeANote('agent key under another name', {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'tamp',
      'x-mole-office-key': quillKey,
    })
    expect(wrote.status, wrote.error).toBe(403)
    expect(wrote.error).toContain('This request carries the key of Quill ("quill") and its header names Tamp ("tamp").')
    const written = t.client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM changes WHERE proved_holder LIKE '%an-agent-key%'")
      .get() as { n: number }
    expect(written.n).toBe(0)
  })

  it('2. the OFFICE’s key under an agent’s name is recorded too, because the office does this constantly', async () => {
    const wrote = await writeANote('office key under an agent name', {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'tamp',
      'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
    })
    expect(wrote.status, wrote.error).toBe(201)
    expect(changeOn(wrote.id)).toEqual({
      type: 'agent',
      id: 'tamp',
      proved: { id: theOfficesOwnId(t), how: 'the-office-key', claimed: 'tamp' },
    })
  })

  it('3. the PERSON’s key under an agent’s name records the name the key discarded', async () => {
    const wrote = await writeANote('person key under an agent name', {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'quill',
      'x-mole-office-key': A_MADE_UP_PERSON_KEY,
    })
    expect(wrote.status, wrote.error).toBe(201)
    // THE KEY REPLACED THE NAME, so the actor is the person and the header's name survives only in
    // the column. That is what makes the column more than decoration.
    expect(changeOn(wrote.id)).toEqual({
      type: 'human',
      id: THE_PERSON,
      proved: { id: THE_PERSON, how: 'the-person-key', claimed: 'quill' },
    })
  })

  it('4. a key and headers that AGREE write nothing, so absence means agreement', async () => {
    const wrote = await writeANote('an agent key under its own name', {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'quill',
      'x-mole-office-key': quillKey,
    })
    expect(wrote.status, wrote.error).toBe(201)
    expect(changeOn(wrote.id)).toEqual({ type: 'agent', id: 'quill', proved: null })
  })

  it('5. a request with NO key writes nothing, because there is no proof to disagree with', async () => {
    const wrote = await writeANote('no key at all', {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'tamp',
    })
    expect(wrote.status, wrote.error).toBe(201)
    expect(changeOn(wrote.id)).toEqual({ type: 'agent', id: 'tamp', proved: null })
  })

  /**
   * THE TWO LEDGERS, ON A ROW THAT STILL CARRIES A PROOF. This used an agent's key under another
   * name until a decision refused that. The office's key under an agent's
   * name still writes such a row, so it is what the two ledgers are compared on now.
   */
  it('6. the revision ledger carries the same fact as the change log for one write', async () => {
    const wrote = await writeANote('the two ledgers must agree', {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'tamp',
      'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
    })
    expect(wrote.status, wrote.error).toBe(201)
    const proved = { id: theOfficesOwnId(t), how: 'the-office-key', claimed: 'tamp' }
    expect(changeOn(wrote.id)?.proved).toEqual(proved)
    expect(revisionOn(wrote.id)).toEqual(proved)
  })

  it('6b. an agent’s key under another agent’s name reaches neither ledger', async () => {
    const wrote = await writeANote('the refused write reaches no ledger', {
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'tamp',
      'x-mole-office-key': quillKey,
    })
    expect(wrote.status, wrote.error).toBe(403)
    const revisions = t.client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM revisions WHERE proved_holder LIKE '%an-agent-key%'")
      .get() as { n: number }
    expect(revisions.n).toBe(0)
  })
})

// ============================================================================ the drawing

/**
 * THE TWO SENTENCES, DRAWN. Both change lists in the app draw one component, `ChangeMeta`, so this
 * exercises that component and the words it puts on the row. The mutation is the office case folded
 * into the agent sentence: the office sentence is the ordinary one and the agent one stands out.
 */
describe('7. the row says which of the two it is', () => {
  it('names the office as the ordinary case and an agent mismatch as the one that stands out', async () => {
    const cl = await import('../src/web/components/ChangeLog.tsx')
    const office = { id: 'mole-office', how: 'the-office-key', claimed: 'tamp' } as const
    const agent = { id: 'quill', how: 'an-agent-key', claimed: 'tamp' } as const
    expect(cl.provedHolderSentence(office)).toBe('The office, acting as tamp.')
    expect(cl.provedHolderSentence(agent)).toBe('quill wrote this while the request named tamp.')
  })

  /**
   * AND THE HOLDER IS A NAME, NOT THE ID A KEY PROVED. Criterion I4.
   *
   * `held_keys.whose_id` is a registry id since I-5, so a change row that printed it put a lookup
   * key where a name belongs. The page hands the registries down and this draws the agent's name,
   * with its retirement date where it is retired. Where no registry row answers, the id is drawn as
   * an id rather than dressed as a name.
   */
  it('names the proved holder from the registry, with its retirement date where it is retired', async () => {
    const cl = await import('../src/web/components/ChangeLog.tsx')
    const holder = { id: 'minted-holder', how: 'an-agent-key', claimed: 'tamp' } as const
    const participants = {
      people: [],
      agents: [
        {
          kind: 'agent',
          id: 'minted-holder',
          name: 'Quill',
          handle: 'quill',
          avatarUrl: '/api/portraits/role/worker/worker-1',
          state: null,
          stateAt: null,
          createdAt: '2026-09-23 09:00:00',
          homeWorld: null,
          retired: true,
          retiredAt: '2026-09-23 10:00:00',
        },
      ],
    } as unknown as Parameters<typeof cl.provedHolderSentence>[1]
    expect(cl.provedHolderSentence(holder, participants)).toBe(
      'Quill — retired 2026-09-23 10:00:00 wrote this while the request named tamp.',
    )
  })

  it('keeps the id where no registry row answers, rather than inventing a name', async () => {
    const cl = await import('../src/web/components/ChangeLog.tsx')
    const holder = { id: 'minted-holder', how: 'an-agent-key', claimed: 'tamp' } as const
    expect(cl.provedHolderSentence(holder, { people: [], agents: [] })).toBe(
      'minted-holder wrote this while the request named tamp.',
    )
  })
})

// ============================================================================ the pictures

/**
 * THE ROW, PHOTOGRAPHED, at four widths in both themes. Criterion P83, point 5, and chapter 6's
 * rule that every screen is looked at.
 *
 * `tools/review.mjs` cannot photograph anything today (problem bfvKtNhVC4L5), so this uses the shape
 * the other photographing tests use: a real stack through `liveApp`, a real browser, PNGs written
 * only when `P83_ATTRIBUTION_SHOTS` names a directory. The stack is the test's own.
 *
 * THE TWO ROWS ARE SEEDED THROUGH THE PRODUCT where the product can carry a key, and the change
 * row's own stored JSON through the database directly, because the point of the picture is the
 * DRAWING of a stored fact and no route answers with a proved holder of the test's choosing.
 */
describe('the change-log row with a proved holder', () => {
  it.skipIf(!process.env['P83_ATTRIBUTION_SHOTS'])(
    'photographs the office case and the named agent case at 1440, 990, 660 and 390 in both themes',
    async () => {
      const shots = process.env['P83_ATTRIBUTION_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({
        name: 'p83-attribution-photos',
        viewport: { width: 1440, height: 1000 },
        workspace: 'default',
      })
      try {
        const made = await fetch(`${live.api}/api/records`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-mole-office-workspace': 'default',
            'x-mole-office-actor-type': 'human',
            'x-mole-office-actor-id': THE_PERSON,
          },
          body: JSON.stringify({ kind: 'note', title: 'The two proved-holder rows', data: { body: 'A row to draw.' } }),
        })
        const record = ((await made.json()) as { record?: { id?: string } }).record
        expect(made.status, 'the record the rows hang off was not written').toBe(201)
        expect(record?.id).toBeTruthy()

        // The row the create wrote becomes the office case; a second row is the agent case. Both are
        // written through the same product doors above; only the stored proved holder is set here,
        // because no route lets a caller choose one.
        const Database = (await import('better-sqlite3')).default
        const db = new Database(join(live.dir, 'panelx.db'))
        const created = db
          .prepare('SELECT id, at FROM changes WHERE record_id = ? ORDER BY rowid DESC LIMIT 1')
          .get(String(record?.id)) as { id: string; at: string }
        db.prepare('UPDATE changes SET actor_id = ?, proved_holder = ? WHERE id = ?').run(
          'tamp',
          JSON.stringify({ id: 'mole-office', how: 'the-office-key', claimed: 'tamp' }),
          created.id,
        )
        db.prepare(
          'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, ' +
            'old_value, new_value, warrant, elevation, proved_holder, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(
          'p83-attribution-row',
          String(record?.id),
          'default',
          'update',
          'agent',
          'tamp',
          null,
          'data.body',
          'A',
          'B',
          null,
          null,
          JSON.stringify({ id: 'quill', how: 'an-agent-key', claimed: 'tamp' }),
          created.at,
        )
        db.close()

        // IN DEVELOPER MODE, where the change log is drawn (plan 7FEOshq3mBGG, G2c).
        await live.page.goto(`${live.site}/?mode=inspect#/r/${String(record?.id)}`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        // THE CHANGE LOG LIVES IN A FOLD, SHUT UNTIL PRESSED, so the pictures open it first.
        await live.page.locator('summary:has-text("see which fields changed")').click()
        await live.page.getByText('The office, acting as tamp.').first().waitFor()
        await live.page.getByText('Quill wrote this while the request named tamp.').first().waitFor()

        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.screenshot({
              path: `${shots}/p83-attribution-${String(width)}-${theme}.png`,
              fullPage: true,
            })
          }
        }
      } finally {
        await live.stop()
      }
    },
    300_000,
  )
})
