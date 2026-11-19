// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK CLAIMS: what an agent says it is working on, and the group a conflict opens.
 *
 * Criterion M13 of design/messages/ACCEPTANCE.md: *An agent says what it is working on (a module,
 * files, records) with a lease that ends when its run ends (GROUND's registration says when). A
 * second claim that overlaps opens a group (M11). Claims are drawn on the record and on the
 * dashboard. This absorbs proposal `pg10HWny6J0j`.*
 *
 * THE RULE: a conflict opens a group and pulls the owner into it.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, expectPanelError, one, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice, isMoleOffice, type ParticipantRef } from '../src/shared/participants.ts'
import { participantKey } from '../src/shared/messages.ts'
import {
  A_CLAIM_IS_THE_CLAIMANTS_OWN,
  THAT_CLAIM_HAS_ENDED,
  leaseInputSays,
  leaseInputInFull,
  overlapKey,
  thingsOverlap,
  type ClaimOnTheWire,
} from '../src/shared/claims.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_OVERLAP_ENDED_PREFIX } from '../src/shared/groups.ts'

type ClaimsLib = typeof import('../src/server/lib/claims.ts')
type GroupsLib = typeof import('../src/server/lib/groups.ts')
type MessagesLib = typeof import('../src/server/lib/messages.ts')
type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let work: ClaimsLib
let team: GroupsLib
let pool: MessagesLib
let ledger: ResourcesLib

/** This case's own project and handles, so its claims, groups and overlaps are the only ones it reads. */
let PROJECT = 'panelx'
let caseNumber = 0
function handleFor(name: string): string {
  return `${name}-c${String(caseNumber)}`
}
let theProbeAtTheStart: ReturnType<ResourcesLib['osProbe']>

const OWNER: ParticipantRef = { kind: 'person', id: THE_PERSON }
/**
 * THE TWO AGENTS AS THE CLAIM DOOR HANDS THEM ON: by registry id. A new agent's id is not its handle,
 * and `fileAClaim` reads the claimant by id because the door resolved the caller before it. Set once
 * each agent is registered.
 */
let BUILDER: ParticipantRef = { kind: 'agent', id: '' }
let CHECKER: ParticipantRef = { kind: 'agent', id: '' }
const HUMAN = { type: 'human', id: THE_PERSON } as const
const AS_BUILDER = { type: 'agent', id: 'builder-x' } as const
const AS_CHECKER = { type: 'agent', id: 'checker-y' } as const

/** The two runs, one per agent, and the module both of them will reach for. */
let buildersRun = ''
let checkersRun = ''
let theModule = ''

/** C1–C3, wNjQEfclwxjJ; USER.md invariants 2 and 5. Mutation: answer unknown as the ledger. */
function expectUncheckedProcessWords(read: ClaimOnTheWire): void {
  expect(read.from).toBe('a process that could not be checked')
  if (read.from === null) throw new Error('The test claim has no lease input.')
  const short = 'The office could not check a process registered for this run. It keeps the claim rather than end it on a guess.'
  const full = 'The office could not check a process registered for this run. It could not confirm that any registered process is running. It keeps the claim rather than end it on a guess.'
  expect(leaseInputSays(read.from)).toBe(short)
  expect(leaseInputInFull(read.from)).toBe(full)
  expect(work.howItStands(read)).toBe(`Working on it. ${short}`)
  for (const [language, says, inFull] of [
    ['en', short, full],
    ['zh', '办公室无法检查为这次运行登记的一个进程。办公室保留认领，不凭猜测结束认领。',
      '办公室无法检查为这次运行登记的一个进程。没有任何已登记的进程被确认仍在运行。办公室保留认领，不凭猜测结束认领。'],
  ] as const) {
    const reader = createI18n(language)
    const sentences = [reader.t('homeWords.lease.fromUncheckedProcess'), reader.t('homeWords.lease.fromUncheckedProcessInFull')]
    expect(sentences).toEqual([says, inFull])
    for (const sentence of sentences) expect(sentence).not.toMatch(/is alive|strongest answer|进程正在这台机器上运行|最可靠的答案/)
    expect(reader.check().fallbacks).toEqual([])
  }
}

