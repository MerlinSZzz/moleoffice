// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHINESE LABEL IS HELD TO A LIMIT AS WIDE AS AN ENGLISH ONE, AND NOTHING ELSE MOVED.
 *
 * Problem zTsUr6VSSs0B (wave 13k, round 44): `countWords` counts each Chinese character as a word,
 * which is right for asking whether a shorter form is shorter than its record, and the label's
 * five-word ceiling used the same count. So a Chinese label could be five characters at most, and
 * 扫描第三周报告, seven characters and four words, was refused. A ceiling now counts two Chinese
 * characters as one word (`wordsAgainstACeiling` in src/shared/zoom.ts, which says where the two
 * comes from).
 *
 * The first three cases are the ceiling. The rest are the places that compare a shorter form with
 * its record, or say how long a form is; each still counts a Chinese character as a word.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { budgetProblem, countWords, wordsAgainstACeiling } from '../src/shared/zoom.ts'
import { detailOf, theRecordsOwnWords } from '../src/shared/detail.ts'

const SEVEN = '扫描第三周报告'
const ELEVEN = '扫描第三周报告的全部结果'

describe('the ceiling of a label', () => {
  it('accepts a seven-character Chinese label', () => {
    expect(wordsAgainstACeiling(SEVEN)).toBe(4)
    expect(budgetProblem('label', SEVEN)).toBeNull()
    expect(budgetProblem('label', '扫'.repeat(10)), 'ten characters is the most').toBeNull()
    // THE READER DRAWS WHAT THE DOOR ACCEPTS: a seven-character title answering the label's slot fits it.
    const answer = detailOf({ title: SEVEN, declaresShortForms: true }, 'label')
    expect(answer.kind === 'text' ? answer.fit : answer.kind).toBe('inBudget')
  })

  it('still refuses an over-long Chinese label, in words', () => {
    expect(ELEVEN).toHaveLength(12)
    expect(budgetProblem('label', ELEVEN)).toBe(
      'The label is 6 words and may be at most 5. At this end two Chinese or Japanese characters count as one ' +
        'word. A label is 2 to 5 words: ' +
        budgetProblem('label', 'one two three four five six')!.split('A label is 2 to 5 words: ')[1],
    )
    expect(budgetProblem('label', '扫'.repeat(11))).toContain('is 6 words and may be at most 5')
    const answer = detailOf({ title: ELEVEN, declaresShortForms: true }, 'label')
    expect(answer.kind === 'text' ? answer.fit : answer.kind).toBe('overBudget')
  })

  it('answers an English label exactly as before', () => {
    for (const label of ['Line rule for word lists', 'Round 25 check doors', 'Agent id starting -p refused']) {
      expect(wordsAgainstACeiling(label), label).toBe(countWords(label))
      expect(budgetProblem('label', label), label).toBeNull()
    }
    const six = budgetProblem('label', 'Chat settings and report pages English')
    expect(six).toMatch(/^The label is 6 words and may be at most 5\. A label is 2 to 5 words: /)
    expect(six).not.toContain('Chinese')
  })
})

describe('what still counts a Chinese character as a word', () => {
  it('countWords and a record’s own words', () => {
    expect(countWords(SEVEN)).toBe(7)
    expect(theRecordsOwnWords({ body: null, summary: null, title: SEVEN }).words).toBe(7)
  })

  let t: TestDb
  let app: FastifyInstance
  let revisions: typeof import('../src/server/lib/revisions.ts')
  beforeAll(async () => {
    t = await freshDb()
    revisions = await import('../src/server/lib/revisions.ts')
    app = (await apiApp()).app
    await app.ready()
  }, 60_000)
  afterAll(async () => {
    await app.close()
    t.close()
  })

  const report = (blocks: unknown[]): string =>
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: '周报',
      data: { blocks, for: THE_TEST_OFFICES_OWNER.name, date: '2026-10-06' },
      actor: t.api.HUMAN,
    }).id
  const write = (id: string, forms: unknown): Promise<LightMyRequestResponse> => {
    const entry = revisions.listRevisions(id).revisions[0]!
    return app.inject({
      method: 'POST',
      url: `/api/records/${id}/short-forms`,
      payload: { madeFrom: { seq: entry.seq, contentHash: entry.contentHash }, forms },
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
    })
  }

  it('refuses a label longer than a five-character record, and says a stored label is seven words', async () => {
    const short = report([{ id: 'b-1', type: 'text', text: '扫描周报告' }])
    const refused = await write(short, { label: SEVEN })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.body).toContain('is 7 words')

    const long = report([{ id: 'b-1', type: 'text', text: '这一周扫描了全部的报告，并且把结果写在下面的表格里面了' }])
    const stored = await write(long, { label: SEVEN })
    expect(stored.statusCode, stored.body).toBe(200)
    const read = await app.inject({ method: 'GET', url: `/api/records/${long}/short-forms` })
    const levels = (JSON.parse(read.body) as { levels: Array<Record<string, unknown>> }).levels
    expect(levels.find((one) => one['rung'] === 'label')?.['wordCount']).toBe(7)
  })

  it('refuses a part that is the opening of a Chinese paragraph of the report', async () => {
    // THE SECOND PARAGRAPH, because the report's own first words are refused before any count is read.
    const opening = '这一周我们把仓库里全部的报告'
    const id = report([
      { id: 'b-1', type: 'text', text: '第三周的扫描结果比第二周好，剩下的问题主要是图片太大，打开的时候比较慢' },
      { id: 'b-2', type: 'text', text: `${opening}都扫描了一遍，一共是四十二份报告，其中有六份是新写的，下一周会先处理图片的大小` },
    ])
    const parts = [
      { id: 'p-1', heading: '扫描', text30: opening, text120: '仓库全部扫描过了，图片下周处理', covers: ['b-1', 'b-2'] },
    ]
    const refused = await write(id, { parts })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.body).toContain('is the opening of the text of the block')
  })
})
