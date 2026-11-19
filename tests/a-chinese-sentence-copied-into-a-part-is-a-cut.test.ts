// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHINESE SENTENCE COPIED INTO A PART IS A CUT, AS AN ENGLISH ONE IS. Wave 13k, round 45, piece 3.
 *
 * The copy rule's third arm (src/server/lib/summary.ts) refuses a part text that is a whole sentence of the report, from
 * anywhere in it. It never caught a Chinese one, for two reasons:
 *
 *   - `sentencesOfProse` (src/shared/zoom.ts) ended a sentence only at a full stop, a question mark or an exclamation
 *     mark followed by a space. Chinese ends a sentence at 。！？ with no space after it, so a Chinese paragraph was
 *     one sentence;
 *   - the arm asked for as many shared words as `countWords` counts, and `countWords` counts each Chinese character,
 *     while `wordsOf`, which the comparison reads, splits on spaces only, so a Chinese sentence is one word to it.
 *
 * WHAT THIS FILE PROVES, through the short-forms door:
 *   1. a part whose text is the middle sentence of a Chinese paragraph, word for word, is refused, and nothing is stored;
 *   2. a part that says the same thing in its own words is stored;
 *   3. a part that opens as that sentence opens and then says its own thing is stored;
 *   4. `sentencesOfProse` ends a sentence at 。, ！ and ？.
 *
 * MUTATIONS, after a control run (the commit that added this file names the logs):
 *   - `sentencesOfProse` without 。！？: cases 1 and 4 go red;
 *   - the arm's old comparison put back (the count of the words the two texts open with, against `countWords`): case 1 goes red.
 *
 * Everything here is made up: the report, its words and the agent writing to it.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { sentencesOfProse, type StoredPart } from '../src/shared/zoom.ts'

type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

/** The middle sentence of the paragraph below, without its 。. */
const THE_MIDDLE_SENTENCE = '它说这个名字出现了大约七千次，这在七月是真的，现在已经不是了'

const BODY = [
  {
    id: 'b-audit',
    type: 'text',
    text: `审计报告是八月二十七日写的，说明文件里有它的链接。${THE_MIDDLE_SENTENCE}。从那以后没有人再改过这份文件。`,
  },
]

const GOOD: StoredPart = {
  id: 'p-audit',
  heading: '审计报告里的数字已经过时',
  text30: '审计报告的标题数字来自七月，后来没有人更新过。',
  text120: '八月写的审计报告从说明文件里就能打开，新来的人很早就会读到它。可是它最上面的数字还是七月的，两个月来没有人回去改过，所以相信第一行的人拿到的是旧数字。',
  covers: ['b-audit'],
}

const AS_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/fixture-writer',
  'x-mole-office-session': 'sess-chinese-copy',
}

let t: TestDb
let app: FastifyInstance
let revisions: RevisionsLib
let h: { t: TestDb; app: FastifyInstance; revisions: RevisionsLib; report: string }

beforeAll(async () => {
  t = await freshDb()
  revisions = await import('../src/server/lib/revisions.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

beforeEach(() => {
  const report = t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: '审计报告里的名字',
    data: { blocks: BODY, for: THE_TEST_OFFICES_OWNER.name, date: '2026-10-07' },
    actor: t.api.HUMAN,
  }).id
  h = { t, app, revisions, report }
})

afterAll(async () => {
  await app.close()
  t.close()
})

function writeParts(parts: StoredPart[]): Promise<LightMyRequestResponse> {
  const entry = h.revisions.listRevisions(h.report).revisions[0]
  if (entry === undefined) throw new Error('the report has no revisions')
  return h.app.inject({
    method: 'POST',
    url: `/api/records/${h.report}/short-forms`,
    payload: { madeFrom: { seq: entry.seq, contentHash: entry.contentHash }, forms: { parts } },
    headers: AS_AGENT,
  })
}

const storedForms = (): unknown => ((h.t.api.getRecord(h.report)?.data ?? {}) as Record<string, unknown>)['shortForms']

it('1: a part whose text is the middle sentence of a Chinese paragraph, word for word, is refused', async () => {
  const refused = await writeParts([{ ...GOOD, text30: `${THE_MIDDLE_SENTENCE}。` }])
  expect(refused.statusCode, refused.body).toBe(400)
  const said = (refused.json() as { error?: string }).error ?? refused.body
  expect(said).toContain('word for word')
  expect(said).toContain(THE_MIDDLE_SENTENCE)
  expect(storedForms(), 'nothing was stored').toBeUndefined()
})

it('2: a part that says the same thing in its own words is stored', async () => {
  const wrote = await writeParts([GOOD])
  expect(wrote.statusCode, wrote.body).toBe(200)
})

it('3: a part that opens as the sentence opens and then says its own thing is stored', async () => {
  const wrote = await writeParts([{ ...GOOD, text30: '它说这个名字出现了大约七千次，可是没有人去数过。' }])
  expect(wrote.statusCode, wrote.body).toBe(200)
})

it('4: a sentence ends at 。, ！ and ？, with no space after it', () => {
  expect(sentencesOfProse('第一句。第二句！第三句？第四句')).toEqual(['第一句。', '第二句！', '第三句？', '第四句'])
  expect(sentencesOfProse('One. Two? Three'), 'English is read as before').toEqual(['One.', 'Two?', 'Three'])
})
