// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPEN BAG IS READ BY ITS WRITER'S OWN TYPE, OR IT BLOCKS (item 30c, part 2b-5a). kinds.ts declares some fields as
 * `Record<string, unknown>`, and the office writes a fixed shape into each one. The identity reader reads such a bag by
 * an adapter: the writer's type, written in the declared type language. Where the writer has a strict reader of its
 * own, that reader decides instead. A key that no adapter declares blocks at its own path, and a bag with no adapter
 * blocks whole.
 *
 * Every agent, alias and value here is made up, in a throwaway office.
 *
 * MUTATIONS, after a control run: drop the adapter of the routed entries, and the first case goes red. Read the
 * opener in a run's extra bag without its type beside it, and the second case goes red. Read a counter's action as a
 * ParticipantRef list without its variant, and the third case goes red. Let a key no adapter declares through, and
 * the fourth case goes red. Leave the open bag a change row goes into unread, and the fifth case goes red.
 *
 * The opener is read as a stamp behind its type, and the fixture's alias is also a live agent's handle, so it blocks as
 * one that two agents answer to. In identity-positions.ts, give SessionOpenedBy.id back its actor-pair parse, and the
 * second and fourth cases go red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SHAPE_SPECS, type DeclaredType, type FieldSpec } from '../src/shared/kinds.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t); await fileSyntheticAlias(t) })
afterEach(() => t?.close())

const reader = () => import('../src/server/lib/registry-aliases/historical-reader.ts')
const alias = syntheticAlias.aliasId
const canonical = syntheticAlias.canonicalId
const other = 'CanonicalB2'
const agentRef = (id: string) => ({ kind: 'agent', id })
const at = '2026-01-01 00:00:00'
const found = (path: string, stored: string, site: string, parse = 'participant') =>
  ({ path, as: 'value', stored, canonical: stored === alias ? canonical : stored, site, parse })
const read = async (kind: string, data: unknown) => (await reader()).readRecordIdentities(t.client.sqlite, kind, data)
const blocksOf = (reading: { blocks: { path: string; reason: string }[] }) => reading.blocks.map(one => [one.path, one.reason])

function holdsAnOpenBag(node: DeclaredType): boolean {
  if (node.kind === 'open') return true
  if (node.kind === 'array') return holdsAnOpenBag(node.of)
  if (node.kind === 'either') return node.options.some(option => holdsAnOpenBag(option.node))
  return false
}
const castingRoll = () => (SHAPE_SPECS['WorkerRun']!.fields.find(field => field.key === 'castingRoll') as FieldSpec).example

