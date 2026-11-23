// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLACE A LEAD OFFERS TO TAKE THE READER IS NAMED IN THE PAGE LANGUAGE. Problem t_ox8XMOvu7a.
 *
 * A lead's offer names where it goes. For a record it is the record's title. For anything else it is
 * `nameTarget` in src/shared/targets.ts, and that wrote English in code ("the page /pipeline/…"), so a
 * Chinese page showed English inside a Chinese sentence. Now each kind's name is read from the word
 * lists through readStoredWord. Under Node that is English, so every sentence the server writes with
 * a target's name is the English it always was.
 *
 * A LEAD TO A PAGE IS NAMED BY WHAT THE PAGE SHOWS, NOT BY ITS ADDRESS (problem 30fVQwjGa3Qb, wave
 * 13n round 29). `whereALeadGoes` names a page whose address names a record by the record's kind and
 * title, any other page by its own name, and draws the address only in developer mode. `nameTarget`
 * itself is unchanged: a comment's sentences still name a page by its address.
 *
 * WHAT IS PROVED
 *   1. Under Node every kind is named in the same English as before, word for word, and a lead to a
 *      page is named by what it shows, with the address only in developer mode.
 *   2. In a Chinese browser, the offer for a page, a plan and a line of a plan names the place in
 *      Chinese, and every kind's name holds no English word once its ids are taken out.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   a kind's name written in English in code again          → case 2
 *   the English in en.ts no longer the sentence it was      → case 1
 *   a page named by its address again                       → cases 1 and 2
 *
 * Nothing here opens a database or a browser.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { setWordLanguage } from '../src/shared/i18n.ts'
import { LEADING } from '../src/shared/messages.ts'
import { idsOfTarget, nameTarget, TARGET_KINDS, TARGET_SPECS_BY_KIND, type Context, type Target } from '../src/shared/targets.ts'
import { whereALeadGoes } from '../src/web/components/Leading.tsx'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'

/** Run one reading as a Chinese page in a browser would: no Node version, and the page reader in Chinese. */
function inAChineseBrowser<T>(read: () => T): T {
  setWordLanguage('zh')
  vi.stubGlobal('process', { ...process, versions: { ...process.versions, node: undefined } })
  try {
    return read()
  } finally {
    vi.unstubAllGlobals()
    setWordLanguage('en')
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  setWordLanguage('en')
})

/** One target of a kind, built from the examples its declaration gives. */
function anExampleOf(kind: string): Target {
  const ids: Record<string, string> = {}
  for (const field of TARGET_SPECS_BY_KIND[kind as keyof typeof TARGET_SPECS_BY_KIND].identifies) ids[field.key] = field.example
  return { kind, ...ids } as unknown as Target
}

/** The English each kind was named in before this change, from the same ids. */
const THE_ENGLISH: Readonly<Record<string, (ids: Record<string, string>) => string>> = {
  record: (i) => `the record ${i.recordId}`,
  plan: (i) => `the plan ${i.planId}`,
  reportBlock: (i) => `the block ${i.blockId} of record ${i.recordId}`,
  region: (i) => `the part ${i.regionId} of record ${i.recordId}`,
  change: (i) => `the change ${i.changeId} to record ${i.recordId}`,
  tableRow: (i) => `row ${i.rowKey} of the table ${i.blockId}`,
  tableCell: (i) => `row ${i.rowKey}, column ${i.columnKey} of the table ${i.blockId}`,
  planLine: (i) => `line ${i.lineId} of plan ${i.planId}`,
  planLineFact: (i) => `the ${i.fact} of line ${i.lineId} of plan ${i.planId}`,
  scheduleBlock: (i) => `the block on the week ${i.windowId}`,
  graphNode: (i) => `the node for record ${i.recordId} in the drawing ${i.drawing}`,
  agentMessage: (i) => `the message ${i.messageId}`,
  annotation: (i) => `the note ${i.annotationId}`,
  proposedAction: (i) => `action ${i.actionId} of the organised reading ${i.interpretationId}`,
  draft: (i) => `the unsent instruction ${i.draftId}`,
  page: (i) => `the page ${i.route}`,
}

/** A part of Mole Office's own screen is named from src/shared/surfaces.ts, which this change does not touch. */
const NAMED_ELSEWHERE = new Set(['uiSurface'])

/** Words that would only be in the name if it were drawn in English. */
const ENGLISH = /\b(the|of|record|plan|page|line|row|column|table|block|week|node|drawing|message|note|action|reading|instruction|part|change)\b/i

function aLeadTo(target: Target): Context {
  return { target } as unknown as Context
}

/** What a page shows, as the browser would have read it: the pipeline the lead that went wrong led to. */
const HANDOVER = { kind: 'pipeline', title: 'Handover v2' } as const
/** Nothing read about the page, in normal mode. */
const NOTHING_READ = { read: null, developer: false } as const