beforeAll(async () => {
  t = await freshDb()
  work = await import('../src/server/lib/claims.ts')
  team = await import('../src/server/lib/groups.ts')
  pool = await import('../src/server/lib/messages.ts')
  ledger = await import('../src/server/lib/resources.ts')
  theProbeAtTheStart = ledger.osProbe()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  PROJECT = `panelx-case-${String(caseNumber)}`
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: PROJECT, title: 'Mole Office' })
  for (const [handle, title] of [
    ['builder-x', 'Builder X'],
    ['checker-y', 'Checker Y'],
  ] as const) {
    t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'agent',
      title,
      data: { handle: handleFor(handle), runtime: 'claude-code', state: 'active', workArea: ['src'] },
      actor: HUMAN,
    })
  }
  const idOf = (handle: string): string =>
    (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handleFor(handle)) as { id: string }).id
  BUILDER = { kind: 'agent', id: idOf('builder-x') }
  CHECKER = { kind: 'agent', id: idOf('checker-y') }
  buildersRun = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: 'Builder X — the gripper',
    data: { state: 'running', runtime: 'claude-code' },
    actor: AS_BUILDER,
  }).id
  checkersRun = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: 'Checker Y — the gripper',
    data: { state: 'running', runtime: 'claude-code' },
    actor: AS_CHECKER,
  }).id
  theModule = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'module',
    title: 'The gripper module',
    data: {},
    actor: HUMAN,
  }).id
})

/** A CASE PUTS THE MACHINE PROBE BACK. A later case must read the real machine, not this case's stand-in. */
afterEach(() => {
  ledger.useOsProbe(theProbeAtTheStart)
})

afterAll(() => {
  t.close()
})

/** One claim, filed the way an agent files one. */
function claim(
  who: ParticipantRef,
  run: string,
  things: { what: 'record' | 'path'; id: string }[],
  actor: typeof HUMAN | typeof AS_BUILDER | typeof AS_CHECKER,
) {
  return work.fileAClaim({ workspaceId: PROJECT, claimant: who, run, things }, actor)
}

// ============================================================ what a claim names

describe('an agent says what it is working on', () => {
  it('files a claim naming a record and a folder, and reads it back live', () => {
    const filed = claim(
      BUILDER,
      buildersRun,
      [
        { what: 'record', id: theModule },
        { what: 'path', id: 'src/server/lib' },
      ],
      AS_BUILDER,
    )
    expect(filed.claim.state).toBe('live')
    expect(filed.claim.things).toHaveLength(2)
    expect(filed.claim.claimant).toEqual(BUILDER)
    expect(work.liveClaimsIn(PROJECT).map((one) => one.id)).toEqual([filed.claim.id])
    expect(work.liveClaimsOnRecord(theModule, PROJECT).map((one) => one.id)).toEqual([filed.claim.id])
  })

  it('refuses a claim that names nothing, and one whose run this project does not hold', () => {
    const empty = expectPanelError(t, () => claim(BUILDER, buildersRun, [], AS_BUILDER), 400)
    expect(empty.message).toContain('names nothing')
    const noRun = expectPanelError(
      t,
      () => claim(BUILDER, 'norunatallxy', [{ what: 'record', id: theModule }], AS_BUILDER),
      400,
    )
    expect(noRun.message).toContain('norunatallxy')
  })

  it('reads a folder as covering what is under it, and never a record as covering a path', () => {
    expect(thingsOverlap({ what: 'path', id: 'src/web' }, { what: 'path', id: 'src/web/App.tsx' })).toBe(true)
    // WHOLE SEGMENTS ONLY. `src/web` does not cover `src/webhooks.ts`, which is the near miss
    // `pathCovers` in shared/paths.ts exists to get right in one place.
    expect(thingsOverlap({ what: 'path', id: 'src/web' }, { what: 'path', id: 'src/webhooks.ts' })).toBe(false)
    expect(thingsOverlap({ what: 'record', id: 'a' }, { what: 'path', id: 'a' })).toBe(false)
  })
})

