// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROUTED LINE ("… could not be reached when this was sent") IS DRAWN IN THE PAGE LANGUAGE.
 * Problem t_ox8XMOvu7a.
 *
 * When a message's addressee cannot be reached, the office stores one `routed` entry on the message,
 * with a finished English `line`. The chat drew that stored line word for word, so a Chinese page
 * showed English. Now the entry also stores what the line was built from (`said`), and the page
 * builds the line again from it, with the same builder, in the page language. The stored `line` stays
 * English, because an agent reads it.
 *
 * WHAT IS PROVED
 *   1. A send to an agent nothing is answering as stores `said` beside `line`, and under Node the
 *      builder makes exactly the stored line from it.
 *   2. The chat's RoutedLine component, rendered as a browser would with the page set to Chinese,
 *      draws the Chinese line and none of the English.
 *   3. Every ending builds a line under Node that is the English it always was, and a Chinese line
 *      with no English word in it in a Chinese browser.
 *   4. An entry stored before `said` existed is drawn from its English line; a malformed `said` is
 *      dropped and the entry is kept.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the routing stops storing `said`                  → cases 1 and 2
 *   the component draws the stored `line` again       → case 2
 *   the builder writes an English sentence in code    → cases 2, 3 and 4
 *   routedOf stops carrying `said` to the page        → cases 1, 2 and 4
 *
 * Nothing here opens ./data/panelx.db: `freshDb` in tests/helpers.ts makes a throwaway database.
 */

import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { setWordLanguage } from '../src/shared/i18n.ts'
import { breaksTheSpacing } from '../src/shared/spacing.ts'
import {
  routedOf,
  theRoutedLine,
  theRoutedLineToDraw,
  type RoutedAddressee,
  type TheRoutedLineSaid,
} from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { RoutedLine } from '../src/web/components/RoutedLine.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const WS = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

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

/** Words that would only be on the page if an English sentence were drawn. */
const ENGLISH = /could not be reached|passed over|chain of starters|Mole Office also gave|no copy was made|secretary|retired|answering/

const EVERY_ENDING: readonly { said: TheRoutedLineSaid; english: string }[] = [
  {
    said: { addressee: 'Kiln', was: 'retired', passedOver: [{ name: 'Glaze', was: 'nothing answering' }], ending: { how: 'a starter', reached: 'Shelf' } },
    english:
      'Kiln could not be reached when this was sent: it is retired. ' +
      'Glaze was passed over: nothing Mole Office can see is answering as it. ' +
      "Mole Office also gave it to Shelf, the first one up Kiln's chain of starters who could be reached.",
  },
  {
    said: { addressee: 'Kiln', was: 'nothing answering', passedOver: [], ending: { how: 'a starter it could not tell about', reached: 'Shelf' } },
    english:
      'Kiln could not be reached when this was sent: nothing Mole Office can see is answering as it. ' +
      "Mole Office also gave it to Shelf, the first one up Kiln's chain of starters not known to be unreachable. " +
      'Mole Office could not tell whether Shelf is answering.',
  },
  {
    said: { addressee: 'Kiln', was: 'retired', passedOver: [], ending: { how: 'the sender' } },
    english:
      'Kiln could not be reached when this was sent: it is retired. ' +
      'You are the first one up its chain of starters who can be reached, so no copy was made when it was sent.',
  },
  {
    said: { addressee: 'Kiln', was: 'retired', passedOver: [], ending: { how: 'the owner is the sender', ending: { how: 'a loop', owner: THE_TEST_OFFICES_OWNER.name } } },
    english:
      'Kiln could not be reached when this was sent: it is retired. ' +
      "Kiln's chain of starters goes round, and you are the owner, so no copy was made when it was sent.",
  },
  {
    said: { addressee: 'Kiln', was: 'retired', passedOver: [], ending: { how: 'no secretary', owner: THE_TEST_OFFICES_OWNER.name } },
    english:
      'Kiln could not be reached when this was sent: it is retired. ' +
      `No secretary is in Kiln's chain of starters, so Mole Office also gave it to ${THE_TEST_OFFICES_OWNER.name}.`,
  },
  {
    said: { addressee: 'Kiln', was: 'retired', passedOver: [], ending: { how: 'nobody reachable', owner: THE_TEST_OFFICES_OWNER.name } },
    english:
      'Kiln could not be reached when this was sent: it is retired. ' +
      `Nobody up Kiln's chain of starters could be reached, the secretary included, so Mole Office also gave it to ${THE_TEST_OFFICES_OWNER.name}.`,
  },
  {
    said: { addressee: 'Kiln', was: 'retired', passedOver: [], ending: { how: 'nobody started', owner: THE_TEST_OFFICES_OWNER.name, stoppedAt: 'Glaze' } },
    english:
      'Kiln could not be reached when this was sent: it is retired. ' +
      `Nobody recorded who started Glaze, so Mole Office also gave it to ${THE_TEST_OFFICES_OWNER.name}.`,
  },
  {
    said: { addressee: 'Kiln', was: 'retired', passedOver: [], ending: { how: 'a name no single agent answers', owner: THE_TEST_OFFICES_OWNER.name } },
    english:
      'Kiln could not be reached when this was sent: it is retired. ' +
      `A starter in Kiln's chain is a name no single agent answers to, so Mole Office also gave it to ${THE_TEST_OFFICES_OWNER.name}.`,
  },
  {
    said: { addressee: 'Kiln', was: 'retired', passedOver: [], ending: { how: 'the addressee holds the secretary card', owner: THE_TEST_OFFICES_OWNER.name } },
    english:
      'Kiln could not be reached when this was sent: it is retired. ' +
      `Kiln holds the secretary card, so Mole Office also gave it to ${THE_TEST_OFFICES_OWNER.name}.`,
  },
]

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** Send one message from the person to an agent nothing is answering as, and read its stored routed entries. */
let agentNumber = 0
async function aRoutedMessage(): Promise<readonly RoutedAddressee[]> {
  agentNumber += 1
  const handle = `kiln-watcher-${String(agentNumber)}`
  t.api.createRecord({
    workspaceId: WS,
    kind: 'agent',
    title: 'Kiln Watcher',
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: 'The kiln', data: { to: [{ kind: 'agent', id: row.id }], body: 'Is the kiln still hot?' } },
  })
  // THE UNHELD 409 (decision 60sbc5I-bwKx). The send is the person's to an agent nothing holds,
  // so the door answers the error now; the stored record and its routed line are what this file
  // reads, and they are unchanged.
  expect(reply.statusCode, reply.body).toBe(409)
  const id = (reply.json() as { record: { id: string } }).record.id
  const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return routedOf(JSON.parse(stored.data) as Record<string, unknown>)
}

