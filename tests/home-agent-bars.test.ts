// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, decisions OQR0WDVq0FkP and M1ngfatGQcwn, F2): a roster row carries
// doingFrom, the run serving its agent, and a bar takes no doing reading.
// Home reads the serving run from the roster's rows, so an agent is stuck when its row names a run that an alarm
// names. A project with no alarm on a run is counted with nothing more, and the readings that can fail are the
// roster, the waiting list and the attention.
// Before, a bar took a fourth reading, the runs serving the agents, which could be loading or fail on its own.
/**
 * AGENTS AT WORK, AS BARS. One bar per project, split into working, waiting on you and stuck, with the number
 * at the bar's end, and a key below the bars. Each count comes from a reading Home already makes:
 *
 *   waiting on you  an active agent of the project's roster that the waiting list names;
 *   stuck           any other agent of the roster whose serving run is one of the project's late or stuck alarms;
 *   working         any other agent of the roster that is online or stale.
 *
 * The number at the end is the sum of the three. A project with no agent draws its name and nothing beside it. A
 * count whose reading did not answer is said in words and never drawn as zero.
 *
 * The heading counts each agent once, however many projects' rosters hold it: one agent may stand on the
 * rosters of two projects, each through an agent record of that project, and both records are the same agent.
 * Each bar still counts its own roster.
 *
 * The runner's environment is node, so the bars are rendered to static markup, with a window stand-in
 * installed before anything that reads it is loaded, as tests/home-bands.test.ts does.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { count, t } from '../src/shared/i18n.ts'

type Bars = typeof import('../src/web/components/home/HomeAgentBars.tsx')
let bars: Bars

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  bars = await import('../src/web/components/home/HomeAgentBars.tsx')
})

type Presence = 'online' | 'stale' | 'offline' | 'inactive'
function agent(id: string, presence: Presence, doingFrom: string | null = null) {
  return { agentId: `made-up-agent-record-${id}`, participant: { id: `made-up-participant-${id}`, name: `Made-up agent ${id}`, startedBy: null }, presence: { presence }, doingFrom }
}
const ready = <T,>(value: T) => ({ status: 'ready' as const, value })
const failed = { status: 'error' as const, message: 'made-up failure' }
const loading = { status: 'loading' as const }

function roster(rows: ReturnType<typeof agent>[]) {
  return ready({ workspaceId: 'made-up-project', computedAt: '2026-11-13 09:00:00', rows, counts: { agents: rows.length, active: rows.length, retired: 0 }, note: '' })
}
function waitingFrom(...participants: string[]) {
  return ready({ items: participants.map((id, n) => ({ id: `made-up-waiting-${String(n)}`, fromAgent: { answer: 'an-agent', agentId: `made-up-participant-${id}` } })) })
}
/** An alarm on a run: the run stopped short, which Home's Late or stuck draws. */
function runAlarm(runId: string) {
  return {
    key: `made-up-alarm-${runId}`, shape: 'record', recordId: runId, recordKind: 'session', title: 'Made-up run', state: 'failed', progress: 'stopped_short',
    reason: { owed: null, stoppedShort: { state: 'failed' }, pauseElapsed: null, safetyFloor: false }, safety: false, origin: null,
  }
}
function attention(...rows: ReturnType<typeof runAlarm>[]) {
  return ready({ alarms: { sessionIds: rows.map((row) => row.recordId) } })
}

/** One working, one waiting on you, one stuck, and one offline that is in none of the three. */
const THREE = {
  roster: roster([agent('a', 'online', 'made-up-run-a'), agent('b', 'online'), agent('c', 'stale', 'made-up-run-c'), agent('d', 'offline')]),
  waiting: waitingFrom('b'),
  attention: attention(runAlarm('made-up-run-c')),
}

/** The agents THREE counts, each by its participant: the offline one is in none of the three parts. */
const AT_WORK_IN_THREE = ['made-up-participant-a', 'made-up-participant-b', 'made-up-participant-c']

/** The markup of one project's bar, from its opening mark to the end of its row. */
function barOf(html: string, project: string): string {
  const start = html.indexOf(`data-home-bar="${project}"`)
  expect(start, `no bar for ${project}`).toBeGreaterThanOrEqual(0)
  return html.slice(start, html.indexOf('</li>', start))
}

function draw(projects: { id: string; name: string; bar: ReturnType<Bars['theBarOf']> }[], cannotTell = 0): string {
  return renderToStaticMarkup(h(bars.HomeAgentBars, { projects, waitingCannotTell: cannotTell }))
}

