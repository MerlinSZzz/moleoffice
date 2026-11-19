// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORK DOMAIN SAYS WHAT THE AGENT BELIEVED BEFORE THE MACHINE SPOKE, AND NOTHING ELSE MAY WRITE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A hypothesis is filed and NOTHING is resolved by that call. The reply says so and offers the
 *    call that does resolve.
 * 2. The two ids are real, and they do not disagree about who is doing the work.
 * 3. An ordinary `PATCH` cannot write any of the four machine-written fields, and a `create` that
 *    arrives carrying one is refused too.
 * 4. AND THE OTHER DIRECTION, because a guard that refuses everybody is not a guard: an agent can
 *    still close its domain, retitle it, and edit its hypothesis before acceptance; and a stated
 *    person can still correct a machine field by hand.
 *
 * ---------------------------------------------------------------------------------------
 * `dataPatch`, NOT `data`, AND THIS IS NOT A STYLE CHOICE
 * ---------------------------------------------------------------------------------------
 *
 * Two sessions in this campaign have proved a refusal with `{"data": {...}}` and got a 200 that
 * proved nothing. `data` REPLACES the whole object, so the key under test is gone before validation
 * runs. Every refusal below sends `dataPatch`, which merges, so the stored record really does still
 * hold what the guard is being asked about.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import { PLAN_HOURS_BY_KIND } from '../src/shared/work.ts'
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb

/** A handle is one an agent in this project has held, so each case's handles carry its number. */
let caseNumber = 0
function handleFor(name: string): string {
  return `${name}-c${String(caseNumber)}`
}

beforeAll(async () => {
  t = await freshDb()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `work-domain-case-${String(caseNumber)}`
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: WORKSPACE, title: `A work domain case ${String(caseNumber)}` })
})

afterAll(() => {
  t.close()
})

/** This case's own project, so the handles a refusal names are only the ones it filed. */
let WORKSPACE = 'default'

/** The owner as the browser sends them: a person who said so. */
function person(): Actor {
  return { type: 'human', id: t.api.HUMAN.id, stated: true }
}

/** A request that sent no actor headers at all. This is the identity the freeze used to hand itself to. */
function saidNothing(): Actor {
  return { type: 'human', id: t.api.HUMAN.id, stated: false }
}

function anAgent(handle = 'wrist-cal'): string {
  const held = handleFor(handle)
  return t.api.createRecord({
    kind: 'agent',
    title: `Agent ${held}`,
    data: { handle: held, state: 'active' },
    workspaceId: WORKSPACE,
    actor: person(),
  }).id
}

function aSession(title = 'a run', data: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'session',
    title,
    data: { doing: 'something', ...data },
    workspaceId: WORKSPACE,
    actor: person(),
  }).id
}

function aDomain(over: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'work_domain',
    title: 'Wrist camera intrinsics',
    data: {
      objective: 'Replace the placeholder intrinsics with a measured fit.',
      agent: anAgent(),
      session: aSession(),
      writes: ['perception/calibration/wrist.py'],
      ...over,
    },
    workspaceId: WORKSPACE,
    actor: AGENT,
  }).id
}

describe('the hypothesis is filed, and the call that files it resolves nothing', () => {
  it('stores what the agent wrote and no resolution beside it', () => {
    const id = aDomain()
    const stored = t.api.getRecord(id)
    expect(stored?.kind).toBe('work_domain')
    const data = stored?.data as Record<string, unknown>
    expect(data['objective']).toBe('Replace the placeholder intrinsics with a measured fit.')
    expect(data['writes']).toEqual(['perception/calibration/wrist.py'])
    // THE ONE THAT MATTERS: nothing about what the machine thinks, because nothing on this path can
    // ask. An agent that read the machine's answer first would be agreeing with it, not being
    // criticised by it.
    expect(data['resolved']).toBeUndefined()
    expect(data['accepted']).toBeUndefined()
  })

  it('keeps the paths EXACTLY as the agent wrote them, with no tidying', () => {
    // Every trim, expansion and normalisation is an interpretation, and interpretation belongs in
    // `resolved`, attributed to the resolver and dated, beside what the agent wrote.
    const id = aDomain({ writes: ['./src/web/', 'src/shared/time.ts'], dependsOn: ['src/shared'] })
    const data = t.api.getRecord(id)?.data as Record<string, unknown>
    expect(data['writes']).toEqual(['./src/web/', 'src/shared/time.ts'])
    expect(data['dependsOn']).toEqual(['src/shared'])
  })

  it('refuses a create that arrives already resolved', () => {
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          kind: 'work_domain',
          title: 'Already decided',
          data: {
            objective: 'x',
            agent: anAgent('a2'),
            session: aSession('s2'),
            resolved: { at: '2026-08-26 09:00', resolver: 'wd-1', couldNotDo: { checked: true, items: [] } },
          },
          workspaceId: WORKSPACE,
          actor: AGENT,
        }),
      400,
    )
    expect(error.message).toContain('hypothesis')
    expect(error.message).toContain('/resolve')
  })

  it('takes no hours, because a work domain is not time somebody spends', () => {
    expect(PLAN_HOURS_BY_KIND.work_domain.mayHaveHours).toBe(false)
  })
})

