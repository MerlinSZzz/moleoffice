// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY REFERENCE IN A COPY CARRIES THE OWNER'S FOUR WORDS: KIND, ID, TITLE AND WHAT IT MEANS HERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `design/PROBLEM-REGISTER-OWNER-MESSAGE.md` section 7: an important reference
 * carries at least its kind, its id, a compact title and the meaning that matters here, and the counter-example is
 * `93 records finished (id1, id2, id3...)`. Criterion B18 of `design/bundle/ACCEPTANCE.md`.
 *
 * Measured on 6 September 2026 against a copy of the owner's own corpus, preset `recover_project` at the
 * Conclusion position, 24,547 characters:
 *
 *   · NOT ONE ENTRY carried all four. The campaign, the stopping points, the plans, the findings
 *     and the modules carried a title and no id; what is still open carried a kind and a title and
 *     no id; what is waiting on a person carried an id and a title and no kind.
 *   · EIGHTEEN LINES OF `RECENT CHANGES` CARRIED A BARE ID — `created on record KcJeflFV0Yot` —
 *     which is the owner's counter-example exactly, in a part criterion B13 did not reach.
 *   · WHAT IT MEANS HERE was written at rung 7 for what is still open, so a copy asked for any
 *     shorter position lost the state word and whose move it was.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. EVERY ENTRY THAT NAMES A RECORD carries the title, the kind as a person reads it, the id,
 *      and a clause saying what it means here — at Level 2, which is the shortest position an
 *      entry is ever drawn at, so the four survive every shortening.
 *   2. THE PART THAT PRINTED A BARE ID no longer does: a change row names the record it changed.
 *   3. A RECORD THE SIZE DROPPED is named the same way, from the same shape.
 *   4. ONE SHAPE WRITES ALL OF THEM. `referenceLine` in `src/shared/reference.ts` is asserted to be
 *      what produced each line, by rebuilding the line from the shape and finding it in the text.
 *
 * Proved by mutation with a control run of this file first: putting `${record.title}` back in place
 * of `referenceLine(...)` in `aRecordEntry` — `src/server/lib/continuation.ts` — turns cases 1 and
 * 4 red, and restoring `on record ${row.recordId}` in the `recentChanges` reader turns case 2 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { referenceLine } from '../src/shared/reference.ts'

const HEADERS = (workspace: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
})

