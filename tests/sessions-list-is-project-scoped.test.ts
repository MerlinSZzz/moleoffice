// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSIONS DOOR ANSWERS DISK RUNS ONLY IN THE PROJECT THEIR FOLDER NAMES.
 *
 * Every log and working folder in this file is made up. The adapter gets a test home, so no test
 * reads this computer's own conversations. Stored session records remain visible in their project.
 *
 * Problem 8CGX4TA2Sgn4. Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/sessions-list-is-project-scoped.test.ts
 * Mutation, restored with cp and checked with cmp: in src/server/lib/sessions.ts `scopeSessionsToProject`,
 * `if (resolution?.kind === 'matched' && resolution.id === workspaceId) visible.push(session)` to
 * `visible.push(session)`: all five cases go red (the hidden runs are shown, and the count each case reads changes).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aRealFolderNamed, freshDb, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'

const NOW = new Date('2026-09-29T09:00:00Z')
const AN_HOUR_AGO = new Date(NOW.getTime() - 60 * 60_000).toISOString()
const ASKING = 'default'
const OTHER_PROJECT = 'sessions-other-project'
const AMBIGUOUS_ONE = 'sessions-ambiguous-one'
const AMBIGUOUS_TWO = 'sessions-ambiguous-two'

const OWN_FOLDER = aRealFolderNamed('sessions-door-own-folder')
const OTHER_FOLDER = aRealFolderNamed('sessions-door-other-folder')
const UNCLAIMED_FOLDER = aRealFolderNamed('sessions-door-unclaimed-folder')
const AMBIGUOUS_FOLDER = aRealFolderNamed('sessions-door-ambiguous-folder')

afterAll(() => {
  for (const folder of [OWN_FOLDER, OTHER_FOLDER, UNCLAIMED_FOLDER, AMBIGUOUS_FOLDER]) {
    rmSync(dirname(folder), { recursive: true, force: true })
  }
})

let db: TestDb
let home: string
let app: FastifyInstance | null = null

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  for (const id of [OTHER_PROJECT, AMBIGUOUS_ONE, AMBIGUOUS_TWO]) {
    createWorkspace({ id, title: id })
  }
  await theProjectHoldsThisFolder(ASKING, OWN_FOLDER)
  await theProjectHoldsThisFolder(OTHER_PROJECT, OTHER_FOLDER)
  await theProjectHoldsThisFolder(AMBIGUOUS_ONE, AMBIGUOUS_FOLDER)
  await theProjectHoldsThisFolder(AMBIGUOUS_TWO, AMBIGUOUS_FOLDER)
}, 60_000)

afterAll(() => {
  db.close()
})

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-sessions-home-'))
})

afterEach(async () => {
  if (app) await app.close()
  app = null
  // The one case that stores a session record takes it away, so the door's list holds only the
  // disk runs of the next case.
  for (const one of db.api.listRecords({ workspaceId: ASKING, kind: 'session' })) {
    db.api.deleteRecord(one.id, db.api.HUMAN)
  }
  rmSync(home, { recursive: true, force: true })
})

function env(): AdapterEnv {
  return {
    homeDir: home,
    now: NOW,
    scanProcesses: () => ({ ok: true, processes: [] }),
    runningWithinSeconds: 5 * 60,
    orphanAfterSeconds: 6 * 60 * 60,
  }
}

