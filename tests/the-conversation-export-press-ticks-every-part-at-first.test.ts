// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT EXPORTS ONE RUN'S CONVERSATION, ON THE RUN'S PAGE. Wave 13s, point C1A-2, the export slice.
 *
 * The doors and the file are proved in tests/one-conversation-exports-with-the-parts-he-ticks.test.ts. What this file
 * requires is the half the person reads: the four parts as ticks, every one ticked at first; a part the agent lacks
 * drawn as not there with no tick; what the look first said, for the parts still ticked; and a second press asked
 * for when there is something to look at. The press is drawn from a reading, so nothing here needs a server.
 *
 * THE CASES:
 *   1. the ticks at first are every part ticked, and each part the agent has is drawn as a ticked box;
 *   2. a part the agent lacks is drawn as not there, with no box;
 *   3. the files left out, the files not screened and each finding are drawn for the parts still ticked, and an
 *      unticked part's files are not;
 *   4. with something to look at, the press asks for a second press only after the first;
 *   5. the look first and the export are one path, read and sent, and the export sends the ticks and the look.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  ConversationExportLook,
  ConversationExportPart,
  ConversationExportPartState,
  ConversationExportPiece,
  ConversationExportPieceLook,
} from '../src/shared/conversation-export.ts'
import type { ScreenCheckName, ScreenSeverity } from '../src/shared/screen-closed-set.ts'
import { t } from '../src/shared/i18n.ts'
import { screenCheckWord } from '../src/shared/words.ts'

// src/web/api.ts reads window.localStorage when it is imported. This is the smallest stand-in that lets it load;
// nothing in it is under test.
const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: storage,
  sessionStorage: storage,
  location: { hash: '', search: '', origin: 'http://127.0.0.1', protocol: 'http:', host: '127.0.0.1', hostname: '127.0.0.1', port: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
}

let press: typeof import('../src/web/components/ConversationExportPress.tsx')
let shared: typeof import('../src/shared/conversation-export.ts')
const realFetch = globalThis.fetch

beforeAll(async () => {
  press = await import('../src/web/components/ConversationExportPress.tsx')
  shared = await import('../src/shared/conversation-export.ts')
})

afterAll(() => {
  globalThis.fetch = realFetch
})

const CARRIED = 'carried' satisfies ConversationExportPartState
const NOT_THERE = 'not-there' satisfies ConversationExportPartState
const EMAIL = 'email_address' satisfies ScreenCheckName
const OTHER_PEOPLES_NAMES = 'other_peoples_names' satisfies ScreenCheckName
const LOOK_FIRST = 'look_before_you_paste' satisfies ScreenSeverity

