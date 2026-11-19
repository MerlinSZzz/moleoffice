// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A USE OF A TOOL IS A RUN'S LAST ACTIVITY (problem mR8vNPOVNQ_p, wave 13s round 33b, the secretary's message IatdjoGLajNS).
 *
 * Since round 33 a use is one row of `tool_uses` and moves nothing on the run's record: not `updated_at`, not
 * `lastOutputAt`, and no change row. So a run that only used tools read as idle, and the late-or-stuck and idle
 * reminders read that. Every reader of a run's last activity now asks lib/newest-use.ts for the run's newest use. This
 * file pins four of them:
 *
 *   1. the sessions sweep: a run with uses and no lastOutputAt shows its newest use as its last activity, and says so;
 *   2. the idle reminder: an agent whose only recent activity is its run's uses is judged by them, including a run
 *      that is running and whose record has not changed for days;
 *   3. the recipients list: a run is last seen at its newest use;
 *   4. a work domain's last sign: its session's newest use is a sign of work;
 *   5. presence (round 34): the words beside an agent's grey dot read its live runs' newest use as well as their
 *      output, take the newer of the two, name which it was, and never ask a run that has ended.
 *
 * Every run, agent and use here is made up. No log is read: the sweep gets a test home of its own.
 *
 * ---------------------------------------------------------------------------------------
 * PROVED BY MUTATION (chapter 5): CONTROL green, then each mutation alone, then RESTORE green
 * ---------------------------------------------------------------------------------------
 *
 * Each file was restored byte-identical after each mutation (sha256 checked before and after each). The mutations
 * and their results are in the report of round 33b.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const ACTOR = { type: 'agent', id: 'last-activity-tester' } as const
/** A day long before any use below, for the stamps of a record nobody has touched since. */
const LONG_AGO = '2026-01-05 09:00:00'

let t: TestDb
let app: FastifyInstance
let home: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  home = mkdtempSync(join(tmpdir(), 'mole-office-last-activity-home-'))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(home, { recursive: true, force: true })
})

/** A run filed by hand with no lastOutputAt, whose record and change rows are all from LONG_AGO. */
function aQuietRun(title: string, data: Record<string, unknown> = {}, workspaceId = WORKSPACE): string {
  const run = t.api.createRecord({ workspaceId, kind: 'session', title, data: { state: 'running', ...data }, actor: ACTOR }).id
  t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(LONG_AGO, LONG_AGO, run)
  t.client.sqlite.prepare('UPDATE changes SET at = ? WHERE record_id = ?').run(LONG_AGO, run)
  return run
}

/** Uses written straight into the table at the stamps given, in that order, so each place and time is known. */
function usesAt(run: string, ...stamps: string[]): void {
  const insert = t.client.sqlite.prepare(
    "INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said, actor_type, actor_id) VALUES (?, (SELECT workspace_id FROM records WHERE id = ?), ?, ?, ?, 'data-copy', 'make: a made-up use', 'agent', 'last-activity-tester')",
  )
  stamps.forEach((at, i) => insert.run(`${run}-use-${String(i + 1)}`, run, run, i + 1, at))
}

function env(): AdapterEnv {
  return {
    homeDir: home,
    now: new Date(),
    scanProcesses: () => ({ ok: true, processes: [] }),
    runningWithinSeconds: 5 * 60,
    orphanAfterSeconds: 6 * 60 * 60,
  }
}

/** Register an agent through the door, and give back its registry id. */
async function register(handle: string): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

