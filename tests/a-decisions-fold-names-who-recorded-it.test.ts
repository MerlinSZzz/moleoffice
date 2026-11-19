// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO RAW ID OR KIND REACHES THE READER ON A RECORD'S PAGE: WHO RECORDED A DECISION, WHAT IT RESTS ON, AND
 * WHICH MODEL A RUN WAS. Wave 13k round 39, piece 2.
 *
 * WHAT IS CLAIMED, each in English and in Chinese:
 *
 *   1. A decision's "Recorded by" drew the stored string, "human <id>" / 记录者 human <id>. It draws the
 *      writer's name now, read from the stored string the way the change log names a writer. Developer
 *      mode draws the stored string. `writerIn` in src/shared/sections.ts reads what `whoRecordedIt` in
 *      src/server/lib/records/who-recorded-it.ts writes, and the first case holds the two together.
 *   2. A decision's "Source of authority" drew the id of the record it rests on. It draws that record's
 *      title, as a link to it.
 *   3. A record written by an agent's run named the run but not its model. The run row in the change log
 *      and the change fold's line name the model by name ("Claude Opus 5.5"), from src/shared/model-names.ts.
 *      The stored model id is drawn only in developer mode (problem 2tbFWxiFyjtv). A model the names list
 *      does not hold is said to be one this office has no name for, not drawn as its id.
 *
 * MADE-UP RECORDS, in a fresh test database: one note the decisions rest on, one decision the person files,
 * one decision an agent files on the person's word, one problem, and two runs with their models.
 *
 * MUTATIONS, each after a control run (the commit that added this file names the logs):
 *   - src/web/pages/RecordPage.tsx: BodyValue ignoring `writer`. Case 1 goes red: the fold says "human …".
 *   - src/shared/sections.ts: `decision` taken out of RECORD_ID_LISTS. Case 2 goes red: the fold draws the id.
 *   - src/web/components/ChangeLog.tsx: `theModelSaid` returning the stored id. Case 3 goes red: the id is drawn
 *     outside developer mode.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { writerIn } from '../src/shared/sections.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')
type I18n = typeof import('../src/shared/i18n.ts')
type Mode = typeof import('../src/web/lib/mode.ts')

let t: TestDb
// Read after freshDb, because src/server/lib/records.ts opens the database when it is loaded.
let whoRecordedIt: typeof import('../src/server/lib/records.ts')['whoRecordedIt']
let app: FastifyInstance

const AGENT = 'd-records-on-the-owners-word'
const NOTE_TITLE = 'The made-up note the decisions rest on'
const MODEL = 'claude-opus-5-5'
const MODEL_NAME = 'Claude Opus 5.5'
const UNNAMED_MODEL = 'a-model-nobody-named-7'

let noteId = ''
let byThePerson = ''
let byTheAgent = ''
let problemId = ''
let namedRun = ''
let unnamedRun = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asTheAgent(run?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': AGENT,
    ...(run === undefined ? {} : { 'x-mole-office-session': run }),
  }
}

async function filed(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

async function read<T>(url: string): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as T
}

/** A window, so the browser modules load under `renderToStaticMarkup`. */
async function boot(): Promise<{ page: Page; i18n: I18n; mode: Mode }> {
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
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  return {
    page: (await import('../src/web/pages/RecordPage.tsx')) as Page,
    i18n: await import('../src/shared/i18n.ts'),
    mode: await import('../src/web/lib/mode.ts'),
  }
}

/** The record's page body as the page draws it, with what the server answered for it and nothing else. */
async function drawn(id: string, language: 'en' | 'zh', inspect = false): Promise<{ html: string; t: I18n['t'] }> {
  const { page, i18n, mode } = await boot()
  i18n.setWordLanguage(language)
  mode.setMode(inspect ? 'inspect' : 'normal')
  const record = (await read<{ record: PanelRecord }>(`/api/records/${id}`)).record
  const log = await read<Record<string, unknown>>(`/api/changes?recordId=${encodeURIComponent(id)}`)
  const participants = await read<Record<string, unknown>>('/api/participants')
  const titleById = new Map([
    [noteId, NOTE_TITLE],
    [record.id, record.title],
  ])
  const html = renderToStaticMarkup(
    h(page.RecordDetail, {
      record,
      editable: false,
      deleted: false,
      records: [record],
      detailLinks: [],
      relations: [],
      evolutionLinks: [],
      log,
      participants,
      titles: [],
      titleById,
      unfilledByRecord: new Map<string, number>(),
      body: page.bodySections(record),
      onChanged: () => {},
    } as never),
  )
  return { html, t: i18n.t }
}

/** The person's name as the registry holds it, which is what the page should say. */
async function thePersonsName(): Promise<string> {
  const said = await read<{ people: { id: string; name: string }[] }>('/api/participants')
  const found = said.people.find((one) => one.id === THE_PERSON)
  expect(found, 'the test office registers its person').toBeDefined()
  return found!.name
}

