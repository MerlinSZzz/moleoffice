// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHANGE LOG AND THE EXPORT NAME THE KEY THAT PROVED A ROW ONLY WHERE IT PROVED ANOTHER WRITER.
 *
 * Everything here is made up: the agents, the runs, the notes and every word in them. No model, provider or real office
 * is used. `freshDb` makes a throwaway database, and the keys written beside it are random bytes.
 *
 * A run a starter files by hand for its agent stores, on its create and on its mint, the starter's key as the key that
 * proved them (tests/a-run-its-starter-files-is-proved-by-its-own-key.test.ts). The writer of those rows is the same
 * starter: the row names it by its handle, and the key proved its registry id. Words saying that the starter wrote this
 * while the request named the starter would only repeat the writer, and drawn in the stand-out style they would say a
 * key was used under another name, which did not happen. So a row whose key proved its own writer draws no such words.
 * A row whose key proved another agent, as history written before an agent's key under another name was refused, and a
 * row the office's key wrote under an agent's name, draw their words as before.
 *
 * WHAT IS PROVED, each case on its own:
 *
 *   1. The served change rows say which is which. The run's rows that carry the starter's key say the key proved the
 *      writer, though the writer is named by its handle and the key proved its registry id, so two strings are not what
 *      decides it. The row whose key proved another agent and the office's row say it did not. A row with no holder
 *      carries neither the holder nor the answer.
 *   2. The page draws each served row. The run's rows draw no proved-by line. The row whose key proved another agent
 *      draws the stand-out line, the office's row draws its own line, and a row served without the answer draws the
 *      line as before.
 *   3. The export. The headings of the run's revision pages and change-log rows carry no proved-by words, and the
 *      stored holder is still in their data. The other agent's row and the office's row keep their words, with the
 *      holder's name.
 *   4. Only when PROVED_BY_ROW_SHOTS names a folder: pictures at 1440, 990, 660 and 390 wide, light and dark, of the
 *      run's change log and of a note whose row's key proved another agent, from a real stack and a real browser.
 *
 * The page's words are read from the function that makes them. The export's proved-by words are not copied here: a
 * heading is read as what stands between the writer and the record's title, which is nothing or the words.
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Change, ProvedHolder } from '../src/shared/types.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ACTOR_HEADERS } from '../src/shared/request-headers.ts'
import { t as words } from '../src/shared/i18n.ts'
import { apiApp, freshDb, liveApp, thePersonsKeyHeader, waitForThePage, type TestDb } from './helpers.ts'

/** Made-up keys, written beside the throwaway database before the server is built. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const WORKSPACE = 'default'
const STARTER = 'starts-s'
const WORKER = 'works-w'
const OTHER = 'other-o'
const RUN_TITLE = 'A made-up run filed by hand for its agent'
const OTHER_TITLE = 'A made-up note whose row a key of another agent proved'
const OFFICE_TITLE = "A made-up note the office's key wrote under the starter's name"
const PLAIN_TITLE = 'A made-up note the starter wrote under its own name'

/** One request, the same whether it goes to an in-process server or to a real listener. */
type Send = (method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown) => Promise<{ status: number; body: any; text: string }>

/** The made-up office every case reads: the registry ids, the run and the three notes. */
interface AnOffice {
  idOf: Record<string, string>
  run: string
  plainNote: string
  officeNote: string
}

/**
 * Registers the starter and two agents it starts, files a run of the starter and a run of its agent with the office's
 * key, and then the run the starter files by hand for its agent with its own key, derived from the agent's run, as a run
 * is continued after a login limit. Two notes follow:
 * one the starter writes under its own name and key, and one the office's key writes under the starter's name.
 */
