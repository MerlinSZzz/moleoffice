// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DISCOVERY FILES EACH RUN WHERE IT RAN, OR NOWHERE, AND A DRY RUN WRITES NOTHING. Problem kDKj9iXd4Vft.
 *
 * POST /api/sessions/discover filed every conversation on the machine into the project that asked, and a dry run did
 * so too: an agent that asked for a harmless look filled a project with every conversation on the computer. Now:
 *   1. a dry run writes nothing at all, and answers what it would file and where;
 *   2. a conversation is filed into the project its working directory matches, whoever asked;
 *   3. a conversation no project holds is reported, and never filed into the project that asked;
 *   4. a run that already has a record in another project is written onto there, and never filed a second time.
 *
 * Every conversation here is made up, in a home directory this file makes, and the door is served with that home.
 * Nothing reads the conversations of the computer the test runs on.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/discovery-files-each-run-where-it-ran.test.ts
 * Mutations, one line each in src/server/lib/sessions.ts `syncSessions`, restored with cp and checked with cmp:
 *   A. `const dryRun = opts.dryRun === true` to `const dryRun = false`: case 1 goes red (records are filed).
 *   B. the new record's project, `(matched as { id: string }).id`, to `_askedFrom`: case 2 goes red.
 *   C. the not-filed branch's `continue` removed, and a run with no match filed into the project that asked, as the
 *      door did before (`?? (matched as { id: string }).id` to `?? (matched?.kind === 'matched' ? matched.id :
 *      _askedFrom)`): case 3 goes red.
 *   D. the lookup of records in every project, `filed.get(observed.id) ?? null`, to `null as PanelRecord | null`:
 *      case 4 goes red.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { aRealFolderNamed, freshDb, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'

const NOW = new Date('2026-09-29T09:00:00Z')
const AN_HOUR_AGO = new Date(NOW.getTime() - 60 * 60_000).toISOString()

/** The project that asks for the sweep, and another project with a checkout of its own. */
const ASKING = 'default'
const HARBOUR = 'far-harbour'

/** Where the made-up conversations ran: a folder the harbour project holds, and a folder no project holds. */
const HARBOUR_FOLDER = aRealFolderNamed('harbour-soundings')
const NOBODYS_FOLDER = aRealFolderNamed('loose-notes')
afterAll(() => {
  for (const folder of [HARBOUR_FOLDER, NOBODYS_FOLDER]) rmSync(dirname(folder), { recursive: true, force: true })
})

let db: TestDb
let home: string
let app: FastifyInstance | null = null

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: HARBOUR, title: 'Far harbour', note: 'a made-up project with a checkout of its own' })
  await theProjectHoldsThisFolder(HARBOUR, HARBOUR_FOLDER)
}, 60_000)

afterAll(() => {
  db.close()
})

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-discovery-home-'))
})

afterEach(async () => {
  if (app) await app.close()
  app = null
  // Each case counts the session records the whole sweep made, so it takes away the ones it filed.
  for (const workspaceId of [ASKING, HARBOUR]) {
    for (const one of db.api.listRecords({ workspaceId, kind: 'session' })) {
      db.api.deleteRecord(one.id, db.api.HUMAN)
    }
  }
  rmSync(home, { recursive: true, force: true })
})

