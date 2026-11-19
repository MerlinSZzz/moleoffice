// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DETAIL OF A RUN SAYS WHERE THAT RUN STANDS FROM ITS OWN LINKS AND WRITES.
 *
 * Round 109 of wave 13y, item 42. GET /api/sessions/:id shows one run, and found it with the sweep of every run of the
 * project with where every run stands worked out: every link of the project and every record at either end of one. It
 * showed the placement of one run only. On a made-up office of the live office's sizes (32,434 records, 40,634 links and
 * 542,827 changes in one project), with a made-up home folder of the live server's transcript sizes, the detail took
 * 572 to 587 ms by record id and by `<tool>:<id>`, at load 2.5 to 4.0.
 *
 * WHAT IS HELD HERE, for a run asked for by its record id and for a run asked for by its tool and conversation:
 *   - the answer says where the run stands as the placement rule says from the reading of the whole project
 *     (`placementOf` over `readSessionEvidence`);
 *   - the door reads no record that only the pipeline is linked to.
 *
 * Every run, transcript and record here is made up.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
/** The title of a task that only the pipeline is linked to. Only a read of every link's far end gives it back. */
const ONLY_THE_PIPELINE_LINKS_IT = 'A made-up task that only the pipeline is linked to'
const HUMAN = { type: 'human' as const, id: THE_PERSON }
const headers = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
let S: typeof import('../src/server/lib/sessions.ts')
const home = mkdtempSync(join(tmpdir(), 'mole-office-detail-'))
const projectDir = join(home, '.claude', 'projects', '-made-up-project')
const EXTERNAL_ID = 'eeeeeeee-0000-4000-8000-000000000002'

const env = (): AdapterEnv => ({
  homeDir: home,
  now: new Date(),
  scanProcesses: () => ({ ok: true, processes: [] }),
  runningWithinSeconds: 5 * 60,
  orphanAfterSeconds: 6 * 60 * 60,
})

/** The run asked for by its record id, and the run filed from a transcript, asked for by its tool and conversation. */
let byRecord = ''
let fromTheTranscript = ''

const aRecord = (kind: 'task' | 'pipeline', title: string) => t.api.createRecord({ workspaceId: HERE, kind, title, actor: HUMAN }).id
const aLink = (fromId: string, toId: string, type: 'part_of' | 'relates_to') => t.api.createLink({ fromId, toId, type, actor: HUMAN })

/** The statements `run` prepared and ran that gave back the title only the pipeline's link leads to. */
async function whatGaveBackThePipelinesTask(run: () => unknown): Promise<string[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  const read: string[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get'] as const) {
      const call = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const gave = call.apply(this, args)
        if ((JSON.stringify(gave, (_, value: unknown) => (typeof value === 'bigint' ? String(value) : value)) ?? '').includes(ONLY_THE_PIPELINE_LINKS_IT)) read.push(text)
        return gave
      }
    }
    return statement
  }
  try {
    await run()
  } finally {
    sqlite.prepare = prepare
  }
  return read
}

beforeAll(async () => {
  t = await freshDb()
  S = await import('../src/server/lib/sessions.ts')
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(sessionRoutes, { prefix: '/api', env })
  await app.ready()

  mkdirSync(projectDir, { recursive: true })
  writeFileSync(
    join(projectDir, `${EXTERNAL_ID}.jsonl`),
    `${JSON.stringify({ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: 'made-up' }, timestamp: new Date(Date.now() - 60 * 60_000).toISOString(), userType: 'external', entrypoint: 'cli', cwd: '/made-up-project', version: '2.1.223' })}\n`,
  )

  const pipeline = aRecord('pipeline', 'A made-up pipeline')
  const block = t.blocks.addBlock(pipeline, { name: 'A made-up block', state: 'doing' }, HUMAN).block.id
  aLink(aRecord('task', ONLY_THE_PIPELINE_LINKS_IT), pipeline, 'part_of')

  byRecord = t.api.createRecord({ workspaceId: HERE, kind: 'session', title: 'A made-up run asked for by its record id', data: { state: 'running', runtime: 'claude-code', doing: 'made-up' }, actor: HUMAN }).id
  aLink(byRecord, block, 'part_of')
  const filed = t.api.createRecord({
    workspaceId: HERE,
    kind: 'session',
    title: 'A made-up run filed from a transcript',
    data: { state: 'running', runtime: 'claude-code', doing: 'made-up', extra: { discovered: { tool: 'claude-code', externalId: EXTERNAL_ID, logPath: join(projectDir, `${EXTERNAL_ID}.jsonl`), observedState: 'running', at: '2026-10-29 11:00:00' } } },
    actor: HUMAN,
  }).id
  aLink(filed, block, 'relates_to')
  fromTheTranscript = `claude-code:${EXTERNAL_ID}`
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(home, { recursive: true, force: true })
})

describe('the detail of a run places only that run', () => {
  for (const [asked, id] of [
    ['its record id', () => byRecord],
    ['its tool and conversation', () => fromTheTranscript],
  ] as const) {
    it(`by ${asked}: says where the run stands as the reading of the whole project does, and reads no record that only the pipeline is linked to`, async () => {
      let reply = { statusCode: 0, body: '' }
      const read = await whatGaveBackThePipelinesTask(async () => {
        reply = await app.inject({ method: 'GET', url: `/api/sessions/${encodeURIComponent(id())}`, headers })
      })
      expect(reply.statusCode, reply.body).toBe(200)
      const session = (JSON.parse(reply.body) as { session: Record<string, any> }).session
      // CONTROL: the run stands in the pipeline by the reading of the whole project, and that reading gives the pipeline's
      // other task back, so a statement of the door that read it would be seen.
      const whole = S.placementOf(session['id'], session['recordId'], S.readSessionEvidence(HERE))
      expect(whole).toMatchObject({ kind: 'in', primary: { project: { title: 'A made-up pipeline' } } })
      expect(await whatGaveBackThePipelinesTask(() => S.readSessionEvidence(HERE))).not.toEqual([])
      expect(session['placement']).toEqual(whole)
      expect(read).toEqual([])
    }, 60_000)
  }
})