// ============================================================ the lease

describe('a lease ends when its run ends', () => {
  /**
   * WHAT THIS CASE USED TO SAY, AND WHY IT SAYS SOMETHING ELSE NOW.
   *
   * It used to be called *ends when the session record says the run finished*, and it patched the
   * run to `state: finished` and expected the claim to read "the run ended".
   *
   * Criterion C29 makes that wrong: a worker is not closed once it reports, but is in the inspecting
   * state after it reports. A run saying its work is finished is the worker's own word and not
   * the end: the run enters `inspecting` and stays a live run, its worktree kept and nothing about
   * it removed, until a check and then its supervisor say otherwise. A claim held by such a run is
   * held by a run that is still going, so the thing it claims is not free.
   *
   * BOTH HALVES OF THE OLD CASE ARE KEPT. A run that has really ended still ends its claim, and
   * `crashed` is the word for one that ended without finishing — it is in TERMINAL_STATES and it is
   * not a finish, so no standing keeps it alive.
   */
  it('keeps the claim live while the run is being checked, and ends it when the run really ended', () => {
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    expect(work.theClaimOrARefusal(filed.claim.id, PROJECT).state).toBe('live')
    // THE WORKER'S OWN WORD. Criterion C29: this is `inspecting`, and a run being checked is live.
    t.api.patchRecord(buildersRun, { dataPatch: { state: 'finished' } }, AS_BUILDER)
    expect(work.theClaimOrARefusal(filed.claim.id, PROJECT).state).toBe('live')
    expect(work.liveClaimsIn(PROJECT)).toHaveLength(1)
    // AND A RUN THAT REALLY ENDED. Nothing about C29 keeps a crashed run's claim open.
    t.api.patchRecord(buildersRun, { dataPatch: { state: 'crashed' } }, AS_BUILDER)
    const after = work.theClaimOrARefusal(filed.claim.id, PROJECT)
    expect(after.state).toBe('the run ended')
    expect(work.liveClaimsIn(PROJECT)).toEqual([])
  })

  it('says the session record is the weak input when no process was registered for the run', () => {
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    const read = work.theClaimOrARefusal(filed.claim.id, PROJECT)
    expect(read.from).toBe('the session record')
    expect(work.howItStands(read)).toContain('Nothing was registered for this run')
  })

  it('ends when the registered process is gone, whatever the session record still says', () => {
    // A PROCESS THAT REALLY IS ALIVE, registered the way GROUND's G5 asks: this test process itself.
    // The ledger is then the strong input and the record's word is not consulted.
    ledger.registerResource({
      workspaceId: PROJECT,
      sessionRecordId: buildersRun,
      type: 'process',
      key: String(process.pid),
      actor: AS_BUILDER,
    })
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    const live = work.theClaimOrARefusal(filed.claim.id, PROJECT)
    expect(live.state).toBe('live')
    expect(live.from).toBe('the ledger')

    // AND A PROCESS NUMBER NOTHING IS RUNNING UNDER. The record still says `running`, so a reader
    // that trusted the record would call this claim live; the ledger says otherwise and wins.
    const gone = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'session',
      title: 'Checker Y — a run that is over',
      data: { state: 'running', runtime: 'claude-code' },
      actor: AS_CHECKER,
    }).id
    t.client.sqlite
      .prepare(
        'INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, ' +
          "detail, registered_at, registered_by, released_at, released_by, release_note, world, started_by_the_product) " +
          "VALUES ('deadprocess1', '" + PROJECT + "', ?, 'process', '2147483641', NULL, NULL, 'a run whose process is gone', " +
          "'2026-09-04 07:00:00', 'agent:checker-y', NULL, NULL, NULL, NULL, NULL)",
      )
      .run(gone)
    const second = claim(CHECKER, gone, [{ what: 'path', id: 'src/worker' }], AS_CHECKER)
    const dead = work.theClaimOrARefusal(second.claim.id, PROJECT)
    expect(dead.state).toBe('the run ended')
    expect(dead.from).toBe('the ledger')
  })

  /**
   * C1 (Error) and C2 (thrown string), wNjQEfclwxjJ, lBw2WAGMOKwF, UQQeEtGCHiRn;
   * USER.md invariants 2 and 5.
   * Mutation: remove processLivenessForRun's catch; claimsIn refuses rather than answering.
   * Mutation: ignore unknown in howTheRunStands; C1 and C2 incorrectly end their claims.
   * Mutation: answer unknown as the ledger; C1 and C2 falsely say the process is alive.
   */
  it.each(['an Error', 'a thrown string'])('reads a claim on its own and keeps it held when its process throws %s', (thrown) => {
    const probe: ResourcesLib['LINUX_PROBE'] = Object.create(ledger.LINUX_PROBE)
    probe.processById = (pid) => pid === 505
      ? { pid, pgid: pid, ppid: 1, command: 'synthetic claim process', startedAt: '2026-09-30 11:00:00' }
      : null
    ledger.useOsProbe(probe)
    ledger.registerResource({ workspaceId: PROJECT, sessionRecordId: buildersRun, type: 'process', key: '505', actor: AS_BUILDER })
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    const error = 'Synthetic /proc/505/stat could not be read: permission denied.'
    probe.processById = () => { throw thrown === 'an Error' ? new Error(error) : error }

    const read = one(work.claimsIn(PROJECT), 'the held claim with an unreadable process')
    expect(read).toMatchObject({ id: filed.claim.id, state: 'live', from: 'a process that could not be checked', releasedAt: null, releasedBecause: null })
    expect(ledger.processLivenessForRun(buildersRun, PROJECT)).toEqual([{ state: 'unknown', reason: error }])
    expect(work.howTheRunStands(buildersRun, PROJECT)).toEqual({ state: 'live', from: 'a process that could not be checked', running: true })
    expectUncheckedProcessWords(read)
    // The permissive reading belongs only to claims. Other callers still refuse the probe failure.
    expect(() => ledger.listResources({ workspaceId: PROJECT, sessionRecordId: buildersRun })).toThrow(error)
    expect(() => ledger.orphanReport(PROJECT)).toThrow(error)
  })

  /**
   * C3, wNjQEfclwxjJ; USER.md invariants 2 and 5.
   * Mutation: ignore unknown in howTheRunStands; C1–C3 incorrectly end their claims.
   * Mutation: answer unknown as the ledger; C3 falsely says the process is alive.
   */
  it('keeps a claim held when the process reading returns unknown without throwing', () => {
    const probe: ResourcesLib['LINUX_PROBE'] = Object.create(ledger.LINUX_PROBE)
    probe.processById = (pid) => pid === 505
      ? { pid, pgid: pid, ppid: 1, command: 'synthetic claim process', startedAt: '2026-09-30 11:00:00' }
      : null
    ledger.useOsProbe(probe)
    const row = ledger.registerResource({ workspaceId: PROJECT, sessionRecordId: buildersRun, type: 'process', key: '505', actor: AS_BUILDER })
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    t.client.sqlite.prepare('UPDATE session_resources SET os_started_at = NULL WHERE id = ?').run(row.id)

    const read = one(work.claimsIn(PROJECT), 'the held claim without a process start time')
    expect(read).toMatchObject({ id: filed.claim.id, state: 'live', from: 'a process that could not be checked', releasedAt: null })
    expect(ledger.processLivenessForRun(buildersRun, PROJECT)[0]?.state).toBe('unknown')
    expect(work.howTheRunStands(buildersRun, PROJECT)).toEqual({ state: 'live', from: 'a process that could not be checked', running: true })
    expectUncheckedProcessWords(read)
  })

  /**
   * wNjQEfclwxjJ; USER.md invariants 2 and 5.
   * Mutation: answer unknown before checking for alive; the confirmed live process loses precedence.
   * Mutation: remove processLivenessForRun's catch; filing the claim refuses the unreadable process.
   */
  it('answers from the ledger when one process is alive and another cannot be checked', () => {
    const probe: ResourcesLib['LINUX_PROBE'] = Object.create(ledger.LINUX_PROBE)
    probe.processById = (pid) => ({ pid, pgid: pid, ppid: 1, command: 'synthetic claim process', startedAt: '2026-09-30 11:00:00' })
    ledger.useOsProbe(probe)
    for (const key of ['505', '506']) {
      ledger.registerResource({ workspaceId: PROJECT, sessionRecordId: buildersRun, type: 'process', key, actor: AS_BUILDER })
    }
    const readable = probe.processById
    probe.processById = (pid) => {
      if (pid === 505) throw new Error('Synthetic /proc/505/stat could not be read: permission denied.')
      return readable(pid)
    }
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    expect(ledger.processLivenessForRun(buildersRun, PROJECT).map((one) => one.state).sort()).toEqual(['alive', 'unknown'])
    expect(work.howTheRunStands(buildersRun, PROJECT)).toEqual({ state: 'live', from: 'the ledger', running: true })
    expect(work.theClaimOrARefusal(filed.claim.id, PROJECT).from).toBe('the ledger')
  })

  it('is renewed by the run that made it, and by nobody else', () => {
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    expect(filed.claim.renewedAt).toBeNull()
    const renewed = work.renewAClaim(filed.claim.id, PROJECT, BUILDER)
    expect(renewed.renewedAt).not.toBeNull()
    const refused = expectPanelError(t, () => work.renewAClaim(filed.claim.id, PROJECT, CHECKER), 403)
    expect(refused.message).toBe(A_CLAIM_IS_THE_CLAIMANTS_OWN)
  })

  it('refuses to renew a claim whose run has ended', () => {
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    t.api.patchRecord(buildersRun, { dataPatch: { state: 'crashed' } }, AS_BUILDER)
    const refused = expectPanelError(t, () => work.renewAClaim(filed.claim.id, PROJECT, BUILDER), 409)
    expect(refused.message).toBe(THAT_CLAIM_HAS_ENDED)
  })

  it('is released by whoever made it, and the row is kept', () => {
    const filed = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    const released = work.releaseAClaim(filed.claim.id, PROJECT, BUILDER, 'The fit is done.')
    expect(released.state).toBe('released')
    expect(released.releasedBecause).toBe('The fit is done.')
    expect(work.claimsIn(PROJECT).map((one) => one.id)).toEqual([filed.claim.id])
    expect(work.liveClaimsIn(PROJECT)).toEqual([])
  })
})