function strip(markup: string): string {
  return markup
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One part's row, so a box is checked beside the part it belongs to rather than anywhere in the press. */
function rowOf(markup: string, part: ConversationExportPart): string {
  const found = new RegExp(`<li[^>]*data-export-part="${part}"[^>]*>([\\s\\S]*?)</li>`).exec(markup)
  expect(found, `the press drew no row for the ${part}`).not.toBeNull()
  return found![1]!
}

const aBox = /<input[^>]*type="checkbox"/
const aTickedBox = /<input[^>]*type="checkbox"[^>]*checked=""/

/** A look first where the agent has every part, one space file is not text, and one memory file was left out. */
function aLook(missing: ConversationExportPiece[] = []): ConversationExportLook {
  const piece = (
    one: ConversationExportPiece,
    entries: { name: string; bytes: number }[],
  ): ConversationExportPieceLook => ({
    piece: one,
    state: missing.includes(one) ? NOT_THERE : CARRIED,
    entries: missing.includes(one) ? [] : entries,
    bytes: missing.includes(one) ? 0 : entries.reduce((sum, e) => sum + e.bytes, 0),
    scrub: { pathsMapped: 1, secretsRemoved: 0, secretShapes: [] },
  })
  return {
    run: { id: 'made-up-run', title: 'A made-up run' },
    runtime: 'claude-code',
    pieces: [
      piece('run', [{ name: shared.CONVERSATION_EXPORT_ENTRY.manifest, bytes: 300 }]),
      piece('conversation', [{ name: shared.CONVERSATION_EXPORT_ENTRY.conversationLines, bytes: 2000 }]),
      piece('handover', [{ name: shared.CONVERSATION_EXPORT_ENTRY.handover, bytes: 100 }]),
      piece('notebook', [{ name: shared.CONVERSATION_EXPORT_ENTRY.notebook, bytes: 80 }]),
      piece('memory', [{ name: `${shared.CONVERSATION_EXPORT_ENTRY.memory}MEMORY.md`, bytes: 40 }]),
      piece('space', [
        { name: `${shared.CONVERSATION_EXPORT_ENTRY.space}notes.txt`, bytes: 30 },
        { name: `${shared.CONVERSATION_EXPORT_ENTRY.space}pictures/a.bin`, bytes: 9 },
      ]),
      piece('address', [{ name: shared.CONVERSATION_EXPORT_ENTRY.address, bytes: 60 }]),
    ],
    leftOut: missing.includes('memory')
      ? []
      : [{ piece: 'memory', file: `${shared.CONVERSATION_EXPORT_ENTRY.memory}notes.txt`, why: 'not-a-markdown-file', bytes: 12 }],
    notScreened: missing.includes('space') ? [] : [{ piece: 'space', entry: `${shared.CONVERSATION_EXPORT_ENTRY.space}pictures/a.bin`, bytes: 9 }],
    findings: [
      { piece: 'handover', file: shared.CONVERSATION_EXPORT_ENTRY.handover, check: EMAIL, severity: LOOK_FIRST, says: 'An e-mail.' },
      { piece: null, file: null, check: OTHER_PEOPLES_NAMES, severity: LOOK_FIRST, says: 'Names are not checked.' },
    ],
  }
}

function drawn(
  look: ConversationExportLook | null,
  ticked: Record<ConversationExportPart, boolean> = press.theTicksAtFirst(),
  askingToGoOn = false,
): string {
  return renderToStaticMarkup(
    h(press.ConversationExportPressView, {
      look,
      ticked,
      failed: null,
      busy: false,
      askingToGoOn,
      onOpen: () => {},
      onTick: () => {},
      onDownload: () => {},
    }),
  )
}

describe('the conversation export press', () => {
  it('1: ticks every part at first, and draws each part the agent has as a ticked box', () => {
    expect(press.theTicksAtFirst()).toEqual(Object.fromEntries(shared.CONVERSATION_EXPORT_PARTS.map((part) => [part, true])))
    const markup = drawn(aLook())
    for (const part of shared.CONVERSATION_EXPORT_PARTS) {
      expect(rowOf(markup, part), `the ${part} is not a ticked box`).toMatch(aTickedBox)
      expect(strip(rowOf(markup, part))).toContain(t(press.CONVERSATION_EXPORT_WORDS.part[part]))
    }
    expect(strip(markup)).toContain(t(press.CONVERSATION_EXPORT_WORDS.download))
  })

  it('2: draws a part the agent lacks as not there, with no box', () => {
    const markup = drawn(aLook(['memory', 'notebook']))
    for (const part of ['memory', 'notebook'] as const) {
      expect(rowOf(markup, part), `the ${part} the agent lacks has a box`).not.toMatch(aBox)
      expect(strip(rowOf(markup, part))).toContain(t(press.CONVERSATION_EXPORT_WORDS.notThere))
    }
    for (const part of ['space', 'address'] as const) expect(rowOf(markup, part)).toMatch(aTickedBox)
  })

  it('3: draws what the look first said for the parts still ticked', () => {
    const everything = strip(drawn(aLook()))
    expect(everything).toContain(`${shared.CONVERSATION_EXPORT_ENTRY.memory}notes.txt`)
    expect(everything).toContain(`${shared.CONVERSATION_EXPORT_ENTRY.space}pictures/a.bin`)
    expect(everything).toContain(screenCheckWord(EMAIL).text)
    expect(everything).toContain(screenCheckWord(OTHER_PEOPLES_NAMES).text)

    const noSpace = strip(drawn(aLook(), { ...press.theTicksAtFirst(), space: false, memory: false }))
    expect(noSpace, 'an unticked part’s file is still drawn').not.toContain(`${shared.CONVERSATION_EXPORT_ENTRY.space}pictures/a.bin`)
    expect(noSpace, 'an unticked part’s file is still drawn').not.toContain(`${shared.CONVERSATION_EXPORT_ENTRY.memory}notes.txt`)
    // The handover always travels, so its finding stays.
    expect(noSpace).toContain(screenCheckWord(EMAIL).text)
  })

  it('4: asks for a second press only after the first, when there is something to look at', () => {
    expect(strip(drawn(aLook()))).not.toContain(t(press.CONVERSATION_EXPORT_WORDS.pressAgain))
    expect(strip(drawn(aLook(), press.theTicksAtFirst(), true))).toContain(t(press.CONVERSATION_EXPORT_WORDS.pressAgain))
  })

  it('5: reads the look first and sends the export at the run’s one path, with the ticks and the look', async () => {
    const asked: { url: string; method: string; body: string }[] = []
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      asked.push({ url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? '') })
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify(aLook()), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), { status: 200, headers: { 'content-type': 'application/zip' } })
    }) as typeof fetch
    const ticks = { ...press.theTicksAtFirst(), space: false }
    try {
      await press.lookAtTheExport('made-up-run')
      const made = await press.exportTheConversation('made-up-run', ticks, true)
      expect(made.bytes.byteLength).toBe(4)
    } finally {
      globalThis.fetch = realFetch
    }
    expect(asked.map((one) => [new URL(one.url, 'http://127.0.0.1').pathname, one.method])).toEqual([
      ['/api/conversations/made-up-run/export', 'GET'],
      ['/api/conversations/made-up-run/export', 'POST'],
    ])
    expect(JSON.parse(asked[1]!.body), 'the export sends the ticks and the look, and nothing else').toEqual({ parts: ticks, looked: true })
  })
})