describe('a use of a tool is a run’s last activity', () => {
  it('1. the sessions sweep shows a run’s newest use as its last activity, and names the clock', async () => {
    const run = aQuietRun('A made-up run that only uses tools')
    // Through the use door, as a run writes them, so the stamp and the place are the door's own.
    t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool_category', title: 'Made-up tools', data: { says: 'Made up.' }, actor: ACTOR })
    const category = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'tool_category'").get() as { id: string }).id
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'tool',
      title: 'Data copy',
      data: { entry: 'tool', slug: 'data-copy', forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' },
      actor: ACTOR,
    })
    for (const said of ['make: the first made-up use', 'open: the second made-up use']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/toolset/uses',
        headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ACTOR.id, 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-session': run },
        payload: { tool: 'data-copy', said },
      })
      expect(res.statusCode, res.body).toBe(201)
    }
    // The use moved nothing on the record, which is why this reader has to ask.
    expect(t.client.sqlite.prepare('SELECT updated_at AS at FROM records WHERE id = ?').get(run)).toEqual({ at: LONG_AGO })
    const newest = (t.client.sqlite.prepare('SELECT at FROM tool_uses WHERE run_id = ? AND seq = 2').get(run) as { at: string }).at

    const { sweepSessions } = await import('../src/server/lib/sessions.ts')
    const view = one(sweepSessions(WORKSPACE, env()).sessions.filter((s) => s.recordId === run), 'the run on the sweep')
    expect(view.lastActivityAt).toBe(newest)
    expect(view.lastActivityFrom).toBe('tool-use')
    expect(view.stateReason).toContain(`Its clock is the newest use of a tool it wrote, at ${newest}`)
  })

  it('2. the idle reminder judges an agent by its runs’ uses, a running run whose record has not changed included', async () => {
    const { idleReminderHours } = await import('../src/server/lib/env.ts')
    const reminders = await import('../src/server/lib/reminders.ts')
    const hour = 3_600_000
    const idle = idleReminderHours() * hour
    // TEN DAYS ON, so every stamp the registration and the runs' records wrote is more than a day before the watcher
    // started, and the only activity after it is the uses written below.
    //
    // AND ON A DAY WHOSE CLOCK DOES NOT CHANGE (problem VXCqXGHwFTtn). A stored stamp is the local wall clock with no
    // zone, so a stamp in the hour the clocks repeat reads back an hour early. Started at 00:55 on 15 October in
    // London, "ten minutes ago" fell at 01:45 on 25 October, in that hour, and read as seventy minutes idle. The test
    // moves on a day at a time until the zone's offset is the same from a day before the watcher started to `now`.
    const offsetAt = (ms: number): number => new Date(ms).getTimezoneOffset()
    let day = Date.now() + 10 * 24 * hour
    while (offsetAt(day - hour - 24 * hour) !== offsetAt(day + idle + hour)) day += 24 * hour
    const since = new Date(day - hour)
    const now = new Date(day + idle + hour)

    const runFor = async (handle: string): Promise<string> => {
      const id = await register(handle)
      return t.api.createRecord({
        workspaceId: WORKSPACE,
        kind: 'session',
        title: `${handle} working`,
        data: { state: 'running', runtime: 'claude-code', servingAgent: handle, servingAgentId: id },
        actor: { type: 'human', id: THE_PERSON },
      }).id
    }
    // Used a tool once, past the idle hour ago: idle, and reminded.
    usesAt(await runFor('used-a-tool-then-stopped'), localStamp(new Date(day)))
    // Used a tool past the idle hour ago and again ten minutes ago: working, and not reminded. Its newest use is its
    // highest place.
    usesAt(await runFor('still-using-tools'), localStamp(new Date(day)), localStamp(new Date(now.getTime() - 10 * 60_000)))
    // No use at all: nothing since the watcher started, so it is passed over.
    await runFor('never-used-a-tool')

    const pass = reminders.sendTheRemindersThatAreDue(WORKSPACE, now, since)
    expect(pass.idleReminded).toContain('used-a-tool-then-stopped')
    expect(pass.idleReminded).not.toContain('still-using-tools')
    expect(pass.idleReminded).not.toContain('never-used-a-tool')
  })

  it('3. the recipients list says a run was last seen at its newest use', async () => {
    // A PROJECT OF ITS OWN, so the recent list's budget cannot cut this case's run because of what
    // another case filed.
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    const project = createWorkspace({ id: 'last-activity-case-3', title: 'A made-up project for one case' })
    const run = aQuietRun('A made-up run seen only through its uses', {}, project.id)
    usesAt(run, '2026-10-09 10:00:00', '2026-10-09 11:30:00')
    const { recipientsFor } = await import('../src/server/lib/recipients.ts')
    const answer = recipientsFor(null, project.id)
    const seen = one([...answer.connected, ...answer.recent].filter((c) => c.sessionId === run), 'the run on the list')
    expect(seen.lastSeenAt).toBe('2026-10-09 11:30:00')
    expect(seen.lastSeenFrom).toBe('tool-use')
  })

  it('4. a work domain’s last sign is its session’s newest use when that is the newest thing', async () => {
    const run = aQuietRun('A made-up run that holds a domain')
    const domain = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: 'Stands in for a domain', data: {}, actor: ACTOR }).id
    t.client.sqlite.prepare('UPDATE revisions SET at = ? WHERE record_id = ?').run(LONG_AGO, domain)
    const { lastSignOf } = await import('../src/server/lib/workdomain.ts')
    expect(lastSignOf(domain, run)).toEqual({ at: LONG_AGO, from: 'a revision of this domain' })
    usesAt(run, '2026-10-09 12:00:00')
    expect(lastSignOf(domain, run)).toEqual({ at: '2026-10-09 12:00:00', from: 'a use of a tool by its session' })
  })

  it('5. presence reads a live run’s newest use beside its output, takes the newer, and names which it was', async () => {
    const presence = await import('../src/server/lib/presence.ts')
    const minute = 60_000
    const runOf = (agentId: string, data: Record<string, unknown>): string =>
      t.api.createRecord({
        workspaceId: WORKSPACE,
        kind: 'session',
        title: `A made-up run of ${agentId}`,
        data: { runtime: 'claude-code', ranAs: [{ workspaceId: WORKSPACE, agentId }], ...data },
        actor: { type: 'human', id: THE_PERSON },
      }).id
    const id = await register('presence-by-its-uses')
    const who = { kind: 'agent', id } as const
    const within = presence.participantPresence(who, WORKSPACE).agentAliveWithinMinutes
    // Output written down long ago, and a use two minutes ago: the use is the newer sign, and the words say so.
    const run = runOf(id, { state: 'running', lastOutputAt: localStamp(new Date(Date.now() - (within + 30) * minute)) })
    usesAt(run, localStamp(new Date(Date.now() - (within + 20) * minute)), localStamp(new Date(Date.now() - 2 * minute)))
    const recent = presence.participantPresence(who, WORKSPACE)
    expect(recent.colour, 'a use is not something answering, so the dot stays grey').toBe('grey')
    expect(recent.says).toContain('A run of this agent used a tool 2 minutes ago, but a use of a tool alone cannot take a message.')

    // Every use older than the window: the newest one is named, with the number of minutes.
    const old = await register('presence-by-an-old-use')
    usesAt(runOf(old, { state: 'running' }), localStamp(new Date(Date.now() - (within + 10) * minute)))
    expect(presence.participantPresence({ kind: 'agent', id: old }, WORKSPACE).says).toContain(
      `The newest use of a tool by any run of this agent was ${String(within + 10)} minutes ago`,
    )

    // A run that has ended is not asked, however recent its use.
    const ended = await register('presence-of-an-ended-run')
    usesAt(runOf(ended, { state: 'crashed' }), localStamp(new Date(Date.now() - minute)))
    expect(presence.participantPresence({ kind: 'agent', id: ended }, WORKSPACE).says).not.toContain('used a tool')
  })
})