async function aMadeUpOffice(send: Send, keys: { person: string; office: string }): Promise<AnOffice> {
  const idOf: Record<string, string> = {}
  const keyOf: Record<string, string> = {}
  const asThePerson = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': keys.person }
  const asAgent = (handle: string) => ({ 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': keyOf[handle]! })
  const asTheOffice = (named: string) => ({ 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': named, 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': keys.office })
  const register = async (handle: string, role: string, headers: Record<string, string>) => {
    const reply = await send('POST', '/api/agents/started', headers, { handle, name: handle, role, chapters: ['5:full'], ...(role === 'worker' ? { workArea: ['src/server/lib'] } : {}) })
    expect(reply.status, reply.text).toBe(201)
    idOf[handle] = String(reply.body.agent.id)
    keyOf[handle] = String(reply.body.whatToGiveIt?.key ?? '')
    expect(keyOf[handle], `no key was given to ${handle}`).not.toBe('')
  }
  const file = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
    const reply = await send('POST', '/api/records', headers, payload)
    expect(reply.status, reply.text).toBe(201)
    return reply
  }
  await register(STARTER, 'supervisor', asThePerson)
  await register(WORKER, 'worker', asAgent(STARTER))
  await register(OTHER, 'worker', asAgent(STARTER))
  const aRunOf = (handle: string) => file(asTheOffice(THE_MESSAGE_WORKER_ID), {
    kind: 'session', title: `A made-up run of ${handle}`,
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[handle], doing: 'Made up.' },
  })
  const starterRun = await aRunOf(STARTER)
  const oldRun = await aRunOf(WORKER)
  const run = await file({ ...asAgent(STARTER), [ACTOR_HEADERS.session]: String(starterRun.body.record.id) }, {
    kind: 'session', title: RUN_TITLE,
    data: { state: 'running', runtime: 'claude-code', servingAgent: WORKER, servingAgentId: idOf[WORKER], parentAttachment: String(starterRun.body.record.id), doing: RUN_TITLE },
    links: [{ type: 'derived_from', toId: String(oldRun.body.record.id) }],
  })
  expect(String(run.body.runKey?.key ?? ''), 'the starter was given no run key, so this is not the path that mints one').not.toBe('')
  const plainNote = await file(asAgent(STARTER), { kind: 'note', title: PLAIN_TITLE, data: { body: 'Made-up words.' } })
  const officeNote = await file(asTheOffice(STARTER), { kind: 'note', title: OFFICE_TITLE, data: { body: 'Made-up words.' } })
  return { idOf, run: String(run.body.record.id), plainNote: String(plainNote.body.record.id), officeNote: String(officeNote.body.record.id) }
}

/** The holder a row whose key proved another agent carries: the starter's key, with the other agent's name in the headers. */
const theStartersKeyUnder = (office: AnOffice, claimed: string): ProvedHolder => ({ id: office.idOf[STARTER]!, how: 'an-agent-key', claimed })

let t: TestDb
let app: FastifyInstance
let office: AnOffice
let otherNote: string

const send: Send = async (method, url, headers, payload) => {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: reply.statusCode, body: reply.body === '' ? null : reply.json(), text: reply.body }
}

