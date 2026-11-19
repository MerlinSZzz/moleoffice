// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ROW IN THE EMBASSY'S LIST LEADS TO A PAGE THAT EXISTS. Problem dOhkq6Nrbq2b.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * After a page refresh, the visitor group was gone and the new row showed no role card. A credential
 * was confirmed from another machine, a press opened
 * the new row, and the page said the agent did not exist.
 *
 * MEASURED on 8 September 2026 on a fresh database, and it is not what the problem record guessed:
 *
 *   · a credential's row carries the HANDLE it asked under as its id, in the credential loop of
 *     src/server/api/office.ts;
 *   · the profile route reads the registry by that id, and a credential creates no registry row at
 *     all — `confirmACredential` writes the credential's standing and nothing else;
 *   · so `GET /api/participants/agent/<handle>/profile` answered 404 BEFORE the confirm and again
 *     AFTER it. There is no moment in between when it worked.
 *
 * What the owner read as "until a refresh" was the owner’s Codex session registering itself in the meantime, which
 * is what made the registry row exist.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS FIXED HERE, AND WHAT IS LEFT FOR THE ROUND AFTER
 * ---------------------------------------------------------------------------------------
 *
 * A row no registry here holds now leads to the credential that is all the office knows of it. That
 * page exists and it holds every fact there is about that caller. A profile for an agent nobody has
 * registered cannot exist, and inventing one would be inventing a citizen.
 *
 * WHAT IS LEFT: confirming still creates no agent record and no registry row, so a confirmed
 * credential is not a citizen with a page of its own. That is round perm-5b — *confirm writing the
 * record with the card* — and it is deliberately not done here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The Embassy is drawn with a credential waiting and one confirmed, every address in the list is
 * taken off the page, and each is asked for. None answers 404.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `wherePressingTheRowGoes` in src/web/pages/EmbassyPage.tsx always answer `whoPath(...)`
 *   and the confirmed credential's row leads to a profile that answers 404.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'

type EmbassyModule = typeof import('../src/web/pages/EmbassyPage.tsx')

let t: TestDb
let app: FastifyInstance
let ep: EmbassyModule

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function embassy(): Promise<WhatTheEmbassySays> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheEmbassySays
}

async function askForACredential(handle: string, role: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/office/visitors',
    headers: AS_THE_PERSON,
    payload: { handle, name: `${handle} on the other machine`, role, conversationPath: `/tmp/${handle}.jsonl` },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(((reply.json() as Record<string, unknown>)['credential'] as Record<string, unknown>)['id'])
}

/**
 * WHAT THE PAGE BEHIND ONE ADDRESS ASKS THE SERVER FOR.
 *
 * The two addresses a row can carry, and the one read each page makes. It is written out here
 * because a test that only checked the addresses were well formed would have passed on the day the owner
 * met this: the address was fine and the page behind it was not there.
 */
function whatThatPageReads(address: string): string {
  const who = /^#\/who\/([^/]+)\/(.+)$/.exec(address)
  if (who !== null) return `/api/participants/${who[1] ?? ''}/${who[2] ?? ''}/profile`
  const visitor = /^#\/visitor\/(.+)$/.exec(address)
  if (visitor !== null) return `/api/office/visitors/${visitor[1] ?? ''}`
  throw new Error(`A row leads to "${address}", which is neither a citizen's page nor a credential's.`)
}

/** Every address the drawn list leads to. */
function addressesOn(page: string): string[] {
  return [...page.matchAll(/href="([^"]*)"/g)]
    .map((one) => one[1] ?? '')
    .filter((one) => one.startsWith('#/who/') || one.startsWith('#/visitor/'))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  // ONE STILL WAITING, AND ONE THE OWNER HAS LET IN. The second is the row the owner pressed.
  await askForACredential('codex-waiting', 'worker')
  const confirmed = await askForACredential('codex-let-in', 'supervisor')
  const said = await app.inject({
    method: 'POST',
    url: `/api/office/visitors/${confirmed}/confirm`,
    headers: AS_THE_PERSON,
    payload: {},
  })
  expect(said.statusCode, said.body).toBe(200)

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
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_PERSON }))
  ep = (await import('../src/web/pages/EmbassyPage.tsx')) as EmbassyModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('every row the Embassy draws', () => {
  it('leads to a page that answers', async () => {
    const said = await embassy()
    // EVERYBODY, not only the reader's contacts, because a row hidden behind the press is still a
    // row and the owner will press it the moment they open it.
    const page = renderToStaticMarkup(h(ep.TheEmbassy, { said: { ...said, rows: said.rows } }))
    const addresses = addressesOn(page)
    expect(addresses.length, 'the list drew nothing, so this is measuring nothing').toBeGreaterThan(2)
    const dead: string[] = []
    for (const address of addresses) {
      const reply = await app.inject({ method: 'GET', url: whatThatPageReads(address), headers: AS_THE_PERSON })
      if (reply.statusCode !== 200) dead.push(`${address} -> ${String(reply.statusCode)} ${reply.body.slice(0, 90)}`)
    }
    expect(dead, 'a row leading to a page that is not there').toEqual([])
  })

  /**
   * WHAT THIS MEASURED UNTIL 8 SEPTEMBER 2026, AND WHY IT CHANGED.
   *
   * It measured that a PENDING credential's row — one no registry holds — is drawn with the
   * credential as its address, because the credential is all the office knows of it. That is still
   * true and is still measured, on a row that has not been confirmed.
   *
   * It used to measure it on `codex-let-in`, which HAS been confirmed. Criterion P81 makes a confirm
   * write the agent record and its row, so a confirmed credential is a citizen and its address is
   * the citizen's page. `codex-waiting` is the pending row this case is now about.
   */
  it('sends a row no registry holds to the credential that is all the office knows of it', async () => {
    const said = await embassy()
    const page = renderToStaticMarkup(h(ep.TheEmbassy, { said }))
    const row = said.rows.find((one) => one.who.id === 'codex-waiting')
    expect(row, 'the waiting credential is a row in the list').toBeDefined()
    expect(row?.registered, 'and no registry here holds it, which is what makes this the case').toBe(false)
    expect(page, 'so its address is the credential').toContain(`#/visitor/${String(row?.credential)}`)
  })

  /**
   * WHAT THIS MEASURED UNTIL 8 SEPTEMBER 2026. perm-5a left it here with its own sentence saying so:
   * confirming wrote the credential's standing and nothing else, so a confirmed credential had no
   * citizen and its page answered 404. That was the open half of problem dOhkq6Nrbq2b.
   *
   * Criterion P81 closes it: the confirm writes the agent record and its row in the same press, so
   * the page answers. That is what this measures now.
   */
  it('has a citizen for a confirmed credential, which closes dOhkq6Nrbq2b', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: '/api/participants/agent/codex-let-in/profile',
      headers: AS_THE_PERSON,
    })
    expect(reply.statusCode).toBe(200)
    expect(reply.body).not.toContain('No agent in this installation answers to')
  })
})