describe('the counts', () => {
  it('counts 1 working, 1 waiting on you and 1 stuck, and ends the bar in 3', () => {
    expect(bars.theBarOf(THREE)).toEqual({ read: true, working: 1, waiting: 1, stuck: 1, total: 3, atWork: AT_WORK_IN_THREE })
  })

  it('counts nobody stuck when no alarm is a run', () => {
    const quiet = { ...THREE, attention: attention() }
    expect(bars.theBarOf(quiet)).toEqual({ read: true, working: 2, waiting: 1, stuck: 0, total: 3, atWork: AT_WORK_IN_THREE })
  })

  it('counts nothing and names the reading that did not answer', () => {
    expect(bars.theBarOf({ ...THREE, roster: failed })).toMatchObject({ read: false, failed: ['roster'] })
    expect(bars.theBarOf({ ...THREE, waiting: failed })).toMatchObject({ read: false, failed: ['waiting'] })
    expect(bars.theBarOf({ ...THREE, attention: failed })).toMatchObject({ read: false, failed: ['attention'] })
    expect(bars.theBarOf({ ...THREE, roster: loading })).toMatchObject({ read: false, failed: [] })
  })
})

describe('the drawing', () => {
  it('draws the three parts of the bar, the number 3 at its end, and the key below the bars', () => {
    const html = draw([{ id: 'made-up-project', name: 'Made-up project', bar: bars.theBarOf(THREE) }])
    const bar = barOf(html, 'made-up-project')
    for (const part of ['working', 'waiting', 'stuck']) expect(bar).toContain(`data-bar-part="${part}" data-count="1"`)
    expect(bar).toMatch(/data-bar-total="3"[^>]*>3</)
    const key = html.slice(html.indexOf('data-home-bars-key'))
    expect(html.indexOf('data-home-bars-key')).toBeGreaterThan(html.lastIndexOf('data-home-bar='))
    for (const word of [t('home.bars.working'), t('home.bars.waiting'), t('home.bars.stuck')]) expect(key).toContain(`>${word}<`)
  })

  it('says an unread roster in words and draws no number for it', () => {
    const html = draw([{ id: 'made-up-project', name: 'Made-up project', bar: bars.theBarOf({ ...THREE, roster: failed }) }])
    const bar = barOf(html, 'made-up-project')
    expect(bar).toContain(t('home.bars.unread.roster'))
    expect(bar).not.toContain('data-bar-total')
    expect(bar).not.toContain('data-bar-part')
    expect(bar.replace(/<[^>]*>/g, '')).not.toMatch(/\d/)
  })

  it('draws only the name of a project whose roster holds none, and counts the projects in the heading', () => {
    const empty = { ...THREE, roster: roster([]) }
    const html = draw([
      { id: 'made-up-busy', name: 'Made-up busy project', bar: bars.theBarOf(THREE) },
      { id: 'made-up-empty', name: 'Made-up empty project', bar: bars.theBarOf(empty) },
      { id: 'made-up-unread', name: 'Made-up unread project', bar: bars.theBarOf({ ...THREE, roster: failed }) },
    ])
    // THE ROW IS THE PROJECT'S NAME AND NOTHING ELSE: no words, no bar and no number beside it.
    const idle = barOf(html, 'made-up-empty')
    expect(idle.slice(idle.indexOf('>') + 1), 'the row draws something beside the name').toBe('<span class="hm-bar-name">Made-up empty project</span>')
    const heading = t('home.bars.heading', { agents: t('home.bars.agents', { n: 3 }), busy: count(1), projects: t('home.bars.projects', { n: 3 }) })
    expect(html).toContain(`>${heading}<`)
    expect(html).toContain(t('home.bars.notCounted', { n: 1 }))
  })

  it('counts one agent on the rosters of two projects once in the heading, and in each of the two bars', () => {
    const inFirst = { ...THREE, roster: roster([agent('a', 'online')]), waiting: waitingFrom(), attention: attention() }
    // THE SECOND PROJECT HOLDS AN AGENT RECORD OF ITS OWN, and it is the same agent: the same participant.
    const inSecond = { ...inFirst, roster: roster([{ ...agent('a', 'online'), agentId: 'made-up-agent-record-a-in-the-second-project' }]) }
    const html = draw([
      { id: 'made-up-first', name: 'Made-up first project', bar: bars.theBarOf(inFirst) },
      { id: 'made-up-second', name: 'Made-up second project', bar: bars.theBarOf(inSecond) },
    ])
    expect(barOf(html, 'made-up-first')).toMatch(/data-bar-total="1"[^>]*>1</)
    expect(barOf(html, 'made-up-second')).toMatch(/data-bar-total="1"[^>]*>1</)
    const heading = t('home.bars.heading', { agents: t('home.bars.agents', { n: 1 }), busy: count(2), projects: t('home.bars.projects', { n: 2 }) })
    expect(html).toContain(`>${heading}<`)
  })

  it('says how many waiting rows cannot say which agent they came from', () => {
    const html = draw([{ id: 'made-up-project', name: 'Made-up project', bar: bars.theBarOf(THREE) }], 2)
    expect(html).toContain(t('home.bars.cannotTell', { n: 2 }))
    expect(draw([{ id: 'made-up-project', name: 'Made-up project', bar: bars.theBarOf(THREE) }], 0)).not.toContain(t('home.bars.cannotTell', { n: 0 }))
  })
})