/** One made-up conversation, in the layout Claude Code writes under its own project directory. */
function aConversationIn(id: string, cwd: string, title: string): void {
  const dir = join(home, '.claude', 'projects', '-made-up-project-slug')
  mkdirSync(dir, { recursive: true })
  const lines = [
    {
      type: 'user',
      message: { role: 'user', content: `purpose ${title}` },
      timestamp: AN_HOUR_AGO,
      cwd,
      customTitle: title,
    },
    {
      type: 'assistant',
      isSidechain: false,
      message: { role: 'assistant', content: [{ type: 'text', text: 'finished' }] },
      timestamp: AN_HOUR_AGO,
      cwd,
    },
  ]
  writeFileSync(join(dir, `${id}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
}

async function getSessions(url = '/api/sessions') {
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(sessionRoutes, { prefix: '/api', env })
  await app.ready()
  return app.inject({ method: 'GET', url, headers: { 'x-mole-office-workspace': ASKING } })
}

const body = (reply: { body: string }) => JSON.parse(reply.body) as Record<string, any>

describe('GET /api/sessions answers disk runs for this project only', () => {
  it('answers a conversation whose folder this project holds', async () => {
    const id = '55555555-0000-0000-0000-000000000001'
    aConversationIn(id, OWN_FOLDER, 'OWN_PROJECT_SESSION_TITLE_1')

    const reply = await getSessions()
    expect(reply.statusCode).toBe(200)
    const out = body(reply)
    const session = (out['sessions'] as Record<string, any>[]).find((one) => one['externalId'] === id)
    expect(session).toMatchObject({ cwd: OWN_FOLDER, workspace: { path: OWN_FOLDER } })
    expect(out['notShownCount']).toBe(0)
  })

  it('omits and counts a conversation whose folder another project holds', async () => {
    const id = '55555555-0000-0000-0000-000000000002'
    const title = 'OTHER_PROJECT_SESSION_TITLE_2'
    aConversationIn(id, OTHER_FOLDER, title)

    const reply = await getSessions()
    const out = body(reply)
    expect(out['sessions']).toEqual([])
    expect(out['notShownCount']).toBe(1)
    for (const secret of [OTHER_FOLDER, title, id]) expect(reply.body).not.toContain(secret)

    await app?.close()
    app = null
    // ITS DETAIL IS ANSWERED EXACTLY AS A RUN NEVER FOUND: a different answer would itself say something is there.
    const detail = await getSessions(`/api/sessions/claude-code:${id}`)
    await (app as FastifyInstance | null)?.close()
    app = null
    const neverId = '55555555-0000-0000-0000-00000000dead'
    const never = await getSessions(`/api/sessions/claude-code:${neverId}`)
    expect(detail.statusCode).toBe(404)
    expect(detail.statusCode).toBe(never.statusCode)
    expect(detail.body.replaceAll(id, '<id>')).toBe(never.body.replaceAll(neverId, '<id>'))
    for (const secret of [OTHER_FOLDER, title]) expect(detail.body).not.toContain(secret)
  })

  it('omits a conversation whose folder no project holds', async () => {
    const id = '55555555-0000-0000-0000-000000000003'
    const title = 'UNCLAIMED_PROJECT_SESSION_TITLE_3'
    aConversationIn(id, UNCLAIMED_FOLDER, title)

    const reply = await getSessions()
    const out = body(reply)
    expect(out['sessions']).toEqual([])
    expect(out['notShownCount']).toBe(1)
    for (const secret of [UNCLAIMED_FOLDER, title, id]) expect(reply.body).not.toContain(secret)
  })

  it('omits a conversation whose folder matches two projects equally', async () => {
    const id = '55555555-0000-0000-0000-000000000004'
    const title = 'AMBIGUOUS_PROJECT_SESSION_TITLE_4'
    aConversationIn(id, AMBIGUOUS_FOLDER, title)

    const reply = await getSessions()
    const out = body(reply)
    expect(out['sessions']).toEqual([])
    expect(out['notShownCount']).toBe(1)
    for (const secret of [AMBIGUOUS_FOLDER, title, id]) expect(reply.body).not.toContain(secret)
  })

  it('keeps a stored session record in this project', async () => {
    const title = 'THIS_PROJECT_STORED_SESSION_TITLE_5'
    const record = db.api.createRecord({
      workspaceId: ASKING,
      kind: 'session',
      title,
      data: { state: 'running' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })

    const reply = await getSessions()
    expect(reply.statusCode).toBe(200)
    const out = body(reply)
    expect((out['sessions'] as Record<string, any>[]).find((one) => one['recordId'] === record.id)).toMatchObject({
      id: record.id,
      title,
      recordId: record.id,
    })
    expect(out['notShownCount']).toBe(0)
  })
})
