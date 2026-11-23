// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT IS DRAWN FROM WHAT THE OFFICE STORED, AND NOTHING ELSE. Wave 13r round 4, a
 * decision and the proposal report GsGFiDygATd5, blocks b-4 to b-8, and the owner's addition to item 4 of
 * a second decision, the session-origin file.
 *
 * WHAT IS MEASURED, each drawn with renderToStaticMarkup from a reading written here, with no server:
 *
 *   · a resident is called by its own third person only where that is written in the page's language,
 *     and by its name otherwise; the page never chooses a 他 or a 它 for it;
 *   · each line of the session-origin file is read, a field nobody recorded is null and named as
 *     unknown, and a line that cannot be read is answered by its number, never dropped;
 *   · a proposal's presses are drawn to the person and to nobody else, and a fact nobody measured says
 *     "unknown";
 *   · after Confirm the row says the resident has a space (the door makes it in the same act or refuses),
 *     and after Not now it says no such thing;
 *   · another agent that may not read a space is told only that it is private, and sees no file name;
 *   · a void file is struck through beside its reason, a file's earlier versions are listed under it with a
 *     press to read and none to write; the session-origin file is drawn as a table with "unknown" where
 *     nobody recorded a field, and its resume command to copy;
 *   · the person's presses on the space (mark void, end a grant) are drawn to the person only;
 *   · the Embassy draws the resident mark on a resident's row and the count at the Agents heading.
 *
 * WHAT THIS DOES NOT MEASURE: the doors, which tests/a-permanent-resident-has-a-space-of-its-own.test.ts drives.
 * The shapes drawn here are the doors' own types, so a renamed field fails the type check. The pages drawn
 * against a real office are tests/a-permanent-resident-is-drawn-in-the-browser.test.ts.
 *
 * THE THREE RUNS ARE IN THE COMMIT MESSAGE that added this file.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setWordLanguage } from '../src/shared/i18n.ts'
import type { EmbassyRow, WhatTheEmbassySays } from '../src/shared/worlds.ts'
import type {
  AResidencyProposal,
  ASessionOrigin,
  OneResidentReading,
  TheResidentsList,
  TheSpaceListing,
} from '../src/web/lib/residents.ts'

// src/web/api.ts reads window.localStorage when it is imported. This is the smallest stand-in that
// lets the components load; nothing in it is under test.
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

let lib: typeof import('../src/web/lib/residents.ts')
let proposals: typeof import('../src/web/components/ResidentProposals.tsx')
let section: typeof import('../src/web/components/ResidentSection.tsx')
let mark: typeof import('../src/web/components/ResidentMark.tsx')
let embassy: typeof import('../src/web/pages/EmbassyPage.tsx')

beforeAll(async () => {
  lib = await import('../src/web/lib/residents.ts')
  proposals = await import('../src/web/components/ResidentProposals.tsx')
  section = await import('../src/web/components/ResidentSection.tsx')
  mark = await import('../src/web/components/ResidentMark.tsx')
  embassy = await import('../src/web/pages/EmbassyPage.tsx')
})

afterEach(() => setWordLanguage('en'))

const stamp = '2026-10-14 10:02:00'
const MB = 1024 * 1024

const proposal: AResidencyProposal = {
  id: 'test-proposal',
  workspaceId: 'default',
  title: 'Make Test agent Lark a permanent resident',
  agentId: 'test-lark',
  handle: 'lark',
  name: 'Test agent Lark',
  proposedBy: 'test-sable',
  proposedAt: stamp,
  because: 'Test reason, written by the secretary.',
  facts: { measuredAt: stamp, citizenSince: null, daysSinceCitizen: null, daysWithARun: 31, runs: 40, recordsWritten: 96, retired: false, homeWorld: null },
  homeWorldIsThisOffice: null,
  area: null,
  sleepTime: { startsAt: '03:00', minutes: 120 },
  criterion: {
    days: { needed: 3, have: 31, part: 'met' },
    compactions: { needed: 5, have: null, part: 'not-measured' },
    area: { named: null, part: 'not-named' },
  },
  settled: null,
}