// ============================================================ overlap opens a group

describe('two claims on the same thing open a group with the owner in it', () => {
  /** The second agent reaching for the same module the first already claimed. */
  function bothOnTheModule() {
    const first = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    const second = claim(CHECKER, checkersRun, [{ what: 'record', id: theModule }], AS_CHECKER)
    return { first, second }
  }

  it('opens one group with three members, without anybody asking', () => {
    const { second } = bothOnTheModule()
    expect(second.groups).toHaveLength(1)
    const group = team.theGroupOrARefusal(second.groups[0] ?? '', pool.EVERY_PROJECT)
    expect(group.members.map((one) => participantKey(one.who)).sort()).toEqual(
      [participantKey(BUILDER), participantKey(CHECKER), participantKey(OWNER)].sort(),
    )
    // OPENED BY MOLE OFFICE ITSELF, because nobody asked for it. A group opened by one of the two
    // agents would read as that agent calling the other out.
    expect(isMoleOffice(group.openedBy)).toBe(true)
  })

  it('writes one system line naming the overlap and both claims', () => {
    const { first, second } = bothOnTheModule()
    const said = pool.messagesInAGroup(second.groups[0] ?? '', pool.EVERY_PROJECT)
    // ONE LINE, NO HOVER SENTENCE. The rule: the line names the thing both
    // claims cover and both claimants, and nothing else.
    const conflict = said.find((one) => one.body.startsWith('Overlap on '))
    expect(conflict).toBeDefined()
    expect(conflict?.sentBy).toEqual(moleOffice())
    expect(conflict?.body).toContain('The gripper module')
    expect(conflict?.body).toContain('builder-x')
    expect(conflict?.body).toContain('checker-y')
    expect(conflict?.saidInFull ?? null, 'the overlap line kept a hover sentence').toBeNull()
    // AND WHEN EACH CLAIMED IS ON ITS OWN MEMBERSHIP ROW, which the members panel draws. The claim
    // times used to be in the hover sentence; they moved to the row rather than being lost.
    const group = team.theGroupOrARefusal(second.groups[0] ?? '', pool.EVERY_PROJECT)
    const because = group.members.map((one) => one.joinedBecause).join(' | ')
    expect(because).toContain(`at ${first.claim.openedAt}`)
    expect(because).toContain(`at ${second.claim.openedAt}`)
  })

  it('opens no second group for the same overlap, however many times it is met', () => {
    const groupsBefore = team.groupsIn(pool.EVERY_PROJECT).length
    const { second } = bothOnTheModule()
    expect(team.groupsIn(pool.EVERY_PROJECT)).toHaveLength(groupsBefore + 1)
    // THE SAME TWO AGENTS AND THE SAME THING, FROM A NEW CLAIM. The checker lets its first claim go
    // and files another on the same module a moment later. The key is the participants and the
    // thing, not the claim ids, so the same argument finds the group that is already open.
    work.releaseAClaim(second.claim.id, PROJECT, CHECKER, 'Pausing on it for a moment.')
    const again = claim(
      CHECKER,
      checkersRun,
      [
        { what: 'record', id: theModule },
        { what: 'path', id: 'src/server/lib/claims.ts' },
      ],
      AS_CHECKER,
    )
    expect(again.groups).toHaveLength(0)
    expect(team.groupsIn(pool.EVERY_PROJECT)).toHaveLength(groupsBefore + 1)
    expect(work.overlapsIn(PROJECT).every((one) => one.groupId === (second.groups[0] ?? ''))).toBe(true)
    expect(work.overlapsIn(PROJECT)).toHaveLength(1)
  })

  it('hands back the group that is already open when the same overlap is met again', () => {
    // THE SECOND GUARD, ASKED DIRECTLY. The caller above skips an overlap that already has a group,
    // so this one is only reached when two claims are filed in the same moment and both see no
    // group yet. It is checked here because a race is not something a test can arrange, and the
    // third guard — the unique index below — is what catches the case where even this loses.
    const groupsBefore = team.groupsIn(pool.EVERY_PROJECT).length
    const { second } = bothOnTheModule()
    const overlap = work.overlapsIn(PROJECT)[0]
    expect(overlap).toBeDefined()
    if (overlap === undefined) return
    const again = work.openTheGroupForAnOverlap(overlap, PROJECT, AS_CHECKER)
    expect(again).toBe(second.groups[0])
    expect(team.groupsIn(pool.EVERY_PROJECT)).toHaveLength(groupsBefore + 1)
  })

  it('refuses a second group for the same overlap at the database too', () => {
    const { second } = bothOnTheModule()
    const key = overlapKey(BUILDER, CHECKER, { what: 'record', id: theModule })
    expect(team.groupOpenedFor(key)?.id).toBe(second.groups[0])
    expect(() =>
      t.client.sqlite
        .prepare(
          'INSERT INTO groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at, ' +
            "about) VALUES ('secondgroup1', '" + PROJECT + "', 'A second one', 'agent', 'mole-office', 'By hand.', " +
            "'2026-09-04 08:00:00', ?)",
        )
        .run(key),
    ).toThrow(/UNIQUE/)
  })

  it('opens a group when two claims name the same folder from different sides', () => {
    claim(BUILDER, buildersRun, [{ what: 'path', id: 'src/server/lib' }], AS_BUILDER)
    const second = claim(CHECKER, checkersRun, [{ what: 'path', id: 'src/server/lib/claims.ts' }], AS_CHECKER)
    expect(second.groups).toHaveLength(1)
    const said = pool.messagesInAGroup(second.groups[0] ?? '', pool.EVERY_PROJECT)
    // THE PATH BOTH CLAIMS COVER IS IN THE SENTENCE, criterion M34, not in the few words the block
    // draws. The group's own name still carries it too.
    expect(said.some((one) => (one.saidInFull ?? '').includes('src/server/lib'))).toBe(true)
  })

  it('opens nothing when one agent claims the same thing twice', () => {
    const groupsBefore = team.groupsIn(pool.EVERY_PROJECT).length
    claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    const again = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    expect(again.groups).toEqual([])
    expect(team.groupsIn(pool.EVERY_PROJECT)).toHaveLength(groupsBefore)
    expect(work.overlapsIn(PROJECT)).toEqual([])
  })

  it('opens nothing when the first claim is no longer live', () => {
    const first = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    work.releaseAClaim(first.claim.id, PROJECT, BUILDER, 'Finished with it.')
    const second = claim(CHECKER, checkersRun, [{ what: 'record', id: theModule }], AS_CHECKER)
    expect(second.groups).toEqual([])
    expect(work.overlapsIn(PROJECT)).toEqual([])
  })

  it('names the conflict on the record both claims are about', () => {
    bothOnTheModule()
    const here = work.overlapsOnRecord(theModule, PROJECT)
    expect(here).toHaveLength(1)
    expect(here[0]?.groupId).not.toBeNull()
    expect(work.liveClaimsOnRecord(theModule, PROJECT)).toHaveLength(2)
  })
})

