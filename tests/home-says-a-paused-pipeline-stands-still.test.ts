// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, decision OQR0WDVq0FkP): Home is told by one door which
// pipelines stand still, each with its unfinished steps counted.
// Each case asks GET /api/pipelines/standing-still. It answers the project's pipelines whose every unfinished step is
// paused, at most as many as Late or stuck draws, and how many there are in all. The values Home's own reading told
// apart are written here past the write gate, and each case says what that reading made of them.
// Before, the cases called pipelineLine in src/web/components/home/pipeline-line.ts for the sentence, and the last one
// asked the records list for every pipeline and every step in Home's shape and read them as Home did.
/**
 * HOME IS TOLD WHICH PIPELINES STAND STILL: THOSE WHOSE EVERY UNFINISHED STEP IS PAUSED.
 *
 * A decision settled problem RK4zJb6hJyV6. A pipeline stands still when it has an unfinished step and every unfinished
 * step is paused. Late or stuck draws each one with the sentence `homeWords.pipelineStill`, counted by its unfinished
 * steps, and tests/home-late-or-stuck-shows-a-pipeline-standing-still.test.ts holds that sentence as drawn, in two
 * languages. This file holds what the door answers: which pipelines, how many unfinished steps each, in which order,
 * and how many in all. The other paths stay out: a pipeline with an unfinished step that is not paused, even when
 * another is, and a pipeline whose every step is done. Made-up pipelines and steps only.
 *
 * THE VALUES A STEP OR A PIPELINE CAN HOLD. Home's reading before this door trimmed each step's id, its state and the
 * two texts of its pause. It read a state only by its own name, and a pause only with both texts. It skipped an entry
 * that named no live step of the project (`readPipelineBlocks` in src/shared/blocks.ts, `readPause` in
 * src/shared/work.ts). The door reads the same rules in the database, so the cases below write each value straight into
 * the records table and hold that the door reads it as Home's reading did.
 *
 * WHAT THIS FILE DOES NOT CATCH. A label written twice in one object. The office writes data with JSON.stringify, so
 * its records hold none, and this file writes none.
 */
import { describe, expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ItemState } from '../src/shared/types.ts'
import type { Pause } from '../src/shared/work.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

/** The door's answer, as Late or stuck reads it. */
interface StandingStill { rows: { id: string; title: string; workspaceId: string; unfinished: number }[]; total: number }

const pause: Pause = { since: '2026-08-12 10:00:00', why: 'The test orchard is closed for the winter.' }
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** A step as a case writes it: its state, and whether it is paused. */
type AStep = readonly [ItemState, 'paused'?]

interface AnOffice {
  t: TestDb
  /** A pipeline of these steps, in order, made through the office's doors, with its id and its steps' ids. */
  pipeline(title: string, steps: readonly AStep[]): Promise<{ id: string; steps: string[] }>
  /** The door's answer, asked as the person in the default project. */
  standingStill(): Promise<StandingStill>
}

/** A fresh office and its app for one case, closed after it. */
async function inAnOffice(test: (office: AnOffice) => Promise<void>): Promise<void> {
  const t = await freshDb()
  const { app } = await apiApp()
  const send = async (method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown>) => {
    const reply = await app.inject({ method, url, headers, payload })
    expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBeLessThan(300)
    return reply.json()
  }
  try {
    await app.ready()
    await test({
      t,
      async pipeline(title, steps) {
        const id = (await send('POST', '/api/records', { kind: 'pipeline', title, data: { blockIds: [] } })).record.id as string
        const ids: string[] = []
        for (const [i, [state, paused]] of steps.entries()) {
          const step = (await send('POST', `/api/records/${id}/blocks`, { name: `Step ${String(i + 1)}`, state })).record.id as string
          if (paused !== undefined) await send('PATCH', `/api/records/${step}`, { dataPatch: { paused: pause } })
          ids.push(step)
        }
        return { id, steps: ids }
      },
      async standingStill() {
        const reply = await app.inject({ method: 'GET', url: '/api/pipelines/standing-still', headers })
        expect(reply.statusCode, reply.body).toBe(200)
        return reply.json() as StandingStill
      },
    })
  } finally {
    await app.close()
    t.close()
  }
}

/** Each row's title and unfinished steps, sorted, for a case that does not hold the order. */
function byTitle(answer: StandingStill): string[] {
  return answer.rows.map((one) => `${one.title}: ${String(one.unfinished)}`).sort()
}

