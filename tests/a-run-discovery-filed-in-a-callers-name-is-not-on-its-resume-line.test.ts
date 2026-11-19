// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN DISCOVERY FILED IN A CALLER'S NAME IS NOT ON THAT CALLER'S RESUME LINE. Wave 13s round 217, the third loose end
 * of problem tdrkGf2L2761.
 *
 * An agent's profile shows the command that resumes its newest run (GET /api/terminals/agents/:agent/way-back), and the
 * person's press brings that run back. A run that names no serving agent counts there for the agent that filed it for
 * itself. When an agent asks for a sweep, discovery files each conversation it finds on this computer in that agent's
 * name, proved by the agent's own key, and its stamp says it filed the run in a caller's name. The guard on a run's
 * conversation does not count such a run as the caller's own (`theAgentsWhoseOwnRunThisIs` in
 * src/server/lib/the-run-a-key-holds.ts). The resume line read the first revision alone, so the newest conversation a
 * sweep found took the agent's line, with the command that resumes somebody else's conversation.
 *
 *   1. THE LINE PASSES OVER A RUN DISCOVERY FILED. The agent files a run for itself, with its own key and no serving
 *      agent, and its line shows that run. A sweep the agent asked for then files a newer conversation in its name. The
 *      line still shows the agent's own run.
 *   2. THE PRESS FINDS WHAT THE LINE SHOWS. The person's press to bring the run discovery filed back is refused, because
 *      it is not a run of the agent.
 *   3. A RUN STAMPED WITH NO PROVIDERSESSION IS NOT ON THE LINE, as discovery filed one in a caller's name before it
 *      wrote its mark: by the agent's own key, naming its conversation in its stamp alone. A run filed as the session
 *      hook files one, naming its conversation in `providerSession` and in its stamp, takes the line.
 *
 * Each case first checks the fixture against the store: the run discovery filed was written once, under the agent's
 * name and proved by its own key with no other holder, and its first revision carries the mark discovery writes, read
 * by the code that reads it. The runs of case 3 were written once in the same way and carry no mark. No run names a
 * serving agent.
 *
 * Red before the code: case 1 found the run discovery filed on the line, and case 2 found the press passed that run on
 * to its way back, which refused it because nobody recorded the folder it worked in.
 *
 * Mutations, each run against this file after the code:
 *   - the resume line reading the first revision alone again (`theAgentFiledItForItself`): cases 1 and 2 go red;
 *   - the own-run reading not reading discovery's mark: cases 1 and 2 went red, until case 3's reading came (below);
 *   - the resume line counting no filing for its filer: case 1 goes red on the run the agent filed for itself, and case
 *     2 with it, as case 1 stops before the sweep;
 *   - the press counting every run that names no serving agent for the agent asked about: case 2 goes red.
 *
 * Case 3 came after the others, and was red before the reading asked a stamped first revision for a `providerSession`:
 * the stamped run took the line. Its mutations, each run against this file:
 *   - no first revision read as discovery's: cases 1, 2 and 3 go red;
 *   - discovery's mark not read: no case goes red, as the run a sweep files names no `providerSession` either;
 *   - a stamp with no `providerSession` not read as discovery's: case 3 goes red on the stamped run;
 *   - every stamped first revision read as discovery's, `providerSession` or not: case 3 goes red on the hook's run;
 *   - every first revision with no `providerSession` read as discovery's, stamped or not: case 1 goes red on the run the
 *     agent filed for itself, and cases 2 and 3 with it;
 *   - discovery's stamp not saying it filed the run in a caller's name: case 1 goes red on its fixture check.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

type Actor = import('../src/server/lib/records.ts').Actor

/** The agent that asks for the sweep. */
const ASKER = 'the-sweep-asker'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let asThePerson: Record<string, string> = {}
let asTheAsker: Record<string, string> = {}
/** The run the asker filed for itself, and the run a sweep it asked for filed in its name. */
let own = ''
let swept = ''

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** The run the asker's resume line shows, as the person reads it, or null. */
async function theRunOnTheLine(): Promise<string | null> {
  const read = await ask('GET', `/api/terminals/agents/${ASKER}/way-back`, asThePerson)
  expect(read.status, read.said).toBe(200)
  return read.body['run']?.id ?? null
}

/**
 * A SWEEP THE ASKER ASKED FOR FILES ONE CONVERSATION, as discovery files each one it finds: in the asker's name, proved by
 * its own key. The sweep reads a made-up home folder holding one made-up transcript, so it finds this conversation and
 * no other. The id of the run it filed.
 */