/**
 * F2 OF PROBLEM DrX8P0fYGmx8: A RUN THAT ENDS RELEASES THE CLAIMS IT HELD IN THE SAME ACT, through
 * the one place a session's state is written, and not through `releaseAClaim` — a run saying it
 * finished must not retire the agents P15 waits for.
 *
 * MUTATION that turns this red, after a control run: remove the `endTheClaimsOfARun` call from the
 * transition block in src/server/lib/records.ts, and the crashed case reads `the run ended` with no
 * `released_at` set and no group line.
 */
describe('a run that ends releases its claims in the same act', () => {
  it('ends a crashed run\'s claim, and tells the group once', () => {
    const first = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    const second = claim(CHECKER, checkersRun, [{ what: 'record', id: theModule }], AS_CHECKER)
    const group = second.groups[0] ?? ''
    t.api.patchRecord(buildersRun, { dataPatch: { state: 'crashed' } }, AS_BUILDER)
    // THE ROW MOVED, because the transition ended it...
    const row = t.client.sqlite
      .prepare('SELECT released_at, released_because FROM work_claims WHERE id = ?')
      .get(first.claim.id) as { released_at: string | null; released_because: string | null } | undefined
    expect(row?.released_at, 'the crashed run did not end its claim in the same act').not.toBeNull()
    expect(row?.released_because, 'the ended claim does not say why').toContain('run')
    // ...AND NOBODY RELEASED IT, so the word a reader sees is the run's end, not `released`.
    expect(work.theClaimOrARefusal(first.claim.id, PROJECT).state).toBe('the run ended')
    const ended = pool
      .messagesInAGroup(group, pool.EVERY_PROJECT)
      .filter((one) => one.body.startsWith(THE_OVERLAP_ENDED_PREFIX))
    expect(ended).toHaveLength(1)
    expect(ended[0]?.body).toContain('run ended')
    expect(ended[0]?.saidInFull ?? null, 'the ended-overlap line kept a hover sentence').toBeNull()
    expect(ended[0]?.sentBy).toEqual(moleOffice())
  })
})