beforeAll(async () => {
  t = await freshDb()
  whoRecordedIt = (await import('../src/server/lib/records.ts')).whoRecordedIt
  app = (await apiApp()).app
  await app.ready()

  noteId = await filed(AS_THE_PERSON, {
    kind: 'note',
    title: NOTE_TITLE,
    summary: 'A made-up note for this test, which the made-up decisions below rest on.',
    data: {},
  })
  byThePerson = await filed(AS_THE_PERSON, {
    kind: 'decision',
    title: 'The made-up archive keeps its scans for a year',
    summary: 'A made-up decision for this test.',
    data: { replaces: [], authority: 'the owner said so', authority_reference: noteId },
  })
  byTheAgent = await filed(asTheAgent(), {
    kind: 'decision',
    title: 'The made-up archive is read on Mondays',
    summary: 'A made-up decision an agent wrote down for this test.',
    data: {
      replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: noteId,
      because: 'A made-up quote: read it on Mondays.',
    },
  })
  problemId = t.api.createRecord({
    kind: 'problem',
    title: 'A made-up problem two runs worked on',
    workspaceId: 'default',
    data: {},
    actor: { type: 'human', id: THE_PERSON },
  }).id
  namedRun = historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'agent', id: 'c-run-identity' },
    kind: 'session',
    title: 'A made-up run on a named model',
    data: { state: 'finished', model: MODEL },
  }).id
  unnamedRun = historicalSession(t, {
    workspaceId: 'default',
    actor: { type: 'agent', id: 'c-run-identity' },
    kind: 'session',
    title: 'A made-up run on a model the office has no name for',
    data: { state: 'finished', model: UNNAMED_MODEL },
  }).id
  for (const [run, said] of [
    [unnamedRun, 'The first made-up change.'],
    [namedRun, 'The second made-up change.'],
  ] as const) {
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${problemId}`,
      headers: asTheAgent(run),
      payload: { dataPatch: { why_it_hurts: said } },
    })
    expect(reply.statusCode, reply.body).toBe(200)
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

const LANGUAGES = ['en', 'zh'] as const

describe('who recorded a decision', () => {
  it('writerIn reads what whoRecordedIt writes', () => {
    expect(writerIn(whoRecordedIt({ type: 'human', id: THE_PERSON }))).toEqual({ actorType: 'human', actorId: THE_PERSON })
    expect(writerIn(whoRecordedIt({ type: 'agent', id: AGENT }))).toEqual({ actorType: 'agent', actorId: AGENT })
    expect(writerIn('nobody')).toBeNull()
    expect(writerIn(7)).toBeNull()
  })

  it.each(LANGUAGES)('%s: 1. the decision names the person who recorded it, not "human <id>"', async (language) => {
    const name = await thePersonsName()
    const { html, t: words } = await drawn(byThePerson, language)
    expect(html).toContain(words('record.section.recorded_by'))
    expect(html).toContain(name)
    expect(html, 'the stored string reaches the reader').not.toContain(`human ${THE_PERSON}`)
  })

  it.each(LANGUAGES)('%s: 1. an agent that recorded a decision is named as the change log names it', async (language) => {
    const { html } = await drawn(byTheAgent, language)
    expect(html, 'the stored string reaches the reader').not.toContain(`agent ${AGENT}`)
  })

  it('1. developer mode draws the stored string', async () => {
    const { html } = await drawn(byThePerson, 'en', true)
    expect(html).toContain(`human ${THE_PERSON}`)
  })
})

describe('what a decision rests on', () => {
  it.each(LANGUAGES)('%s: 2. the source of authority is the record\'s title, linked to it', async (language) => {
    for (const id of [byThePerson, byTheAgent]) {
      const { html, t: words } = await drawn(id, language)
      expect(html).toContain(words('record.section.authority_reference'))
      expect(html).toContain(NOTE_TITLE)
      expect(html).toMatch(new RegExp(`href="[^"]*${noteId}[^"]*"`))
      expect(html, 'the id is drawn as words').not.toMatch(new RegExp(`>\\s*${noteId}\\s*<`))
    }
  })
})

describe('the model of the run that wrote a change', () => {
  it.each(LANGUAGES)('%s: 3. the run row and the fold line name the model, not its id', async (language) => {
    const { html, t: words } = await drawn(problemId, language)
    expect(html).toContain(MODEL_NAME)
    expect(html).toContain(words('g2d.changeLog.modelUnnamed'))
    expect(html, 'the stored model id reaches the reader').not.toContain(MODEL)
    expect(html, 'the stored model id reaches the reader').not.toContain(UNNAMED_MODEL)
    // The fold's own line: the last change was the named run's.
    const fold = html.match(/<summary[^>]*>[\s\S]*?<\/summary>/g) ?? []
    expect(
      fold.some((line) => line.includes(MODEL_NAME) && line.includes(words('record.seeChanges'))),
      'the change fold\'s line names the model',
    ).toBe(true)
  })

  it('3. developer mode draws the stored model ids', async () => {
    const { html } = await drawn(problemId, 'en', true)
    expect(html).toContain(MODEL)
    expect(html).toContain(UNNAMED_MODEL)
  })
})