describe('the two ids are real, and they do not disagree', () => {
  it('refuses a data.session that names something that is not a session', () => {
    const notASession = anAgent('not-a-session')
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          kind: 'work_domain',
          title: 'Bad session',
          data: { objective: 'x', agent: anAgent('a3'), session: notASession },
          workspaceId: WORKSPACE,
          actor: AGENT,
        }),
      400,
    )
    expect(error.message).toContain('is an agent, not a session')
  })

  it('refuses a data.session that names nothing at all', () => {
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          kind: 'work_domain',
          title: 'Missing session',
          data: { objective: 'x', agent: anAgent('a4'), session: 'nosuchrecord' },
          workspaceId: WORKSPACE,
          actor: AGENT,
        }),
      400,
    )
    expect(error.message).toContain('not a live record in this project')
  })

  it('refuses a data.agent that names something that is not an agent, and names the handles that exist', () => {
    anAgent('round-ten')
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          kind: 'work_domain',
          title: 'Bad agent',
          data: { objective: 'x', agent: aSession('s5'), session: aSession('s6') },
          workspaceId: WORKSPACE,
          actor: AGENT,
        }),
      400,
    )
    expect(error.message).toContain('is a session, not an agent')
    expect(error.message).toContain(handleFor('round-ten'))
  })

  it('refuses a session that already says it ran as a DIFFERENT agent, naming both', () => {
    const mine = anAgent('mine')
    const theirs = anAgent('theirs')
    const session = aSession('bound run', { ranAs: [{ workspaceId: WORKSPACE, agentId: theirs }] })
    const error = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          kind: 'work_domain',
          title: 'Two answers to one question',
          data: { objective: 'x', agent: mine, session },
          workspaceId: WORKSPACE,
          actor: AGENT,
        }),
      400,
    )
    expect(error.message).toContain(theirs)
    expect(error.message).toContain(mine)
  })

  it('allows a session that says it ran as the SAME agent, and one that has never said', () => {
    // THE OTHER DIRECTION. Every one of the 92 sessions in the live corpus carries no `ranAs` entry
    // for any project, so a rule that refused an unbound session would refuse every domain anybody
    // could file today.
    const agent = anAgent('same')
    const bound = aSession('bound', { ranAs: [{ workspaceId: WORKSPACE, agentId: agent }] })
    const unbound = aSession('unbound')
    expect(
      t.api.createRecord({
        kind: 'work_domain',
        title: 'Bound the same way',
        data: { objective: 'x', agent, session: bound },
        workspaceId: WORKSPACE,
        actor: AGENT,
      }).id,
    ).toBeTruthy()
    expect(
      t.api.createRecord({
        kind: 'work_domain',
        title: 'Never said',
        data: { objective: 'x', agent, session: unbound },
        workspaceId: WORKSPACE,
        actor: AGENT,
      }).id,
    ).toBeTruthy()
  })

  it('checks the two ids on the PATCH path as well, because a rule on one write path is not a rule', () => {
    const id = aDomain()
    const error = expectPanelError(
      t,
      () => t.api.patchRecord(id, { dataPatch: { session: 'nosuchrecord' } }, AGENT),
      400,
    )
    expect(error.message).toContain('not a live record in this project')
  })
})