/**
 * F3 OF PROBLEM DrX8P0fYGmx8: A NEW CLAIM OPENS NO GROUP AGAINST A CLAIM WHOSE RUN IS NOT RUNNING,
 * and the caller is told which claim and run it met instead.
 *
 * MUTATION that turns this red, after a control run: take the `running` guard out of
 * `openTheGroupsForANewClaimAndSayWhy` in src/server/lib/claims.ts, and the being-checked case opens
 * a group and returns no notice.
 */
describe('a new claim leaves a run being checked alone', () => {
  it('opens no group against a claim whose run is being checked, and tells the caller why', () => {
    const groupsBefore = team.groupsIn(pool.EVERY_PROJECT).length
    const first = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    // THE BUILDER'S RUN SAYS IT FINISHED. C29 keeps the claim live, and the run is not running.
    t.api.patchRecord(buildersRun, { dataPatch: { state: 'finished' } }, AS_BUILDER)
    expect(work.liveClaimsIn(PROJECT)).toHaveLength(1)
    const second = claim(CHECKER, checkersRun, [{ what: 'record', id: theModule }], AS_CHECKER)
    expect(second.groups).toEqual([])
    expect(team.groupsIn(pool.EVERY_PROJECT)).toHaveLength(groupsBefore)
    expect(second.heldForACheck).toHaveLength(1)
    expect(second.heldForACheck[0]?.claim).toBe(first.claim.id)
    expect(second.heldForACheck[0]?.run).toBe(buildersRun)
    expect(second.heldForACheck[0]?.says).toContain('waiting for a check')
    // BOTH CLAIMS ARE STILL LIVE: a run being checked still holds what it named.
    expect(work.liveClaimsIn(PROJECT)).toHaveLength(2)
    expect(work.overlapsIn(PROJECT)).toHaveLength(1)
  })
})