describe('the pipelines Home is told stand still', () => {
  it('answers a pipeline whose every unfinished step is paused, with its unfinished steps counted', async () => {
    await inAnOffice(async (office) => {
      const picking = await office.pipeline('Test pear picking', [['done'], ['doing', 'paused'], ['todo', 'paused']])
      await office.pipeline('Test pear sorting', [['done'], ['failed', 'paused']])
      await office.pipeline('Test pear storing', [['blocked', 'paused']])
      const answer = await office.standingStill()
      expect(byTitle(answer), 'each pipeline standing still, with its unfinished steps').toEqual(['Test pear picking: 2', 'Test pear sorting: 1', 'Test pear storing: 1'])
      expect(answer.total, 'the pipelines standing still in all').toBe(3)
      expect(answer.rows.find((one) => one.id === picking.id)?.workspaceId, 'the project of the pipeline').toBe('default')
    })
  })

  it('leaves out a pipeline with an unfinished step that is not paused, even when another unfinished step is paused', async () => {
    await inAnOffice(async (office) => {
      await office.pipeline('Test pear weighing', [['done'], ['todo'], ['failed', 'paused']])
      await office.pipeline('Test pear packing', [['doing'], ['todo']])
      const answer = await office.standingStill()
      expect(answer.rows, 'the pipelines standing still').toEqual([])
      expect(answer.total, 'the pipelines standing still in all').toBe(0)
    })
  })

  it('leaves out a pipeline whose every step is done, whether or not a done step carries a pause, and one with no step', async () => {
    await inAnOffice(async (office) => {
      await office.pipeline('Test pear eating', [['done', 'paused'], ['done']])
      await office.pipeline('Test pear planning', [])
      const answer = await office.standingStill()
      expect(answer.rows, 'the pipelines standing still').toEqual([])
      expect(answer.total, 'the pipelines standing still in all').toBe(0)
    })
  })

  it('answers at most as many as Late or stuck draws, newest first and then by id, and counts every one', async () => {
    const { HOME_ALARMS_SHOWN } = await import('../src/shared/attention-first-page.ts')
    await inAnOffice(async (office) => {
      const made: string[] = []
      for (let i = 0; i <= HOME_ALARMS_SHOWN; i++) made.push((await office.pipeline(`Test orchard row ${String(i + 1)}`, [['doing', 'paused']])).id)
      // THE FIRST IS OLDER THAN THE REST, and the rest share one time, so their order is by id alone.
      const at = office.t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?')
      made.forEach((id, i) => at.run(i === 0 ? '2026-08-01 09:00:00' : '2026-08-02 09:00:00', id))
      const answer = await office.standingStill()
      expect(answer.rows.map((one) => one.id), 'the pipelines answered, in order').toEqual(made.slice(1).sort())
      expect(answer.total, 'the pipelines standing still in all').toBe(HOME_ALARMS_SHOWN + 1)
    })
  })

  it("reads a step's state trimmed and by its own name alone", async () => {
    await inAnOffice(async (office) => {
      const { t } = office
      // A PAUSED STATE WITH SPACES AROUND IT was read trimmed, so this pipeline stands still.
      const spaced = await office.pipeline('Test state with spaces', [['doing', 'paused']])
      writeDataBypassingTheGate(t, spaced.steps[0]!, { state: ' doing\t', paused: pause })
      // AN OPEN STATE WITH SPACES AROUND IT was read trimmed, so this pipeline moves.
      const open = await office.pipeline('Test open state with spaces', [['doing', 'paused'], ['todo']])
      writeDataBypassingTheGate(t, open.steps[1]!, { state: ' todo\n' })
      // A STATE IN CAPITALS, A NUMBER, NO STATE, OR DATA THAT IS A LIST names no state, so each such step was skipped,
      // and the paused step stands alone.
      const unread = await office.pipeline('Test states that name none', [['doing', 'paused'], ['todo'], ['todo'], ['todo'], ['todo']])
      writeDataBypassingTheGate(t, unread.steps[1]!, { state: 'TODO' })
      writeDataBypassingTheGate(t, unread.steps[2]!, { state: 3 })
      writeDataBypassingTheGate(t, unread.steps[3]!, { name: 'Step 4' })
      writeDataBypassingTheGate(t, unread.steps[4]!, ['todo'])
      const answer = await office.standingStill()
      expect(byTitle(answer), 'each pipeline standing still, with its unfinished steps').toEqual(['Test state with spaces: 1', 'Test states that name none: 1'])
      expect(answer.total, 'the pipelines standing still in all').toBe(2)
    })
  })

  it('reads a pause only when its since and its why both hold text once trimmed', async () => {
    await inAnOffice(async (office) => {
      const paused = async (title: string, value: unknown) => {
        const one = await office.pipeline(title, [['doing']])
        writeDataBypassingTheGate(office.t, one.steps[0]!, { state: 'doing', paused: value })
      }
      await paused('Test pause with spaces around', { since: ` ${pause.since} `, why: `\t${pause.why}\n` })
      await paused('Test pause of spaces', { since: ' \t  ', why: pause.why })
      await paused('Test pause of a wide space', { since: pause.since, why: '　' })
      await paused('Test pause with no why', { since: pause.since })
      await paused('Test pause with a number', { since: 20260812, why: pause.why })
      await paused('Test pause as a list', [pause.since, pause.why])
      await paused('Test pause as a sentence', pause.why)
      const answer = await office.standingStill()
      expect(byTitle(answer), 'each pipeline standing still, with its unfinished steps').toEqual(['Test pause with spaces around: 1'])
      expect(answer.total, 'the pipelines standing still in all').toBe(1)
    })
  })

  it("reads a pipeline's steps by their ids trimmed, once each, and only the live steps of its project", async () => {
    await inAnOffice(async (office) => {
      const { t } = office
      // THE STEPS THE PIPELINES BELOW NAME, made in a pipeline of their own, which moves: a paused step, an open one.
      const [still, open] = (await office.pipeline('Test source of steps', [['doing', 'paused'], ['todo']])).steps as [string, string]
      const naming = async (title: string, data: unknown): Promise<string> => {
        const one = await office.pipeline(title, [])
        writeDataBypassingTheGate(t, one.id, data)
        return one.id
      }
      await naming('Test ids with spaces', { blockIds: [` ${still}\t`] })
      await naming('Test an id twice', { blockIds: [still, still, ` ${still}`] })
      await naming('Test entries that name nothing', { blockIds: [3, '', ' \n', null, { id: open }, still] })
      await naming('Test ids in an object', { blockIds: { first: still } })
      await naming('Test data as a list', [still])
      // AN OPEN STEP THAT IS DELETED, ONE IN ANOTHER PROJECT, AND A RECORD OF ANOTHER KIND THAT HOLDS AN OPEN STATE:
      // none was read, so a pipeline that names them beside the paused step stands still.
      const deleted = (await office.pipeline('Test source of a deleted step', [['todo']])).steps[0]!
      t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-08-13 09:00:00' WHERE id = ?").run(deleted)
      const elsewhere = (await office.pipeline('Test source of a step elsewhere', [['todo']])).steps[0]!
      t.client.sqlite.prepare("UPDATE records SET workspace_id = 'another-test-project' WHERE id = ?").run(elsewhere)
      const otherKind = await naming('Test a pipeline that holds a state', { blockIds: [], state: 'todo' })
      await naming('Test steps that are not read', { blockIds: [still, deleted, elsewhere, otherKind] })
      const answer = await office.standingStill()
      expect(byTitle(answer), 'each pipeline standing still, with its unfinished steps').toEqual([
        'Test an id twice: 1', 'Test entries that name nothing: 1', 'Test ids with spaces: 1', 'Test steps that are not read: 1',
      ])
      expect(answer.total, 'the pipelines standing still in all').toBe(4)
    })
  })

  it('leaves out a pipeline that is deleted, and one in another project', async () => {
    await inAnOffice(async (office) => {
      const deleted = await office.pipeline('Test deleted pipeline', [['doing', 'paused']])
      const elsewhere = await office.pipeline('Test pipeline elsewhere', [['doing', 'paused']])
      await office.pipeline('Test pipeline here', [['doing', 'paused']])
      office.t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-08-13 09:00:00' WHERE id = ?").run(deleted.id)
      office.t.client.sqlite.prepare("UPDATE records SET workspace_id = 'another-test-project' WHERE id = ?").run(elsewhere.id)
      const answer = await office.standingStill()
      expect(byTitle(answer), 'each pipeline standing still, with its unfinished steps').toEqual(['Test pipeline here: 1'])
      expect(answer.total, 'the pipelines standing still in all').toBe(1)
    })
  })
})