describe('the place a lead goes is named in the page language', () => {
  it('names every kind in the same English as before under Node', () => {
    const kinds = TARGET_KINDS.filter((kind) => !NAMED_ELSEWHERE.has(kind))
    expect(kinds.sort()).toEqual(Object.keys(THE_ENGLISH).sort())
    for (const kind of kinds) {
      const target = anExampleOf(kind)
      expect(nameTarget(target), kind).toBe(THE_ENGLISH[kind]!(target as unknown as Record<string, string>))
    }
    // A LEAD TO A PAGE IS NAMED BY WHAT THE PAGE SHOWS. Before round 29 this was 'the page /pipeline/TEoKg5mV7egP'.
    const drawing = aLeadTo({ kind: 'page', route: '/pipeline/TEoKg5mV7egP' } as Target)
    expect(whereALeadGoes(drawing, '', 'default', (id) => id, { read: HANDOVER, developer: false })).toBe(
      'the drawing of the pipeline "Handover v2"',
    )
    // NOTHING READ: the kind the address says, and no title.
    expect(whereALeadGoes(drawing, '', 'default', (id) => id, NOTHING_READ)).toBe(
      'the drawing of one pipeline, whose title is not known here',
    )
    // A READ OF ANOTHER KIND THAN THE ADDRESS SAYS gives no title either.
    expect(
      whereALeadGoes(drawing, '', 'default', (id) => id, { read: { kind: 'note', title: 'A note' }, developer: false }),
    ).toBe('the drawing of one pipeline, whose title is not known here')
    // IN DEVELOPER MODE THE ADDRESS IS THERE TOO.
    expect(whereALeadGoes(drawing, '', 'default', (id) => id, { read: HANDOVER, developer: true })).toBe(
      'the drawing of the pipeline "Handover v2" (/pipeline/TEoKg5mV7egP)',
    )
    // A RECORD'S OWN PAGE, which says no kind in its address: the kind the read says.
    const recordPage = aLeadTo({ kind: 'page', route: '/r/TEoKg5mV7egP' } as Target)
    expect(whereALeadGoes(recordPage, '', 'default', (id) => id, { read: HANDOVER, developer: false })).toBe(
      'the pipeline "Handover v2"',
    )
    expect(whereALeadGoes(recordPage, '', 'default', (id) => id, NOTHING_READ)).toBe(
      'a page about one record, whose title is not known here',
    )
  })

  it('names the place in Chinese in a Chinese browser, and no kind keeps an English word', () => {
    const drawing = aLeadTo({ kind: 'page', route: '/pipeline/TEoKg5mV7egP' } as Target)
    // Before round 29 this was '页面 /pipeline/TEoKg5mV7egP'.
    expect(inAChineseBrowser(() => whereALeadGoes(drawing, '', 'default', (id) => id, { read: HANDOVER, developer: false }))).toBe(
      '流水线 Handover v2 的图',
    )
    expect(inAChineseBrowser(() => whereALeadGoes(drawing, '', 'default', (id) => id, NOTHING_READ))).toBe(
      '一个流水线的图，这里不知道它的标题',
    )
    expect(inAChineseBrowser(() => whereALeadGoes(drawing, '', 'default', (id) => id, { read: HANDOVER, developer: true }))).toBe(
      '流水线 Handover v2 的图（/pipeline/TEoKg5mV7egP）',
    )
    const plan = inAChineseBrowser(() => whereALeadGoes(aLeadTo(anExampleOf('plan')), '', 'default', (id) => id, NOTHING_READ))
    expect(plan).toContain('计划')
    expect(plan).not.toMatch(ENGLISH)
    const line = inAChineseBrowser(() => whereALeadGoes(aLeadTo(anExampleOf('planLine')), '', 'default', (id) => id, NOTHING_READ))
    expect(line).toContain('计划')
    expect(line).not.toMatch(ENGLISH)
    // IN ANOTHER PROJECT the offer's own sentence wraps the Chinese name. A page that shows no record
    // is named by its own name, the one the sidebar draws. Before round 29 this was '页面 /records'. A name that
    // waits for its Chinese is its English, in wave 13j's round 43, and no other.
    const elsewhere = inAChineseBrowser(() =>
      whereALeadGoes(
        aLeadTo({ kind: 'page', route: '/records', workspaceId: 'greenhouse' } as Target),
        '',
        'default',
        () => 'Greenhouse',
        NOTHING_READ,
      ),
    )
    expect(elsewhere).toBe(inAChineseBrowser(() => LEADING.inAnotherProject(String(theWordAPageDraws('zh', 'nav.records')), 'Greenhouse')))
    expect(elsewhere).not.toContain('/records')
    for (const kind of TARGET_KINDS.filter((one) => !NAMED_ELSEWHERE.has(one))) {
      const target = anExampleOf(kind)
      const named = inAChineseBrowser(() => nameTarget(target))
      let withoutIds = named
      for (const id of idsOfTarget(target)) withoutIds = withoutIds.split(id).join('')
      for (const field of TARGET_SPECS_BY_KIND[kind].identifies) withoutIds = withoutIds.split(field.example).join('')
      expect(withoutIds, `${kind}: ${named}`).not.toMatch(/[A-Za-z]/)
    }
  })
})
