// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATION SYNC IS DRAWN WITH EACH COPY'S TOOL BESIDE IT.
 *
 * The sync itself exists and is proved in tests/the-conversation-sync.test.ts: a copy is scrubbed and stored on the
 * run's session record, the person turns it on and runs it, and a second machine can install a copy. What this file
 * requires is the half the owner reads: a panel on the runs page that says whether the sync is on, lists every copy
 * with the tool's small word beside it (claude, codex, opencode, read from the runtime word stored on its run), and
 * offers the person the two presses the doors allow. The panel is drawn from a reading, the same way the resident
 * panels are, so nothing here needs a server.
 *
 * WHAT IS MEASURED:
 *   1. every copy is drawn, each with its own runtime word and the state word the office read;
 *   2. with the sync off, the panel reads "Sync: off", and only the person is offered the press that turns it on;
 *   3. with the sync on, only the person is offered the press that copies the conversations, and a reader who is not
 *      the person still sees every copy;
 *   4. the three doors are the read, the set and the run, each at its own path, and the set sends the one boolean.
 *
 * MUTATIONS, EACH AFTER A CONTROL RUN AND RESTORED (the round's report names each run):
 *   - the runtime tag is not drawn beside a copy: case 1 goes red;
 *   - the state word is not drawn: case 1 goes red;
 *   - the turn-on press is drawn for every reader: case 2 goes red;
 *   - the copy press is drawn for every reader: case 3 goes red;
 *   - the set and the run ask each other's path: case 4 goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ConversationSyncReply } from '../src/shared/conversation-sync.ts'
import { t } from '../src/shared/i18n.ts'

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

let panel: typeof import('../src/web/components/ConversationSyncPanel.tsx')
let api: typeof import('../src/web/api.ts')['api']
const realFetch = globalThis.fetch

beforeAll(async () => {
  panel = await import('../src/web/components/ConversationSyncPanel.tsx')
  api = (await import('../src/web/api.ts')).api
})

afterAll(() => {
  globalThis.fetch = realFetch
})

function strip(markup: string): string {
  return markup.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buttons(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((one) => strip(one[1]!))
}

/** One copy's row, so a tag can be checked beside the copy it belongs to rather than anywhere on the panel. */
function rowOf(markup: string, run: string): string {
  const found = new RegExp(`<li[^>]*data-conversation-run="${run}"[^>]*>([\\s\\S]*?)</li>`).exec(markup)
  expect(found, `the panel drew no row for the copy of ${run}`).not.toBeNull()
  return found![1]!
}

const stamp = '2026-11-16 10:00:00'

function aReply(over: Partial<ConversationSyncReply> = {}): ConversationSyncReply {
  return {
    workspaceId: 'default',
    enabled: true,
    paths: [{ token: '<home>', original: '/home/made-up', mapped: null }],
    conversations: [
      {
        runId: 'run-claude',
        title: 'The Claude Code run',
        runtime: { word: 'claude-code', known: true },
        providerSession: 'made-up-claude',
        state: 'synced',
        bytes: 1234,
        sha256: 'a'.repeat(64),
        capturedAt: stamp,
        lastChangedAt: stamp,
        says: 'The file was copied.',
      },
      {
        runId: 'run-codex',
        title: 'The Codex run',
        runtime: { word: 'codex', known: true },
        providerSession: 'made-up-codex',
        state: 'missing',
        bytes: 0,
        sha256: null,
        capturedAt: null,
        lastChangedAt: null,
        says: 'The file is missing.',
      },
      {
        runId: 'run-opencode',
        title: 'The OpenCode run',
        runtime: { word: 'opencode', known: true },
        providerSession: 'made-up-opencode',
        state: 'synced',
        bytes: 2345,
        sha256: 'b'.repeat(64),
        capturedAt: stamp,
        lastChangedAt: stamp,
        says: 'The file was copied.',
      },
    ],
    total: 3,
    left: 0,
    reading: 3,
    lastRunAt: stamp,
    lastOutcome: null,
    says: 'The sync read two conversations.',
    ...over,
  }
}

function drawn(reply: ConversationSyncReply, person: boolean): string {
  return renderToStaticMarkup(
    h(panel.ConversationSyncPanelView, {
      reply,
      failed: null,
      person,
      busy: false,
      onRead: () => {},
      onRun: () => {},
      onTurnOn: () => {},
    }),
  )
}

describe('the conversation sync panel', () => {
  it('1: draws every copy with its own tool and state word beside it', () => {
    const markup = drawn(aReply(), false)
    expect(strip(markup)).toContain('The Claude Code run')
    expect(strip(markup)).toContain('The Codex run')
    expect(strip(markup)).toContain('The OpenCode run')
    const claude = rowOf(markup, 'run-claude')
    expect(claude, 'the Claude Code copy has no tool tag beside it').toMatch(/>claude<\/span>/)
    expect(claude, 'the stored runtime word is drawn instead of the word a person says').not.toContain('claude-code')
    expect(claude, 'the copied state is not drawn').toContain(t('conversation.state.synced'))
    const codex = rowOf(markup, 'run-codex')
    expect(codex, 'the Codex copy has no tool tag beside it').toMatch(/>codex<\/span>/)
    expect(codex, 'the missing state is not drawn').toContain(t('conversation.state.missing'))
    const opencode = rowOf(markup, 'run-opencode')
    expect(opencode, 'the OpenCode copy has no tool tag beside it').toMatch(/>opencode<\/span>/)
  })

  it('2: with the sync off, reads "Sync: off", and offers the turn-on to the person only', () => {
    const off = aReply({ enabled: false, conversations: [], total: 0, reading: 0 })
    const asPerson = drawn(off, true)
    expect(strip(asPerson)).toContain(t('conversation.sync.state.off'))
    expect(buttons(asPerson)).toContain(t('conversation.sync.turnOn'))
    expect(buttons(drawn(off, false))).not.toContain(t('conversation.sync.turnOn'))
  })

  it('3: with the sync on, offers the copy press to the person only, and draws every copy to an agent', () => {
    const asPerson = drawn(aReply(), true)
    expect(buttons(asPerson)).toContain(t('conversation.sync.run'))
    const asAgent = drawn(aReply(), false)
    expect(buttons(asAgent)).not.toContain(t('conversation.sync.run'))
    expect(strip(asAgent), 'the copies are hidden from a reader who is not the person').toContain('The Claude Code run')
  })

  it('4: the three doors are the read, the set and the run, each at its own path', async () => {
    const asked: { url: string; method: string; body: string }[] = []
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      asked.push({ url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? '') })
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      await api.conversationSync()
      await api.setConversationSync(true)
      await api.runConversationSync()
    } finally {
      globalThis.fetch = realFetch
    }
    expect(
      asked.map((one) => [new URL(one.url, 'http://127.0.0.1').pathname, one.method]),
      'the three doors the panel and its presses use',
    ).toEqual([
      ['/api/conversations/sync', 'GET'],
      ['/api/conversations/sync', 'POST'],
      ['/api/conversations/sync/run', 'POST'],
    ])
    expect(JSON.parse(asked[1]!.body), 'the set sends the one boolean and nothing else').toEqual({ enabled: true })
  })
})