/**
 * F5 OF PROBLEM DrX8P0fYGmx8: WHEN THE OVERLAP A GROUP WAS OPENED FOR HAS ENDED, the office writes
 * one line into that group saying why, and writes no second line when the other claim ends too.
 *
 * MUTATION that turns this red, after a control run: take the `sayTheOverlapEndedIn` calls out of
 * `releaseAClaim`, and the author case has no line.
 */
describe('a group whose overlap has ended is told why', () => {
  it('says the overlap ended when the author releases a claim, and writes no second line', () => {
    const first = claim(BUILDER, buildersRun, [{ what: 'record', id: theModule }], AS_BUILDER)
    const second = claim(CHECKER, checkersRun, [{ what: 'record', id: theModule }], AS_CHECKER)
    const group = second.groups[0] ?? ''
    work.releaseAClaim(first.claim.id, PROJECT, BUILDER, 'The fit is done.')
    const after = pool
      .messagesInAGroup(group, pool.EVERY_PROJECT)
      .filter((one) => one.body.startsWith(THE_OVERLAP_ENDED_PREFIX))
    expect(after).toHaveLength(1)
    expect(after[0]?.body).toContain('claim released')
    // AND THE SECOND CLAIM ENDING DOES NOT WRITE A SECOND LINE FOR THE SAME OVERLAP.
    work.releaseAClaim(second.claim.id, PROJECT, CHECKER, 'Me too.')
    const still = pool
      .messagesInAGroup(group, pool.EVERY_PROJECT)
      .filter((one) => one.body.startsWith(THE_OVERLAP_ENDED_PREFIX))
    expect(still).toHaveLength(1)
  })
})