describe('the open bags a message holds', () => {
  it('reads identity references in each ownership route without blocking its explanation', async () => {
    const { NO_REACHABLE_OWNER_ENDING, PERSON_OWNER_ROUTING_ENDING, OWNERLESS_ROUTING_ENDING, BROKEN_OWNERS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    const endings = [
      { how: NO_REACHABLE_OWNER_ENDING }, { how: PERSON_OWNER_ROUTING_ENDING },
      { how: OWNERLESS_ROUTING_ENDING }, { how: BROKEN_OWNERS_ROUTING_ENDING, stoppedAt: 'A test owner' },
      { how: 'an owner', reached: 'A test owner' },
      { how: 'an owner whose reach is uncertain', reached: 'A test owner' },
      { how: 'an owner waiting', reached: 'A test owner' }, { how: 'the owner sent it' },
    ]
    for (const ending of endings) {
      const data = { routed: [{ for: agentRef(alias), because: 'Synthetic reason', to: null, passedOver: [], line: 'Synthetic line', said: { addressee: 'Synthetic addressee', was: 'nothing answering', passedOver: [], ending } }] }
      const result = await read('message', data)
      expect(result.found).toEqual([found('data.routed[0].for.id', alias, 'RoutedAddressee.for')])
      expect(result.blocks, ending.how).toEqual([])
    }
  })

  it('reads the routed entries, the carries, the ask to resolve, the edit mark, the reminder and the summons', async () => {
    const data = {
      routed: [
        {
          for: agentRef(alias), because: 'Synthetic reason', to: agentRef(other), passedOver: [{ who: agentRef(alias), because: 'Synthetic rung' }], line: 'Synthetic line',
          said: { addressee: 'Synthetic name', was: 'retired', passedOver: [{ name: 'Synthetic rung', was: 'nothing answering' }], ending: { how: 'the owner is the sender', ending: { how: 'nobody started', owner: 'Synthetic owner', stoppedAt: 'Synthetic rung' } }, sweptAt: at },
          inSummary: 'SyntheticMessage1',
        },
        { for: agentRef(other), because: 'Synthetic reason', to: null, passedOver: [], line: 'Synthetic line', said: { addressee: 'Synthetic name', was: 'nothing answering', passedOver: [], ending: { how: 'the sender' } } },
      ],
      carriedTo: [{ from: alias, fromHandle: 'synthetic-old', to: other, toHandle: 'synthetic-new', copy: null, at }],
      askedToResolve: { entry: 'SyntheticEntry', files: ['src/synthetic.ts'], brief: null, agent: alias, until: '2026-01-01T00:00:00.000Z' },
      edited: { at, by: agentRef(alias), original: { title: null, body: 'Synthetic words' } },
      extra: { backAsYouAsked: { remindAt: at, from: agentRef(alias) } },
      summons: { who: 'Synthetic secretary', urgency: 'now', title: 'Synthetic title' },
    }
    const copy = structuredClone(data), before = rawHistory(t)
    expect(await read('message', data)).toEqual({
      found: [
        found('data.routed[0].for.id', alias, 'RoutedAddressee.for'),
        found('data.routed[0].to.id', other, 'RoutedAddressee.to'),
        found('data.routed[0].passedOver[0].who.id', alias, 'RoutedPassedOver.who'),
        found('data.routed[1].for.id', other, 'RoutedAddressee.for'),
        found('data.carriedTo[0].from', alias, 'CarriedTo.from', 'registry-id'),
        found('data.carriedTo[0].to', other, 'CarriedTo.to', 'registry-id'),
        found('data.askedToResolve.agent', alias, 'AskedToResolveMessage.agent', 'registry-id'),
        found('data.edited.by.id', alias, 'MessageEdited.by'),
        found('data.extra.backAsYouAsked.from.id', alias, 'BackAsYouAsked.from'),
      ],
      blocks: [],
    })
    expect(data).toEqual(copy)
    expect(rawHistory(t)).toEqual(before)
    expect(await read('message', { askedToResolve: { entry: 'SyntheticEntry', files: [], red: ['tests/synthetic.test.ts'], brief: null, agent: null, until: at } })).toEqual({ found: [], blocks: [] })
  })
})

describe('the open bags a run holds', () => {
  it('reads the pause, the resume, the opener by its type, and the casting rolls by their own reader', async () => {
    const time = { stamp: at, instant: '2026-01-01T00:00:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' }
    const opener = (type?: string) => ({ ...(type === undefined ? {} : { type }), id: alias, underTheGrant: 'SyntheticGrant' })
    const data = {
      paused: { at, time, by: agentRef(alias), because: 'Synthetic shutdown' },
      resume: { askedBy: agentRef(alias), askedAt: at, startedAs: 'SyntheticRun', startedAt: at, failed: null },
      castingRoll: castingRoll(),
      extra: { openedBy: opener('agent') },
      workerRuns: { [other]: { state: 'wanted', castingRoll: castingRoll() } },
    }
    expect(await read('session', data)).toEqual({
      found: [
        found('data.paused.by.id', alias, 'SessionPaused.by'),
        found('data.resume.askedBy.id', alias, 'SessionResume.askedBy'),
        { path: `data.workerRuns.${other}`, as: 'key', stored: other, canonical: other, site: 'session.workerRuns', parse: 'map-key' },
      ],
      blocks: [{ path: 'data.extra.openedBy.id', reason: 'cannot-tell', why: expect.any(String) }],
    })
    expect(await read('session', { extra: { openedBy: opener('human') } })).toEqual({ found: [], blocks: [] })
    expect(blocksOf(await read('session', { extra: { openedBy: opener() } }))).toEqual([['data.extra.openedBy.id', 'no-writer-kind']])
    expect(await read('session', { resume: { askedBy: null, askedAt: null, failed: 'Synthetic failure' }, paused: { at, time, by: null, because: 'Synthetic' } })).toEqual({ found: [], blocks: [] })
    const roll = await read('session', { castingRoll: { row: agentRef(alias) } })
    expect(roll.found).toEqual([])
    expect(blocksOf(roll)).toEqual([['data.castingRoll', 'wrong-type']])
  })
})

describe('the open bags of a counter, a secretary\'s duties, an agent, a seal and an emergency push', () => {
  it('reads each by its writer\'s type and its variant', async () => {
    expect(await read('counter', {
      createdBy: agentRef(alias), mayAdd: { anyone: false, who: [agentRef(alias)] },
      follows: [{ event: 'landing', lane: '/srv/synthetic', paths: ['src/'] }, { event: 'group-message', group: 'SyntheticGroup' }],
      triggers: [{ kind: 'count', n: 3 }, { kind: 'quiet', condition: 'merge-lane-idle', lane: '/srv/synthetic', minutes: 5 }, { kind: 'every', hours: 12, from: at }],
      action: { kind: 'message', to: [agentRef(other)] }, pause: { at, by: agentRef(alias), because: 'Synthetic pause' },
    })).toEqual({
      found: [
        found('data.createdBy.id', alias, 'counter.createdBy'),
        found('data.mayAdd.who[0].id', alias, 'WhoMayAdd.who'),
        found('data.action.to[0].id', other, 'CounterAction(message).to'),
        found('data.pause.by.id', alias, 'CounterPause.by'),
      ],
      blocks: [],
    })
    expect(await read('counter', { action: { kind: 'message', group: 'SyntheticGroup' } })).toEqual({ found: [], blocks: [] })
    expect(await read('counter', { action: { kind: 'job', job: 'synthetic.job' } })).toEqual({ found: [], blocks: [] })
    expect(await read('secretary_duties', { supervisors: [{ agent: agentRef(alias), area: 'Synthetic area' }] })).toEqual({
      found: [found('data.supervisors[0].agent.id', alias, 'SupervisorAnswered.agent')], blocks: [],
    })
    expect(await read('agent', { filesArea: [{ written: '/srv/synthetic', resolved: '/srv/synthetic' }] })).toEqual({ found: [], blocks: [] })
    expect(await read('sealed_tip', { starterNotice: { to: agentRef(alias) } })).toEqual({ found: [found('data.starterNotice.to.id', alias, 'TheStarterNotice.to')], blocks: [] })
    expect(await read('sealed_tip', { starterNotice: { because: 'Synthetic reason' } })).toEqual({ found: [], blocks: [] })
    expect(await read('emergency_push', {
      by: agentRef(alias), line: agentRef(other), message: { id: 'SyntheticMessage', seq: 1, contentHash: '0123456789abcdef' },
      ended: { at, mainAfter: 'abc123', says: 'Synthetic end', onward: { ok: true, says: 'Synthetic onward' } },
    })).toEqual({ found: [found('data.by.id', alias, 'emergency_push.by'), found('data.line.id', other, 'emergency_push.line')], blocks: [] })
    expect(await read('emergency_push', { line: null, ended: null })).toEqual({ found: [], blocks: [] })
  })
})

describe('what no adapter reads', () => {
  it('blocks a key no adapter declares at its own path, an unknown variant at its tag, and a bag with no adapter whole', async () => {
    const routed = await read('message', { routed: [{ for: agentRef(alias), because: 'x', to: null, passedOver: [], line: 'x', agentId: alias }] })
    expect(routed.found).toEqual([found('data.routed[0].for.id', alias, 'RoutedAddressee.for')])
    expect(blocksOf(routed)).toEqual([['data.routed[0].agentId', 'undeclared-field']])
    const extra = await read('session', { extra: { runKeyId: 'SyntheticKey', openedBy: { type: 'agent', id: alias } } })
    expect(extra.found).toEqual([])
    expect(blocksOf(extra)).toEqual([['data.extra.runKeyId', 'open-bag'], ['data.extra.openedBy.id', 'cannot-tell']])
    const action = await read('counter', { action: { kind: 'meeting', to: [agentRef(alias)] } })
    expect(action.found).toEqual([])
    expect(blocksOf(action)).toEqual([['data.action.kind', 'unknown-variant']])
    const nothing = async (kind: string, data: unknown) => {
      const reading = await read(kind, data)
      expect(reading.found, JSON.stringify(data)).toEqual([])
      return blocksOf(reading)
    }
    expect(await nothing('task', { extra: { anything: agentRef(alias) } })).toEqual([['data.extra', 'open-bag']])
    expect(await nothing('session', { submission: { entry: alias } })).toEqual([['data.submission', 'open-bag']])
    expect(await nothing('message', { summons: { who: 'x', urgency: 'later', title: 'x' } })).toEqual([['data.summons.urgency', 'wrong-type']])
    expect(await nothing('emergency_push', { message: { id: 'SyntheticMessage', seq: 2, contentHash: '0123456789abcdef' } })).toEqual([['data.message', 'wrong-type']])
  })
})

describe('a change row that goes into an open bag', () => {
  it('is typed through the bag\'s adapter, and blocks where only the writer\'s reader can read the bag', async () => {
    const { readChangeIdentities } = await reader()
    const change = (kind: string, field: string, newValue: string) => readChangeIdentities(t.client.sqlite, { kind }, { field, oldValue: null, newValue })
    expect(change('message', 'data.askedToResolve.agent', alias)).toEqual({ found: [found('new_value:data.askedToResolve.agent', alias, 'AskedToResolveMessage.agent', 'registry-id')], blocks: [] })
    expect(change('message', 'data.routed', JSON.stringify([{ for: agentRef(alias), because: 'x', to: null, passedOver: [], line: 'x' }]))).toEqual({
      found: [found('new_value:data.routed[0].for.id', alias, 'RoutedAddressee.for')], blocks: [],
    })
    expect(change('counter', 'data.pause.by', JSON.stringify(agentRef(alias)))).toEqual({ found: [found('new_value:data.pause.by.id', alias, 'CounterPause.by')], blocks: [] })
    expect(blocksOf(change('session', 'data.extra.openedBy.id', alias))).toEqual([['new_value:data.extra.openedBy.id', 'no-writer-kind']])
    expect(blocksOf(change('session', 'data.extra.runKeyId', 'SyntheticKey'))).toEqual([['field', 'open-bag']])
    expect(blocksOf(change('session', 'data.castingRoll.keptFrom', 'SyntheticRun'))).toEqual([['field', 'untyped-change']])
    expect(blocksOf(change('session', 'data.submission.entry', alias))).toEqual([['field', 'open-bag']])
  })
})