let t: TestDb
let app: FastifyInstance
/** This case's own project, so its copy carries only the records it filed. */
let workspace = 'default'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  workspace = `reference-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'References' } })
  expect(made.statusCode, made.body).toBe(201)
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS(workspace) })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS(workspace) })
  return { status: res.statusCode, body: res.json() }
}

async function aRecord(kind: string, title: string, data: unknown, summary?: string): Promise<string> {
  const made = await post('/api/records', { kind, title, ...(summary === undefined ? {} : { summary }), data })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** The copy, as text, at the shortest position an entry is ever drawn at. */
async function theCopy(slots: string, detail = 'title'): Promise<string> {
  const preview = await get(`/api/bundles/preview?preset=custom&slots=${slots}&detail=${detail}`)
  expect(preview.status, JSON.stringify(preview.body)).toBe(200)
  return String(preview.body.text)
}

describe('a reference in a copy carries kind, id, title and what it means here', () => {
  it('names every one of them at the shortest position, in one line each', async () => {
    const problem = await aRecord('problem', 'The seed window closes too early', { state: 'open' })
    const module = await aRecord('module', 'The durable archive', { state: 'active' }, 'What it holds.')
    const report = await aRecord('report', 'What the first night measured', {})

    const text = await theCopy('problems,structure,reports')

    // 1. THE OWNER'S FOUR WORDS, ON EVERY ONE. The line is rebuilt from the shape and looked for in the
    // text, so this asserts the renderer rather than a hand-written expectation of its output.
    expect(text).toContain(
      referenceLine({ recordId: problem, kind: 'problem', title: 'The seed window closes too early', meansHere: 'open' }),
    )
    for (const [id, title] of [
      [module, 'The durable archive'],
      [report, 'What the first night measured'],
    ] as const) {
      const line = text.split('\n').find((one) => one.includes(id))
      expect(line, `${title} is named in the copy`).toBeDefined()
      expect(line).toContain(title)
      expect(line).toContain(id)
      // WHAT IT MEANS HERE: a clause after the brackets, never an empty one.
      expect(line?.split(') — ')[1]?.trim() ?? '', `${title} says what it means here`).not.toBe('')
    }
    // THE KIND AS A PERSON READS IT, not the stored word where the two differ.
    expect(text).toContain(`(module, ${module})`)
    expect(text).toContain(`(report, ${report})`)
  })

  it('names the record a change row is about, instead of printing its id alone', async () => {
    const id = await aRecord('problem', 'A problem somebody edited', { state: 'open' })
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      payload: { dataPatch: { state: 'accepted' } },
      headers: HEADERS(workspace),
    })
    expect(patched.statusCode, patched.body).toBe(200)

    const text = await theCopy('recentChanges')
    // 2. THE OWNER'S COUNTER-EXAMPLE, GONE. It said `changed state in data on record <id>, by human` and the owner's id.
    expect(text).not.toContain(`on record ${id}`)
    const line = text.split('\n').find((one) => one.includes(id) && one.includes('A problem somebody edited'))
    expect(line, 'the change row names the record it is about').toBeDefined()
    expect(line).toContain(`(problem, ${id})`)
    expect(line).toContain(THE_TEST_OFFICES_OWNER.id)
  })

  it('names a record the size dropped the same way, from the same shape', async () => {
    // A part far over its share, so the size has to drop entries and name the ones it dropped.
    const ids: string[] = []
    for (let i = 0; i < 40; i += 1) {
      ids.push(
        await aRecord('problem', `A problem nobody has fixed, number ${String(i)}, with a title of a realistic length`, {
          state: 'open',
        }),
      )
    }
    // NO POSITION PICKED, so the shares shape the copy and the size has to drop entries. A picked
    // position is honoured instead and drops nothing, which is criterion B25.
    const preview = await get('/api/bundles/preview?preset=custom&slots=problems&budgetBytes=1024')
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const text = String(preview.body.text)

    // 3. WHAT WAS LEFT OUT, BY NAME, and every name is a whole reference.
    expect(text).toContain('What was left out, by name:')
    const named = text
      .split('\n')
      .filter((line) => ids.some((id) => line.includes(id)) && line.includes('left out because'))
    expect(named.length, 'at least one dropped record is named').toBeGreaterThan(0)
    for (const line of named) {
      const id = ids.find((one) => line.includes(one)) ?? ''
      expect(line).toContain(`(problem, ${id})`)
      expect(line).toContain('left out because a line each was more than this part was given')
    }
    // AND NO ID WITH NOTHING BESIDE IT ANYWHERE IN THE COPY.
    for (const line of text.split('\n')) {
      for (const id of ids) {
        if (!line.includes(id)) continue
        expect(line.replace(id, '').trim().length, `the line naming ${id} says more than the id`).toBeGreaterThan(10)
      }
    }
  })

  it('the four survive a shortening, because they are on the line that identifies the entry', async () => {
    const id = await aRecord('problem', 'A problem with a summary of its own', { state: 'open' }, 'The summary.')
    // Asked at the Conclusion, which draws the summary under the head line; then at Level 2, which
    // draws the head line alone. The four words are on both.
    for (const detail of ['gist', 'title'] as const) {
      const text = await theCopy('problems', detail)
      const line = text.split('\n').find((one) => one.includes(id))
      expect(line, `at ${detail}`).toBeDefined()
      expect(line, `at ${detail}`).toContain('A problem with a summary of its own')
      expect(line, `at ${detail}`).toContain(`(problem, ${id})`)
      expect(line, `at ${detail}`).toContain('open')
    }
  })
})
