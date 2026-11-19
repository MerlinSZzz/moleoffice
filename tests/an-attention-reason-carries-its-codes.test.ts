// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ATTENTION ROW'S REASON CARRIES CODES A PAGE CAN SAY IN ITS OWN LANGUAGE, AND ITS ENGLISH STAYS.
 *
 * A page's sentences are translated, and replies nobody sees on a page stay
 * English. The server's `reason.because` is for agents, so it stays English even
 * while the process's page language is Chinese. Beside it, `reason.coded` holds each clause a page
 * draws, as a code and its values (src/shared/attention-reasons.ts), and the page draws each code
 * from the word lists. This checks the three codes on a real reply, in the whole shape and in the
 * home shape, and the words the home page draws for each in English, Chinese and the test language.
 * Made-up records only.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ATTENTION_REASON_CODES } from '../src/shared/attention-reasons.ts'
import type { AttentionRow } from '../src/shared/attention.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'

let db: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})
afterAll(async () => {
  const { setWordLanguage } = await import('../src/shared/i18n.ts')
  setWordLanguage('en')
  await app?.close()
  db?.close()
})

async function made(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json().record.id as string
}

async function rows(shape: string): Promise<AttentionRow[]> {
  const full = shape.includes('shape=') ? '' : '&shape=full'
  const reply = await app.inject({ method: 'GET', url: `/api/attention?machine=omit${shape}${full}`, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { visible: AttentionRow[]; remainder: AttentionRow[] | { rows: AttentionRow[]; next: string | null }; remainderNext?: string | null }
  const all = [...body.visible, ...(Array.isArray(body.remainder) ? body.remainder : body.remainder.rows)]
  let next = Array.isArray(body.remainder) ? body.remainderNext ?? null : body.remainder.next
  while (next !== null) {
    const page = await app.inject({ method: 'GET', url: next, headers })
    expect(page.statusCode, page.body).toBe(200)
    const continued = page.json() as { rows: AttentionRow[]; next: string | null }
    all.push(...continued.rows)
    next = continued.next
  }
  return all
}

it('sends each coded clause beside the English sentence, and the page says it in the page language', async () => {
  const stopped = await made('problem', 'Test lantern flickers', { state: 'open', symptom: 'A made-up flicker.' })
  // THE DOOR REFUSES A RECORD THAT SAYS BOTH, so this one is written the way an older record came to
  // hold it: straight into the stored data, after the door.
  const disagrees = await made('problem', 'Test kite string frays', { state: 'open', symptom: 'A made-up fray.' })
  db.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.done', json('true')) WHERE id = ?").run(disagrees)
  const paused = await made('task', 'Test orchard map', {
    state: 'todo',
    paused: { since: '2026-01-05 09:00:00', why: 'The made-up orchard is closed.', until: { date: '2026-02-01' } },
  })
  const { setWordLanguage } = await import('../src/shared/i18n.ts')
  // THE PAGE LANGUAGE OF THIS PROCESS IS CHINESE WHILE THE SERVER ANSWERS. Its sentence stays English.
  setWordLanguage('zh')
  for (const shape of ['', '&shape=home']) {
    const all = await rows(shape)
    const row = (id: string) => {
      const found = all.find((one) => one.recordId === id)
      expect(found, `${id} is on the list in the shape "${shape}"`).toBeDefined()
      return found!
    }
    expect(row(stopped).reason.coded).toEqual([{ code: 'stoppedShort', values: { state: 'open' } }])
    expect(row(stopped).reason.because).toContain('its state word is "open", which means the work stopped short of finishing')
    expect(row(disagrees).reason.coded).toEqual([
      { code: 'stoppedShort', values: { state: 'open' } },
      { code: 'doneDisagrees', values: {} },
    ])
    expect(row(disagrees).reason.because).toContain('says it was discharged, and its state word says otherwise')
    expect(row(paused).reason.coded).toEqual([{ code: 'pauseElapsed', values: { since: '2026-01-05 09:00:00', until: '2026-02-01' } }])
    expect(row(paused).reason.because).toContain('it was put down on 2026-01-05 09:00:00 until 2026-02-01, and that date has passed')
  }
  // EVERY DECLARED CODE WAS SEEN ON A REAL REPLY, so a code nothing sends cannot sit in the table.
  const seen = new Set((await rows('')).flatMap((one) => one.reason.coded.map((reason) => reason.code)))
  expect([...seen].sort()).toEqual(Object.keys(ATTENTION_REASON_CODES).sort())

  // THE PAGE'S OWN MODULES CHOOSE A LANGUAGE WHEN THEY LOAD, so the page language is set after them.
  const { codedReasonWords } = await import('../src/web/components/AttentionPanel.tsx')
  setWordLanguage('zh')
  const pausedReason = { code: 'pauseElapsed', values: { since: '2026-01-05 09:00:00', until: '2026-02-01' } } as const
  const fill = (word: string) => word.replace('{since}', '2026-01-05 09:00:00').replace('{until}', '2026-02-01')
  expect(codedReasonWords(pausedReason, 'task')).toBe(fill(zh['homeWords.reason.pauseElapsed']))
  expect(codedReasonWords({ code: 'doneDisagrees', values: {} }, 'problem')).toBe(zh['homeWords.reason.doneDisagrees'])
  expect(codedReasonWords({ code: 'stoppedShort', values: { state: 'open' } }, 'problem')).toMatch(/^它的状态是“.+”，表示工作在完成之前停下了。$/)
  setWordLanguage('en')
  expect(codedReasonWords(pausedReason, 'task')).toBe(fill(en['homeWords.reason.pauseElapsed']))
  expect(codedReasonWords({ code: 'stoppedShort', values: { state: 'open' } }, 'problem')).toMatch(/^Its state “.+” means the work stopped short of finishing\.$/)
  setWordLanguage('xx')
  expect(codedReasonWords({ code: 'doneDisagrees', values: {} }, 'problem')).toMatch(/^⟦The record says it was finished.*⟧$/)
})