describe('an ordinary PATCH cannot write a machine-written field', () => {
  // Sent as `dataPatch` in every case. `data` would replace the bag and delete the key under test
  // before validation ran, which is a 200 that proves nothing.
  const fields = ['resolved', 'responses', 'accepted', 'acknowledged'] as const

  for (const field of fields) {
    it(`refuses an agent writing data.${field} through the records door`, () => {
      const id = aDomain()
      const error = expectPanelError(
        t,
        () => t.api.patchRecord(id, { dataPatch: { [field]: { at: '2026-08-26 09:00' } } }, AGENT),
        403,
      )
      expect(error.message).toContain(field)
      expect(error.message).toContain('/api/work-domains/')
      // And nothing was written.
      expect((t.api.getRecord(id)?.data as Record<string, unknown>)[field]).toBeUndefined()
    })
  }

  it('refuses a request that sent no actor headers, because an absent header is not evidence of a person', () => {
    const id = aDomain()
    const error = expectPanelError(
      t,
      () => t.api.patchRecord(id, { dataPatch: { resolved: { at: 'x' } } }, saidNothing()),
      403,
    )
    expect(error.message).toContain('nothing said who is asking')
  })

  it('lets a STATED person correct one by hand, which is what makes this a guard and not a wall', () => {
    const id = aDomain()
    t.api.patchRecord(
      id,
      {
        dataPatch: {
          resolved: { at: '2026-08-26 09:00', resolver: 'wd-1', couldNotDo: { checked: false, because: 'no_file_index' } },
        },
      },
      person(),
    )
    const data = t.api.getRecord(id)?.data as Record<string, unknown>
    expect((data['resolved'] as Record<string, unknown>)['resolver']).toBe('wd-1')
  })

  it('leaves every other write on a work domain alone', () => {
    // THE OTHER DIRECTION AGAIN, and the one an over-wide guard would break: this guard is handed
    // the BODY that arrived, not the merged record. Handed the merged record it would see the
    // stored `resolved` on every patch and refuse every patch — a guard that refuses everybody.
    const id = aDomain()
    t.api.patchRecord(id, { dataPatch: { resolved: { at: '2026-08-26 09:00', resolver: 'wd-1', couldNotDo: { checked: true, items: [] } } } }, person())
    t.api.patchRecord(id, { title: 'Wrist camera intrinsics, take two' }, AGENT)
    t.api.patchRecord(id, { dataPatch: { closedAt: '2026-08-26' } }, AGENT)
    const after = t.api.getRecord(id)
    expect(after?.title).toBe('Wrist camera intrinsics, take two')
    expect((after?.data as Record<string, unknown>)['closedAt']).toBe('2026-08-26')
  })
})

describe('the hypothesis is a draft before acceptance and evidence after it', () => {
  it('lets the agent edit its own paths while nothing has been accepted', () => {
    const id = aDomain()
    t.api.patchRecord(id, { dataPatch: { writes: ['perception/calibration/wrist.py', 'config/wrist.yaml'] } }, AGENT)
    expect((t.api.getRecord(id)?.data as Record<string, unknown>)['writes']).toEqual([
      'perception/calibration/wrist.py',
      'config/wrist.yaml',
    ])
  })

  it('refuses the agent editing them after acceptance, and says what to do instead', () => {
    const id = aDomain()
    t.api.patchRecord(
      id,
      { dataPatch: { accepted: { at: '2026-08-26 09:20', writes: ['perception/calibration/wrist.py'] } } },
      person(),
    )
    const error = expectPanelError(t, () => t.api.patchRecord(id, { dataPatch: { writes: ['everything'] } }, AGENT), 403)
    expect(error.message).toContain('2026-08-26 09:20')
    expect(error.message).toContain('/accept')
    expect((t.api.getRecord(id)?.data as Record<string, unknown>)['writes']).toEqual([
      'perception/calibration/wrist.py',
    ])
  })

  it('still lets the agent close an accepted domain, because closing is not rewriting', () => {
    const id = aDomain()
    t.api.patchRecord(id, { dataPatch: { accepted: { at: '2026-08-26 09:20' } } }, person())
    t.api.patchRecord(id, { dataPatch: { closedAt: '2026-08-27' } }, AGENT)
    expect((t.api.getRecord(id)?.data as Record<string, unknown>)['closedAt']).toBe('2026-08-27')
  })
})