describe('the routed line is drawn in the page language', () => {
  it('stores what the line was built from, and the builder makes the stored line from it under Node', async () => {
    const routed = await aRoutedMessage()
    expect(routed).toHaveLength(1)
    const entry = routed[0]!
    expect(entry.line).toContain('could not be reached when this was sent')
    expect(entry.said).toBeDefined()
    expect(theRoutedLine(entry.said!)).toBe(entry.line)
    expect(theRoutedLineToDraw(entry)).toBe(entry.line)
  })

  it('draws the Chinese line in the chat on a Chinese page', async () => {
    const routed = await aRoutedMessage()
    // The person sent it, and the owner is the sender, so the entry is written to the sender: draw it for the owner.
    const drawn = inAChineseBrowser(() =>
      renderToStaticMarkup(h(RoutedLine, { routed, viewer: { kind: 'person', id: THE_PERSON }, sentBy: { kind: 'person', id: THE_PERSON } })),
    )
    expect(drawn).toContain('发送时联系不上')
    expect(drawn).not.toMatch(ENGLISH)
  })

  it('builds every ending in English under Node and in Chinese in a Chinese browser', () => {
    for (const one of EVERY_ENDING) {
      setWordLanguage('zh')
      try {
        expect(theRoutedLine(one.said)).toBe(one.english)
      } finally {
        setWordLanguage('en')
      }
      const chinese = inAChineseBrowser(() => theRoutedLine(one.said))
      expect(chinese, one.english).toContain('发送时联系不上 Kiln')
      expect(chinese, one.english).not.toMatch(ENGLISH)
      // A LATIN NAME IS SPACED FROM THE CHINESE AROUND IT, by the one spacing rule (src/shared/spacing.ts).
      expect(breaksTheSpacing(chinese), chinese).toEqual([])
    }
  })

  it('draws an entry stored before said existed from its English line, and keeps an entry whose said is malformed', () => {
    const base = { for: { kind: 'agent', id: 'a1' }, because: 'It is retired.', to: null, passedOver: [], line: 'Kiln could not be reached.' }
    const [old, broken, whole] = routedOf({
      routed: [base, { ...base, said: { addressee: 'Kiln', was: 'asleep', passedOver: [], ending: { how: 'the sender' } } }, { ...base, said: EVERY_ENDING[2]!.said }],
    })
    expect(old!.said).toBeUndefined()
    expect(broken!.said).toBeUndefined()
    expect(whole!.said).toEqual(EVERY_ENDING[2]!.said)
    expect(inAChineseBrowser(() => theRoutedLineToDraw(old!))).toBe('Kiln could not be reached.')
    expect(inAChineseBrowser(() => theRoutedLineToDraw(whole!))).not.toMatch(ENGLISH)
  })
})