/** One made-up Claude Code conversation that ran in `cwd`, laid out as Claude Code lays it out. */
function aConversationIn(id: string, cwd: string): void {
  const dir = join(home, '.claude', 'projects', '-a-made-up-slug')
  mkdirSync(dir, { recursive: true })
  const lines = [
    { parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: 'measure the soundings' }, timestamp: AN_HOUR_AGO, userType: 'external', entrypoint: 'cli', cwd, version: '2.1.223' },
    { type: 'assistant', isSidechain: false, message: { role: 'assistant', content: [{ type: 'text', text: 'measured' }] }, timestamp: AN_HOUR_AGO, cwd },
  ]
  writeFileSync(join(dir, `${id}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
}

function env(): AdapterEnv {
  return {
    homeDir: home,
    now: NOW,
    scanProcesses: () => ({ ok: true, processes: [] }),
    runningWithinSeconds: 5 * 60,
    orphanAfterSeconds: 6 * 60 * 60,
  }
}

/** The door, served with the made-up home above, asked from `ASKING`. */
async function discover(payload: Record<string, unknown>): Promise<Record<string, any>> {
  const { sessionRoutes } = await import('../src/server/api/sessions.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(sessionRoutes, { prefix: '/api', env })
  await app.ready()
  const reply = await app.inject({
    method: 'POST',
    url: '/api/sessions/discover',
    headers: { 'x-mole-office-workspace': ASKING },
    payload,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return JSON.parse(reply.body) as Record<string, any>
}

/** Every live session record, in every project, as project and title. */
function sessionRecordsEverywhere(): { workspaceId: string; id: string }[] {
  return [ASKING, HARBOUR].flatMap((workspaceId) =>
    db.api.listRecords({ workspaceId, kind: 'session' }).map((record: { id: string }) => ({ workspaceId, id: record.id })))
}

describe('discovery files each run where it ran', () => {
  it('1: a dry run writes nothing, and says what it would file and where', async () => {
    aConversationIn('11111111-0000-0000-0000-000000000001', HARBOUR_FOLDER)
    aConversationIn('11111111-0000-0000-0000-000000000002', NOBODYS_FOLDER)
    const before = sessionRecordsEverywhere()

    const out = await discover({ dryRun: true })
    expect(sessionRecordsEverywhere()).toEqual(before)
    expect(out['report']['dryRun']).toBe(true)
    expect(out['report']['created']).toBe(0)
    expect(String(out['note'])).toContain('A dry run: nothing was written.')
    const where = out['report']['where'] as { conversation: string; action: string; project: string | null }[]
    expect(where.find((one) => one.conversation.endsWith('000000000001'))).toMatchObject({ action: 'filed', project: HARBOUR })
    expect(where.find((one) => one.conversation.endsWith('000000000002'))).toMatchObject({ action: 'not filed', project: null })
  })

  it('2: files a conversation into the project whose folder it ran in, not the project that asked', async () => {
    aConversationIn('22222222-0000-0000-0000-000000000001', HARBOUR_FOLDER)

    const out = await discover({})
    expect(out['report']['created']).toBe(1)
    const filed = sessionRecordsEverywhere()
    expect(filed.map((one) => one.workspaceId)).toEqual([HARBOUR])
    expect(db.api.listRecords({ workspaceId: ASKING, kind: 'session' })).toEqual([])
  })

  it('3: files nowhere a conversation no project holds, and says so', async () => {
    aConversationIn('33333333-0000-0000-0000-000000000001', NOBODYS_FOLDER)

    const out = await discover({})
    expect(out['report']['created']).toBe(0)
    expect(sessionRecordsEverywhere()).toEqual([])
    const where = out['report']['where'] as { action: string; directory: string | null; because: string }[]
    expect(where).toHaveLength(1)
    expect(where[0]).toMatchObject({ action: 'not filed', directory: NOBODYS_FOLDER })
    expect(where[0]?.because).toContain('It was not filed.')
    expect(String(out['note'])).toContain('1 not filed')
  })

  it('4: writes onto the record a run already has in another project, and files no second one', async () => {
    aConversationIn('44444444-0000-0000-0000-000000000001', HARBOUR_FOLDER)
    await discover({})
    const first = sessionRecordsEverywhere()
    expect(first).toHaveLength(1)
    await app?.close()
    app = null

    const again = await discover({})
    expect(again['report']['created']).toBe(0)
    expect(sessionRecordsEverywhere()).toEqual(first)
    const where = again['report']['where'] as { action: string; project: string | null }[]
    expect(where[0]).toMatchObject({ action: 'observed', project: HARBOUR })
  })
})