function strip(markup: string): string {
  return markup.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

function buttons(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((one) => strip(one[1]!).trim())
}

describe('what a resident is called in a sentence', () => {
  it('uses its own third person where it is written in the page language, and its name otherwise', () => {
    const chinese = { name: 'Lark', addressAs: { thirdPerson: '她' } }
    const english = { name: 'Lark', addressAs: { thirdPerson: 'she' } }
    const unset = { name: 'Lark', addressAs: {} }
    expect(lib.theResidentInASentence(chinese, 'zh')).toBe('她')
    expect(lib.theResidentInASentence(chinese, 'en')).toBe('Lark')
    expect(lib.theResidentInASentence(english, 'en')).toBe('she')
    expect(lib.theResidentInASentence(english, 'zh')).toBe('Lark')
    expect(lib.theResidentInASentence(unset, 'zh')).toBe('Lark')
  })

  it('never puts a 他 or a 它 into the Chinese proposal for a resident that set none', () => {
    setWordLanguage('zh')
    const markup = renderToStaticMarkup(
      h(proposals.ResidentProposalRow, { proposal, limitBytes: 500 * MB, answer: null, thePerson: true, onPressed: () => {} }),
    )
    const words = strip(markup)
    expect(words).toContain('只有得到 Test agent Lark 的允许')
    // 其他 ("other") holds the character 他 and is not a pronoun, so it is not counted.
    expect(words).not.toMatch(/(?<!其)[他它]/)
  })
})

describe('the session-origin file', () => {
  it('reads each line the office wrote, and answers a line of any other shape by its number', () => {
    const text = [
      JSON.stringify(origin),
      '',
      'not json at all',
      JSON.stringify({ ...origin, startedAt: 7 }),
      JSON.stringify({ recordedAt: stamp }),
      JSON.stringify({ ...origin, how: { ...origin.how, startedByMoleOffice: true } }),
    ].join('\n')
    const read = lib.readTheSessionOrigins(text)
    expect(read.map((one) => one.ok)).toEqual([true, false, false, false, true])
    expect(read[1]).toEqual({ ok: false, lineNumber: 3 })
    expect(read[2]).toEqual({ ok: false, lineNumber: 4 })
    expect(read[3]).toEqual({ ok: false, lineNumber: 5 })
    const first = read[0]!.ok ? read[0]!.line : null
    expect(first?.host).toBeNull()
    expect(first?.resumeCommand).toBe('claude --resume test-session')
  })
})

describe('a proposal and the person’s press', () => {
  it('draws Confirm and Not now to the person, with what the press does', () => {
    const markup = renderToStaticMarkup(
      h(proposals.ResidentProposalRow, { proposal, limitBytes: 500 * MB, answer: null, thePerson: true, onPressed: () => {} }),
    )
    expect(buttons(markup)).toEqual(['Confirm: Test agent Lark becomes a resident', 'Not now'])
    const words = strip(markup)
    expect(words).toContain('a folder of at most 500 MB')
    expect(words).toContain('Only you can press Confirm.')
    expect(words).toContain('Test reason, written by the secretary.')
  })

  it('draws no press to anybody else, and says unknown for a fact nobody recorded', () => {
    const markup = renderToStaticMarkup(
      h(proposals.ResidentProposalRow, { proposal, limitBytes: 500 * MB, answer: null, thePerson: false, onPressed: () => {} }),
    )
    expect(buttons(markup)).toEqual([])
    expect(strip(markup)).not.toContain('Only you can press Confirm.')
    expect(strip(markup)).toMatch(/Citizen of this office since\s+unknown/)
    expect(strip(markup)).toMatch(/Home world\s+unknown/)
  })

  it('says the resident has a space after Confirm, and says no such thing after Not now', () => {
    const resident = { agentId: 'test-lark', handle: 'lark', name: 'Test agent Lark', since: stamp, retired: false, successor: null }
    const made = proposals.doneWords({ did: 'confirm', reply: { resident, decision: { id: 'd', title: 'x' }, firstOrigin: null, reminder: { person: 'waiting', agent: { sent: true, messageId: 'm' } }, said: 'x' } }, 'Lark')
    expect(made).toBe('Confirmed by you at 2026/10/14 10:02. Lark has a personal space now.')
    const declined = proposals.doneWords({ did: 'decline', reply: { decision: { id: 'd', title: 'x' } } }, 'Lark')
    expect(declined).not.toContain('personal space')
    expect(declined).toContain('Not now is recorded.')
  })
})

const agent = {
  kind: 'agent',
  id: 'test-lark',
  name: 'Test agent Lark',
  handle: 'lark',
  avatarUrl: '',
  state: null,
  stateAt: null,
  createdAt: stamp,
  homeWorld: null,
  addressAs: { name: 'Lark', thirdPerson: '它' },
  addressAsSetBy: null,
} as unknown as import('../src/web/api.ts').ParticipantOnTheWire

const lark = { kind: 'agent' as const, id: 'test-lark' }
const reading: OneResidentReading = {
  resident: {
    agentId: 'test-lark',
    handle: 'lark',
    name: 'Test agent Lark',
    since: stamp,
    proposalId: 'test-proposal',
    proposedBy: 'test-sable',
    decisionId: 'test-decision',
    confirmedBy: { kind: 'person', id: 'test-owner' },
    factsAtProposal: proposal.facts,
    homeWorldIsThisOffice: null,
    retired: false,
    retiredAt: null,
    successor: null,
    naming: { askedAt: null, namedAt: null, namedBy: null },
    heartbeat: { state: 'none', heldNow: false, lastBeatAt: null, lapsed: false, endedBecause: null, lapsesAfterSeconds: 120, says: 'x' },
    sleep: { asleep: null, sleepTime: null, lastSleepEndedAt: null, postponements: [], postponedInAll: 0, recorded: false, says: 'x' },
    compactionsReported: 0,
    holdsTheSecretaryCard: false,
  },
  space: {
    mayRead: true,
    readAs: 'the person',
    used: 117 * MB,
    limit: 500 * MB,
    grants: [
      { id: 'g1', readerId: 'test-fennel', readerHandle: 'fennel', until: '2099-01-01 00:00:00', givenAt: stamp, givenBy: lark, ended: null, holds: true },
      { id: 'g2', readerId: 'test-quarry', readerHandle: 'quarry', until: '2099-01-01 00:00:00', givenAt: stamp, givenBy: lark, ended: { at: stamp, by: lark }, holds: false },
    ],
    voidMarks: [],
    sessionOrigins: { upToDate: true, appended: 0 },
    notes: 'Test notes.',
  },
}

const listing: TheSpaceListing = {
  used: 117 * MB,
  limit: 500 * MB,
  notes: 'Test notes.',
  files: [
    { path: 'memory/who-i-am.md', bytes: 6 * 1024, modified: stamp, written: { at: stamp, by: lark }, writtenByTheOffice: false, void: null,
      versions: [{ number: 1, path: '.versions/memory/who-i-am.md/1', bytes: 2048, kept: { at: stamp, by: lark }, void: null }] },
    { path: 'memory/old-node.md', bytes: 1024, modified: stamp, written: { at: stamp, by: lark }, writtenByTheOffice: false,
      void: { because: 'Test: the office uses Node 22', by: lark, at: stamp }, versions: [] },
    { path: 'session-origins.jsonl', bytes: 300, modified: stamp, written: null, writtenByTheOffice: true, void: null, versions: [] },
  ],
}

const origin: ASessionOrigin = {
  recordedAt: stamp, sessionRecordId: 'ses-test', sessionRecordFiledAt: stamp, startedAt: stamp, runtime: 'claude-code', model: null,
  host: null, officeMachine: null, cwd: '/work', checkout: { cutFrom: 'main' }, providerSession: null, resumeCommand: 'claude --resume test-session',
  how: { entryPoint: 'cli', startedByMoleOffice: null, sandbox: null, terminal: null }, unknown: ['model', 'host'], withheld: [],
}

function drawSection(over: { reading?: OneResidentReading; thePerson?: boolean; listing?: TheSpaceListing | null; origins?: string }): string {
  const read = over.reading ?? reading
  const files = over.listing === undefined ? listing : over.listing
  return renderToStaticMarkup(
    h(section.TheResidentSection, {
      agent,
      reading: read,
      listing: files === null ? null : { status: 'ready', value: files },
      origins: { status: 'read', lines: lib.readTheSessionOrigins(over.origins ?? JSON.stringify(origin)) },
      thePerson: over.thePerson ?? true,
      onChanged: () => {},
    }),
  )
}

describe('a resident’s section', () => {
  it('tells an agent that may not read the space only that it is private', () => {
    // The files are handed in all the same: the reading's own word decides, whatever else is on hand.
    const markup = drawSection({ reading: { ...reading, space: { mayRead: false, private: 'Test: private.' } }, thePerson: false })
    expect(strip(markup)).toContain('This space is private.')
    expect(markup).not.toContain('memory/who-i-am.md')
    expect(markup).not.toContain('session-origins.jsonl')
  })

  it('strikes a void file through beside its reason, and says unknown for a field nobody recorded', () => {
    const markup = drawSection({})
    expect(markup).toMatch(/<s class="resident-path">memory\/old-node\.md<\/s>/)
    expect(strip(markup)).toContain('void: Test: the office uses Node 22')
    expect(markup).toContain('claude --resume test-session')
    expect(markup).toMatch(/data-label="Machine"><span class="resident-unknown" data-unknown="yes">unknown<\/span>/)
    expect(strip(markup)).toContain('117 MB of 500 MB')
  })

  it('lists a file’s earlier versions under it, with a press to read each and none to change it', () => {
    const markup = drawSection({ thePerson: true })
    const version = /<tr data-version="\.versions\/memory\/who-i-am\.md\/1"[\s\S]*?<\/tr>/.exec(markup)?.[0] ?? ''
    expect(strip(version)).toContain('earlier version 1')
    expect(buttons(version)).toEqual(['Read'])
    expect(markup.indexOf('data-file="memory/who-i-am.md"')).toBeLessThan(markup.indexOf('data-version=".versions/memory/who-i-am.md/1"'))
  })

  it('says an ended grant is ended, and offers to end only the one that holds', () => {
    const markup = drawSection({ thePerson: true })
    expect(markup).toContain('data-grant="live"')
    expect(markup).toContain('data-grant="ended"')
    expect(buttons(markup).filter((one) => one === 'End this leave')).toHaveLength(1)
  })

  it('draws the person’s presses to the person only', () => {
    const forThem = buttons(drawSection({ thePerson: true }))
    expect(forThem).toContain('Mark void')
    expect(forThem).toContain('End this leave')
    const forAnother = buttons(drawSection({ thePerson: false }))
    expect(forAnother).not.toContain('Mark void')
    expect(forAnother).not.toContain('End this leave')
  })

  it('offers no void press on the session-origin file, which only the office writes', () => {
    const markup = drawSection({ thePerson: true })
    const row = /<tr data-file="session-origins\.jsonl"[\s\S]*?<\/tr>/.exec(markup)?.[0] ?? ''
    expect(row).toContain('written by the office')
    // Its one press reads it; nothing on its row marks it void.
    expect(buttons(row)).toEqual(['Read'])
  })
})

describe('the resident mark', () => {
  it('says Permanent resident and the day it was confirmed', () => {
    const markup = renderToStaticMarkup(h(mark.ResidentMark, { since: stamp }))
    expect(strip(markup)).toContain('Permanent resident')
    expect(strip(markup)).toContain('since 14 Oct 2026')
  })

  it('is drawn on a resident’s Embassy row, and counted at the Agents heading', () => {
    const row = (id: string, name: string): EmbassyRow => ({
      standing: 'citizen', who: { kind: 'agent', id }, name, registered: true,
      avatarUrl: '', world: 'w', worldName: 'Test world', fromWorld: null, fromWorldName: null,
      since: stamp, until: null, citizenSince: stamp, role: 'worker', choseRole: true, cardChosenBy: null,
      portrait: null, credential: null, device: false, heldKeys: [], runtime: null, machine: null,
      admittedBeforeP88: null, cardCeilingRaised: null, pickUpCost: null,
      chosePortrait: false, contact: true, group: null, groupKey: null, groupMade: null, presence: null, retired: null,
    }) as unknown as EmbassyRow
    const said = {
      rows: [row('test-lark', 'Test agent Lark'), row('test-quarry', 'Test agent Quarry')],
      office: { who: { kind: 'agent', id: 'test-office' }, name: 'Test office Elm', avatarUrl: '' },
      visitors: [], worlds: [], says: '', isTheOffice: true, workspaceId: 'default',
    } as unknown as WhatTheEmbassySays
    const residents: TheResidentsList = {
      residents: [{ agentId: 'test-lark', handle: 'lark', name: 'Test agent Lark', since: stamp, retired: false, successor: null }],
      openProposals: [],
      limit: 500 * MB,
    }
    const markup = renderToStaticMarkup(h(embassy.TheEmbassy, { said, residents: { status: 'ready', value: residents } }))
    expect(markup).toContain('data-residents="1"')
    expect(strip(markup)).toContain('1 permanent resident')
    expect(markup.match(/class="resident-mark"/g)?.length).toBe(1)
    const lark = /<li[^>]*>(?:(?!<\/li>)[\s\S])*Test agent Lark[\s\S]*?<\/li>/.exec(markup)?.[0] ?? ''
    expect(lark).toContain('resident-mark')
  })
})