async function aSweepFilesInTheAskersName(): Promise<string> {
  const sessions = await import('../src/server/lib/sessions.ts')
  const talk = randomUUID()
  const home = mkdtempSync(join(tmpdir(), 'mole-office-a-sweep-files-in-a-callers-name-'))
  try {
    const folder = join(home, '.claude', 'projects', '-made-up-project')
    mkdirSync(folder, { recursive: true })
    const line = { parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: 'made-up' }, timestamp: new Date(Date.now() - 60 * 60_000).toISOString(), userType: 'external', entrypoint: 'cli', cwd: '/made-up-project', version: '2.1.223' }
    writeFileSync(join(folder, `${talk}.jsonl`), `${JSON.stringify(line)}\n`)
    const env: AdapterEnv = { homeDir: home, now: new Date(), scanProcesses: () => ({ ok: true, processes: [] }), runningWithinSeconds: 5 * 60, orphanAfterSeconds: 6 * 60 * 60 }
    const found = sessions.getSession(`claude-code:${talk}`, 'default', env)
    expect(found, 'the sweep did not find the made-up transcript').not.toBeNull()
    const asker: Actor = { type: 'agent', id: ASKER, from: 'this machine', provedBy: 'an-agent-key' }
    const filed = sessions.ensureSessionRecord(found!, asker, 'default', env)
    expect(filed.created, 'the sweep filed no new run').toBe(true)
    return filed.record.id
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

/** Who made each write to a run, what proved it and whose key it was, and whether its data carries discovery's mark. */
async function theWritesOf(run: string): Promise<{ seq: number; actorId: string; provedBy: string | null; holder: string | null; marked: boolean }[]> {
  const { discoveryFiledItInACallersName } = await import('../src/shared/discovery-stamp.ts')
  const rows = t.client.sqlite
    .prepare('SELECT seq, actor_id AS actorId, proved_by AS provedBy, proved_holder AS holder, data FROM revisions WHERE record_id = ? ORDER BY seq')
    .all(run) as { seq: number; actorId: string; provedBy: string | null; holder: string | null; data: string }[]
  return rows.map(({ data, ...write }) => ({ ...write, marked: discoveryFiledItInACallersName(JSON.parse(data) as Record<string, unknown>) }))
}

/** The fixture's own check: the run names no serving agent, so only the reading of whose filing it is can count it. */
function namesNoServingAgent(run: string): void {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  expect(data['servingAgent'], `${run} names a serving agent`).toBeUndefined()
  expect(data['servingAgentId'], `${run} names a serving agent`).toBeUndefined()
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records. Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = await apiApp()
  await app.app.ready()
  const keys = join(dirname(t.file), 'keys.json')
  asThePerson = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(keys),
  }
  const made = await ask('POST', '/api/agents/started', asThePerson, { handle: ASKER, name: ASKER, role: 'worker', workArea: ['src'], chapters: ['5'] })
  expect(made.status, made.said).toBe(201)
  const key = String(made.body['whatToGiveIt']?.key ?? '')
  expect(/^[0-9a-f]{64}$/.test(key), 'the registration answered no key').toBe(true)
  asTheAsker = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ASKER, 'x-mole-office-key': key }
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe("an agent's resume line and a run discovery filed in its name", () => {
  it('1: the line passes over the run a sweep the agent asked for filed, and keeps the run the agent filed for itself', async () => {
    const filed = await ask('POST', '/api/records', asTheAsker, {
      kind: 'session',
      title: 'Test run · filed by its agent for itself',
      data: { state: 'running', runtime: 'claude-code', doing: 'Test run, made up for this file.' },
    })
    expect(filed.status, filed.said).toBe(201)
    own = String(filed.body['record']?.id ?? '')
    namesNoServingAgent(own)
    expect(await theWritesOf(own)).toEqual([{ seq: 1, actorId: ASKER, provedBy: 'an-agent-key', holder: null, marked: false }])
    expect(await theRunOnTheLine(), 'the run the agent filed for itself is not on its line').toBe(own)

    swept = await aSweepFilesInTheAskersName()
    namesNoServingAgent(swept)
    expect(await theWritesOf(swept), 'the run is not one discovery filed in the asker\'s name and nothing else wrote').toEqual([
      { seq: 1, actorId: ASKER, provedBy: 'an-agent-key', holder: null, marked: true },
    ])
    expect(await theRunOnTheLine(), 'the run discovery filed in the agent\'s name is on its line').toBe(own)
  })

  it('2: the press refuses the run discovery filed as not a run of the agent', async () => {
    expect(swept, 'the case before filed no run').not.toBe('')
    const pressed = await ask('POST', `/api/terminals/agents/${ASKER}/way-back`, asThePerson, { session: swept })
    expect(pressed.status, pressed.said).toBe(409)
    expect(pressed.body['code'], pressed.said).toBe('wayBackNotThisAgents')
  })

  it('3: a run stamped with no providerSession, as discovery filed one before its mark, is not on the line; a run the hook files is', async () => {
    expect(own, 'case 1 filed no run').not.toBe('')
    const { DISCOVERY_KEY } = await import('../src/shared/discovery-stamp.ts')
    /** A discovery stamp naming `talk`. Its log path is made up and names no file. */
    const stampNaming = (talk: string): Record<string, unknown> => ({ extra: { [DISCOVERY_KEY]: { tool: 'claude-code', externalId: talk, logPath: `/made-up-for-a-test/${talk}.jsonl` } } })
    const filedByTheAsker = async (title: string, data: Record<string, unknown>): Promise<string> => {
      const filed = await ask('POST', '/api/records', asTheAsker, { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', ...data } })
      expect(filed.status, filed.said).toBe(201)
      const run = String(filed.body['record']?.id ?? '')
      namesNoServingAgent(run)
      expect(await theWritesOf(run)).toEqual([{ seq: 1, actorId: ASKER, provedBy: 'an-agent-key', holder: null, marked: false }])
      return run
    }
    // AS DISCOVERY FILED A RUN IN THE AGENT'S NAME BEFORE IT WROTE ITS MARK: by the agent's own key, naming the
    // conversation in its stamp and nowhere else.
    await filedByTheAsker('Test run · stamped, with no providerSession', stampNaming(randomUUID()))
    expect(await theRunOnTheLine(), 'the run stamped with no providerSession is on the line').toBe(own)
    // AS THE SESSION HOOK FILES A RUN: by the agent's own key, naming its conversation in providerSession and in its stamp.
    const talk = randomUUID()
    const hooks = await filedByTheAsker('Test run · as the session hook files it', { providerSession: talk, ...stampNaming(talk) })
    expect(await theRunOnTheLine(), 'the run filed as the session hook files it is not on the line').toBe(hooks)
  })
})