/** The change rows about one record as the office serves them. */
async function served(record: string): Promise<Change[]> {
  const reply = await send('GET', `/api/changes?recordId=${record}`, { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': A_MADE_UP_PERSON_KEY })
  expect(reply.status, reply.text).toBe(200)
  return reply.body.changes as Change[]
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  office = await aMadeUpOffice(send, { person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY })
  // MADE-UP HISTORY: no door writes an agent's key under another agent's name any more, so this row is written through
  // the product's own writer with the holder set, as such a row was written before that was refused.
  otherNote = t.api.createRecord({
    workspaceId: WORKSPACE, kind: 'note', title: OTHER_TITLE, data: { body: 'Made-up words.' },
    actor: { type: 'agent', id: OTHER, provedHolder: theStartersKeyUnder(office, OTHER) },
  }).id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** The run's served rows that carry a holder, after checking there are some: its create and its mint at least. */
async function theRunsRowsWithAHolder(): Promise<Change[]> {
  const rows = (await served(office.run)).filter((row) => row.provedHolder !== null && row.provedHolder !== undefined)
  expect(rows.map((row) => row.op), 'the create and the mint carry the key that proved them').toContain('create')
  expect(rows.length).toBeGreaterThanOrEqual(2)
  return rows
}

describe('1. the served change rows say whether the key proved the writer', () => {
  it("says yes on the run's rows, though the writer is named by its handle and the key proved its registry id", async () => {
    expect(office.idOf[STARTER], 'the registry id is not the handle').not.toBe(STARTER)
    for (const row of await theRunsRowsWithAHolder()) {
      expect(row.actorId).toBe(STARTER)
      expect(row.provedHolder).toEqual(theStartersKeyUnder(office, STARTER))
      expect(row.provedHolderIsTheWriter, `${row.op} ${String(row.field)}`).toBe(true)
    }
  })

  it("says no on a row whose key proved another agent, and on the office's row", async () => {
    const [other] = await served(otherNote)
    expect(other!.provedHolder).toEqual(theStartersKeyUnder(office, OTHER))
    expect(other!.provedHolderIsTheWriter).toBe(false)
    const [byTheOffice] = await served(office.officeNote)
    expect(byTheOffice!.actorId).toBe(STARTER)
    expect(byTheOffice!.provedHolder?.how).toBe('the-office-key')
    expect(byTheOffice!.provedHolderIsTheWriter).toBe(false)
  })

  it('carries no answer on a row with no holder', async () => {
    const plain = await served(office.plainNote)
    const links = (await served(office.run)).filter((row) => row.op === 'link')
    expect(plain.length).toBeGreaterThan(0)
    expect(links.length, 'the run is linked to the run it continues').toBeGreaterThan(0)
    for (const row of [...plain, ...links]) {
      expect(row.provedHolder ?? null).toBeNull()
      expect('provedHolderIsTheWriter' in row).toBe(false)
    }
  })
})

describe('2. the page draws a proved-by line only where the key proved another writer', () => {
  /** One served row, drawn by the component every change list draws its rows with. */
  const drawn = async (change: Change) => {
    const cl = await import('../src/web/components/ChangeLog.tsx')
    return renderToStaticMarkup(createElement(cl.ChangeMeta, { change, sessions: null }))
  }
  /** The sentence for a holder, escaped as the page escapes it. */
  const sentence = async (holder: ProvedHolder) => {
    const cl = await import('../src/web/components/ChangeLog.tsx')
    return renderToStaticMarkup(createElement('i', null, cl.provedHolderSentence(holder))).slice('<i>'.length, -'</i>'.length)
  }

  it("draws no proved-by line on the run's rows", async () => {
    for (const row of await theRunsRowsWithAHolder()) {
      const page = await drawn(row)
      expect(page).not.toContain('chg-proved')
      expect(page).not.toContain(await sentence(row.provedHolder!))
    }
  })

  it("draws the stand-out line on a row whose key proved another agent, and the office's line on the office's row", async () => {
    const [other] = await served(otherNote)
    const page = await drawn(other!)
    expect(page).toContain('class="chg-proved-out"')
    expect(page).toContain(await sentence(other!.provedHolder!))
    const [byTheOffice] = await served(office.officeNote)
    const officePage = await drawn(byTheOffice!)
    expect(officePage).toContain('class="chg-proved"')
    expect(officePage).toContain(await sentence(byTheOffice!.provedHolder!))
    expect(await sentence(byTheOffice!.provedHolder!)).toBe(words('g2d.changeLog.officeActingAs', { claimed: STARTER }))
  })

  it('draws the line as before on a row served without the answer', async () => {
    const [row] = await theRunsRowsWithAHolder()
    const withoutTheAnswer: Change = { ...row! }
    delete withoutTheAnswer.provedHolderIsTheWriter
    const page = await drawn(withoutTheAnswer)
    expect(page).toContain('class="chg-proved-out"')
    expect(page).toContain(await sentence(row!.provedHolder!))
  })
})

describe('3. the export heads a row with proved-by words only where the key proved another writer', () => {
  let files: Map<string, string>
  beforeAll(async () => {
    const { buildExport } = await import('../src/server/lib/export.ts')
    // THE WHOLE OFFICE'S EXPORT, which reads the agents and so names a holder by its name.
    files = new Map(buildExport().files.map((file) => [file.path, file.text]))
  }, 120_000)

  /** Every change-log heading line of the export that ends with `title`. */
  const headingsOf = (title: string) =>
    [...files].filter(([path]) => path.startsWith('changes/')).flatMap(([, page]) => page.split('\n')).filter((line) => line.startsWith('### ') && line.endsWith(` · ${title}`))
  /** What a heading of `title` written by `writer` says between the writer and the title: the proved-by words, or nothing. */
  const theWordsBetween = (heading: string, writer: string, title: string) => {
    const from = heading.indexOf(`agent:${writer}`)
    expect(from, heading).toBeGreaterThan(0)
    return heading.slice(from + `agent:${writer}`.length, heading.length - ` · ${title}`.length)
  }
  it("heads the run's change-log rows and its first two revisions with no proved-by words, and keeps the holder in their data", () => {
    const headings = headingsOf(RUN_TITLE)
    expect(headings.length).toBeGreaterThanOrEqual(2)
    for (const heading of headings) expect(theWordsBetween(heading, STARTER, RUN_TITLE), heading).toBe('')
    const stored = `provedHolder: ${JSON.stringify(theStartersKeyUnder(office, STARTER))}`
    const changePages = [...files].filter(([path]) => path.startsWith('changes/')).map(([, page]) => page).join('\n')
    expect(changePages.split(stored).length - 1, 'the create and the mint keep the holder in the change rows').toBeGreaterThanOrEqual(2)
    for (const seq of [1, 2]) {
      const page = files.get(`revisions/${office.run}/${String(seq)}.md`)
      expect(page, `revision ${String(seq)}`).toBeDefined()
      expect(page).toContain(stored)
      expect(page).toContain(`by agent:${STARTER}.`)
    }
  })

  it("heads the other agent's row and the office's row with their words, the first naming the starter", () => {
    const [byTheOffice] = headingsOf(OFFICE_TITLE)
    expect(theWordsBetween(byTheOffice!, STARTER, OFFICE_TITLE), "the office's row is headed with words").not.toBe('')
    const [heading] = headingsOf(OTHER_TITLE)
    const said = theWordsBetween(heading!, OTHER, OTHER_TITLE)
    expect(said).not.toBe('')
    expect(said).toContain(STARTER)
    const revision = files.get(`revisions/${otherNote}/1.md`)
    expect(revision).toContain(`by agent:${OTHER}${said}.`)
  })
})

describe('4. the pictures', () => {
  it.skipIf(!process.env['PROVED_BY_ROW_SHOTS'])(
    "photographs the run's change log and a row whose key proved another agent, at 1440, 990, 660 and 390 in both themes",
    async () => {
      const shots = process.env['PROVED_BY_ROW_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({ name: 'proved-by-row-photos', viewport: { width: 1440, height: 1000 }, workspace: WORKSPACE })
      try {
        const keysFile = join(live.dir, 'keys.json')
        const held = JSON.parse(readFileSync(keysFile, 'utf8')) as { office?: unknown }
        expect(typeof held.office, 'the live office made no office key').toBe('string')
        const liveSend: Send = async (method, url, headers, payload) => {
          const reply = await fetch(`${live.api}${url}`, { method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) })
          const text = await reply.text()
          return { status: reply.status, body: text === '' ? null : JSON.parse(text), text }
        }
        const made = await aMadeUpOffice(liveSend, { person: thePersonsKeyHeader(keysFile)['x-mole-office-key']!, office: held.office as string })
        // MADE-UP HISTORY, as in the cases above: a note's change row is given a holder that is another agent than its
        // writer, because no door writes one any more.
        const note = await liveSend('POST', '/api/records', { 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': OTHER, 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': held.office as string }, { kind: 'note', title: OTHER_TITLE, data: { body: 'Made-up words.' } })
        expect(note.status, note.text).toBe(201)
        const Database = (await import('better-sqlite3')).default
        const db = new Database(join(live.dir, 'panelx.db'))
        db.prepare('UPDATE changes SET proved_holder = ? WHERE record_id = ?').run(JSON.stringify(theStartersKeyUnder(made, OTHER)), String(note.body.record.id))
        db.close()

        for (const [name, record] of [['the-hand-filed-run', made.run], ['a-row-whose-key-proved-another-agent', String(note.body.record.id)]] as const) {
          await live.page.setViewportSize({ width: 1440, height: 1000 })
          // IN DEVELOPER MODE, where the change log is drawn, with its fold opened.
          await live.page.goto(`${live.site}/?mode=inspect#/r/${record}`, { timeout: 60_000 })
          await waitForThePage(live.page, 60_000)
          await live.page.locator(`summary:has-text("${words('record.seeChanges')}")`).click()
          await live.page.locator('.chg-meta').first().waitFor()
          if (record === made.run) expect(await live.page.locator('.chg-proved-out, .chg-proved').count()).toBe(0)
          else await live.page.locator('.chg-proved-out').first().waitFor()
          for (const width of [1440, 990, 660, 390]) {
            for (const theme of ['light', 'dark'] as const) {
              await live.page.setViewportSize({ width, height: 1000 })
              await live.page.emulateMedia({ colorScheme: theme })
              await live.page.screenshot({ path: join(shots, `${name}-${String(width)}-${theme}.png`), fullPage: true })
            }
          }
        }
      } finally {
        await live.stop()
      }
    },
    300_000,
  )
})
