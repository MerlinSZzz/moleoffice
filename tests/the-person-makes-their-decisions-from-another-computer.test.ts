// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON MAKES THEIR DECISIONS FROM THEIR OTHER COMPUTER, AND NOBODY ELSE THERE DOES. By their decision of October
 * 2026, their decisions, appointments included, are theirs wherever they make them, and the only acts still refused to
 * another computer are those that act on this computer's own files, ports and processes. The
 * safeguards are the ones another decision set for their settings: their own key, an encrypted door, the act said on
 * their devices, and never an agent.
 * tests/the-person-sets-their-settings-from-another-computer.test.ts proves the settings half and holds the list of
 * doors that declare the widening.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. From the product's own second listener, with a paired device's key, the person gives a card, raises a secretary
 *      and ends the raise, retires an agent, revokes a key and undoes that, ends a credential and removes a trusted
 *      machine. Each is answered, and each is said to them as a line from the office.
 *   2. The doors whose work needs a record this test does not make (taking an act back, accepting a guess about code,
 *      committing and applying a plan) and naming the owner, who is named already, are let through to their own
 *      answers: not one of them meets the refusal for another computer.
 *   3. An agent's own key from the other computer meets that refusal at every one of those doors, and nothing is
 *      written: a starter may retire its agent here, and not from there.
 *   4. A keyless claim to be the person, from a machine the office trusts, meets it too while the window is open.
 *   5. Trusting a machine, confirming a credential and closing the key window stay on this computer even for the
 *      person's key, and nothing changes.
 *   6. The refusal carries one code, and a page draws it as one sentence and one press: the press opens the Settings
 *      section about other computers, and no Try again is drawn beside it, by point 3 of a
 *      decision.
 *   7. GET /api/access leaves the widened acts off the person's list from there, and the guarded act of taking an act
 *      back with them, and keeps the doors kept here on it.
 *
 * ---------------------------------------------------------------------------------------
 * REAL LISTENERS, AND MADE-UP NAMES
 * ---------------------------------------------------------------------------------------
 *
 * The second listener is `listenForOtherMachines` out of src/server/index.ts, as in the settings test. The device is
 * paired through the credential flow's own doors and confirmed on this computer. Every agent and address here is
 * made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, EACH AFTER A CONTROL RUN (the report of round 47 names each run)
 * ---------------------------------------------------------------------------------------
 *
 *   - the widening taken off the raise door's declaration: cases 1 and 7 go red;
 *   - the line to the person left out of the retire door: case 1 goes red;
 *   - the person's proof left out of the widening: cases 3 and 4 go red;
 *   - the widening declared on the trust door: cases 5 and 7 go red;
 *   - the code left off the hook's refusal: cases 3, 4, 5 and 6 go red;
 *   - the guards left on the person's list in GET /api/access: case 7 goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The line the office writes, and its first words. */
const THE_LINE = 'One of your acts was made from another computer'
/** The code the hook's refusal carries. */
const KEPT = 'keptOnTheOfficesComputer'

/** The person's headers on this computer, with no key: the one-version window answers them here. */
const THE_PERSON_HERE = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** What a caller on the other computer sends: a device's key makes it the person, so the claim says `agent`. */
const fromThere = (id: string, key: string | null): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(key === null ? {} : { 'x-mole-office-key': key }),
})

let t: TestDb
let app: FastifyInstance
let thisMachine = ''
let anotherMachine = ''
let otherMachines: Server
let deviceKey = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()

interface Answer { status: number; body: any; text: string }

async function ask(where: string, method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Answer> {
  const res = await fetch(`${where}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = null
  }
  return { status: res.status, body: parsed, text }
}

const theDevice = (): Record<string, string> => fromThere('a-made-up-laptop', deviceKey)

/** The office's lines to the person about an act made from another computer: what each names, oldest first. */
async function theLinesToThePerson(): Promise<{ id: string; what: string }[]> {
  const read = await ask(thisMachine, 'GET', '/api/records?kind=message&limit=200&shape=full', THE_PERSON_HERE)
  expect(read.status, read.text.slice(0, 300)).toBe(200)
  const records = (read.body?.records ?? []) as { id: string; data: { body?: string; saidInFull?: string; to?: { kind: string; id: string }[] } }[]
  return records
    .filter((one) => one.data.body === THE_LINE && (one.data.to ?? []).some((to) => to.kind === 'person' && to.id === THE_TEST_OFFICES_OWNER.id))
    .map((one) => ({ id: one.id, what: String(one.data.saidInFull ?? '').split(', from another computer.')[0]! }))
}

/** The card an agent holds now, read from its registry row. */
function cardOf(handle: string): string | null {
  const row = t.client.sqlite.prepare('SELECT role FROM agents WHERE id = ?').get(ids.get(handle)) as { role: string | null } | undefined
  return row?.role ?? null
}

function retired(handle: string): boolean {
  const row = t.client.sqlite.prepare('SELECT retired_at FROM agents WHERE id = ?').get(ids.get(handle)) as { retired_at: string | null } | undefined
  return row?.retired_at !== null && row?.retired_at !== undefined
}

function liveKeysOf(handle: string): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM held_keys WHERE whose_id = ? AND revoked_at IS NULL ORDER BY rowid').all(ids.get(handle)) as { id: string }[]).map((one) => one.id)
}

/** The refusal for another computer, as the reply carries it. */
function isTheKeptRefusal(answer: Answer): boolean {
  return answer.status === 403 && answer.body?.code === KEPT
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
  anotherMachine = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`

  // THE PERSON'S OTHER COMPUTER, PAIRED: it asks through the credential flow's own door and is confirmed here.
  const asked = await ask(thisMachine, 'POST', '/api/office/visitors', THE_PERSON_HERE, { device: 'A made-up laptop' })
  expect(asked.status, asked.text.slice(0, 300)).toBe(201)
  deviceKey = String(asked.body.token)
  const confirmed = await ask(thisMachine, 'POST', `/api/office/visitors/${String(asked.body.credential.id)}/confirm`, THE_PERSON_HERE, {})
  expect(confirmed.status, confirmed.text.slice(0, 300)).toBe(200)

  // FOUR MADE-UP AGENTS, each started by the person here: one to be given a card and raised, one to be retired, one
  // whose key is revoked, and one that asks from the other computer with its own key.
  for (const [handle, role] of [['test-wren', 'worker'], ['test-moss', 'worker'], ['test-fern', 'worker'], ['test-rook', 'worker']] as const) {
    const made = await ask(thisMachine, 'POST', '/api/agents/started', THE_PERSON_HERE, { handle, name: handle, role })
    expect(made.status, made.text.slice(0, 300)).toBe(201)
    keys.set(handle, String(made.body?.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(made.body?.agent?.id ?? ''))
  }
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => {
    otherMachines?.close(() => {
      done()
    })
  })
  await app?.close()
  t?.close()
})

describe('the person, from their other computer', () => {
  it('1: gives a card, raises and ends the raise, retires an agent, revokes a key and undoes it, ends a credential and removes a trusted machine, and each is said to them', async () => {
    const before = new Set((await theLinesToThePerson()).map((one) => one.id))

    const card = await ask(anotherMachine, 'POST', '/api/roles/card/test-wren', theDevice(), { role: 'secretary' })
    expect(card.status, card.text.slice(0, 300)).toBe(201)
    expect(cardOf('test-wren')).toBe('secretary')

    const raised = await ask(anotherMachine, 'POST', '/api/roles/elevation/test-wren', theDevice(), { reason: 'a made-up reason to raise it' })
    expect(raised.status, raised.text.slice(0, 300)).toBe(201)
    const lowered = await ask(anotherMachine, 'DELETE', '/api/roles/elevation/test-wren', theDevice())
    expect(lowered.status, lowered.text.slice(0, 300)).toBe(200)

    const retire = await ask(anotherMachine, 'POST', `/api/participants/agent/${ids.get('test-moss')!}/retire`, theDevice(), { because: 'A made-up agent the test no longer needs.' })
    expect(retire.status, retire.text.slice(0, 300)).toBe(200)
    expect(retired('test-moss')).toBe(true)

    const [fernsKey] = liveKeysOf('test-fern')
    expect(fernsKey, 'the made-up agent holds a key').toBeTruthy()
    const revoked = await ask(anotherMachine, 'POST', `/api/office/held-keys/${fernsKey!}/revoke`, theDevice(), {})
    expect(revoked.status, revoked.text.slice(0, 300)).toBe(200)
    expect(liveKeysOf('test-fern')).not.toContain(fernsKey)
    const undone = await ask(anotherMachine, 'POST', `/api/office/held-keys/${fernsKey!}/revoke/undo`, theDevice(), { revokedAt: revoked.body.revokedAt })
    expect(undone.status, undone.text.slice(0, 300)).toBe(200)
    expect(liveKeysOf('test-fern')).toContain(fernsKey)

    const another = await ask(thisMachine, 'POST', '/api/office/visitors', THE_PERSON_HERE, { device: 'A made-up tablet' })
    expect(another.status, another.text.slice(0, 300)).toBe(201)
    const ended = await ask(anotherMachine, 'POST', `/api/office/visitors/${String(another.body.credential.id)}/end`, theDevice(), {})
    expect(ended.status, ended.text.slice(0, 300)).toBe(200)

    const trusted = await ask(thisMachine, 'POST', '/api/office/trusted-machines', THE_PERSON_HERE, { address: '198.51.100.30' })
    expect(trusted.status, trusted.text.slice(0, 300)).toBe(200)
    const removed = await ask(anotherMachine, 'POST', `/api/office/trusted-machines/${String(trusted.body.machine.id)}/remove`, theDevice(), {})
    expect(removed.status, removed.text.slice(0, 300)).toBe(200)

    // EIGHT ACTS, EIGHT LINES, each naming the act. Compared as a set: lines written within one second carry one stamp.
    const lines = (await theLinesToThePerson()).filter((one) => !before.has(one.id))
    expect(lines.map((one) => one.what).sort()).toEqual(
      [
        '"test-wren" was given the secretary card',
        '"test-wren" was raised to act for you',
        'The raise of "test-wren" was ended',
        'The agent "test-moss" was retired',
        `The key ${fernsKey!} was revoked`,
        `The key ${fernsKey!} was brought back`,
        `The credential ${String(another.body.credential.id)} was ended`,
        'A machine was removed from the ones this office trusts',
      ].sort(),
    )
    for (const one of lines) expect(one.what).not.toContain('198.51.100')
  })

  // THE DOORS ASKED WITH A RECORD NOTHING HOLDS, so each answers in its own words; none of them meets the refusal for
  // another computer.
  const LET_THROUGH: [string, string, unknown][] = [
    ['POST', '/api/records/test-no-such-record/revisions/1/revoke', undefined],
    ['POST', '/api/implementation/test-no-such-row/accept', undefined],
    ['POST', '/api/planning/intents/test-no-such-intent/commit', undefined],
    ['POST', '/api/planning/proposals/test-no-such-proposal/apply', undefined],
    ['POST', '/api/office/owner', { name: 'A made-up name' }],
  ]

  it('2: lets the person through to the doors of the other decisions, which answer in their own words', async () => {
    for (const [method, path, body] of LET_THROUGH) {
      const answer = await ask(anotherMachine, method, path, theDevice(), body)
      expect(isTheKeptRefusal(answer), `${method} ${path}: ${answer.text.slice(0, 300)}`).toBe(false)
      expect(answer.status, `${method} ${path}: ${answer.text.slice(0, 300)}`).toBeGreaterThanOrEqual(400)
    }
  })

  it("3: refuses an agent's own key from the other computer at every one of those doors, and writes nothing", async () => {
    const rook = fromThere('test-rook', keys.get('test-rook')!)
    const lines = (await theLinesToThePerson()).length
    const asked: [string, string, unknown][] = [
      ['POST', '/api/roles/card/test-fern', { role: 'secretary' }],
      ['POST', '/api/roles/elevation/test-wren', { reason: 'an agent asks for a raise' }],
      ['DELETE', '/api/roles/elevation/test-wren', undefined],
      ['POST', `/api/participants/agent/${ids.get('test-fern')!}/retire`, { because: 'An agent tries to retire another.' }],
      ['POST', `/api/office/held-keys/${liveKeysOf('test-fern')[0]!}/revoke`, {}],
      ...LET_THROUGH,
    ]
    for (const [method, path, body] of asked) {
      const answer = await ask(anotherMachine, method, path, rook, body)
      expect(isTheKeptRefusal(answer), `${method} ${path}: ${answer.text.slice(0, 300)}`).toBe(true)
    }
    expect(cardOf('test-fern')).toBe('worker')
    expect(retired('test-fern')).toBe(false)
    expect(liveKeysOf('test-fern')).toHaveLength(1)
    expect((await theLinesToThePerson()).length).toBe(lines)
  })

  it('4: refuses a keyless claim to be the person from a trusted machine, while the window is open', async () => {
    const TRUSTED = '198.51.100.9'
    const { trustThisMachine } = await import('../src/server/lib/trustedmachines.ts')
    trustThisMachine(TRUSTED, null, 'a press', 'the test trusted this machine', null)
    const window = await ask(thisMachine, 'GET', '/api/office/key-window', THE_PERSON_HERE)
    expect(window.body?.open, window.text.slice(0, 200)).toBe(true)
    const claim = { ...THE_PERSON_HERE, 'x-forwarded-for': TRUSTED }
    const card = await ask(anotherMachine, 'POST', '/api/roles/card/test-fern', claim, { role: 'secretary' })
    expect(isTheKeptRefusal(card), card.text.slice(0, 300)).toBe(true)
    const retire = await ask(anotherMachine, 'POST', `/api/participants/agent/${ids.get('test-fern')!}/retire`, claim, { because: 'A claim tries to retire it.' })
    expect(isTheKeptRefusal(retire), retire.text.slice(0, 300)).toBe(true)
    expect(cardOf('test-fern')).toBe('worker')
    expect(retired('test-fern')).toBe(false)
  })

  it('5: keeps trusting a machine, confirming a credential and closing the key window on this computer, even for the person', async () => {
    const trust = await ask(anotherMachine, 'POST', '/api/office/trusted-machines', theDevice(), { address: '198.51.100.40' })
    expect(isTheKeptRefusal(trust), trust.text.slice(0, 300)).toBe(true)
    const list = await ask(thisMachine, 'GET', '/api/office/trusted-machines', THE_PERSON_HERE)
    expect(list.text).not.toContain('198.51.100.40')

    const waiting = await ask(thisMachine, 'POST', '/api/office/visitors', THE_PERSON_HERE, { device: 'A made-up phone' })
    expect(waiting.status, waiting.text.slice(0, 300)).toBe(201)
    const confirm = await ask(anotherMachine, 'POST', `/api/office/visitors/${String(waiting.body.credential.id)}/confirm`, theDevice(), {})
    expect(isTheKeptRefusal(confirm), confirm.text.slice(0, 300)).toBe(true)
    const still = await ask(thisMachine, 'GET', `/api/office/visitors/${String(waiting.body.credential.id)}`, THE_PERSON_HERE)
    expect(still.body?.credential?.confirmedAt ?? null, still.text.slice(0, 300)).toBe(null)

    const close = await ask(anotherMachine, 'POST', '/api/office/key-window/close', theDevice(), {})
    expect(isTheKeptRefusal(close), close.text.slice(0, 300)).toBe(true)
    const window = await ask(thisMachine, 'GET', '/api/office/key-window', THE_PERSON_HERE)
    expect(window.body?.open, window.text.slice(0, 200)).toBe(true)
  })

  it('6: a page draws the refusal as one sentence and one press, with no Try again', async () => {
    const answer = await ask(anotherMachine, 'POST', '/api/office/key-window/close', theDevice(), {})
    expect(isTheKeptRefusal(answer), answer.text.slice(0, 300)).toBe(true)
    // THE ENGLISH REPLY IS KEPT for an agent and Developer mode: it names the act and where it is done.
    expect(answer.body.error).toContain('Closing the key window')
    const store = new Map<string, string>()
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    }
    const { readFault } = await import('../src/web/api.ts')
    const ui = await import('../src/web/components/ui.tsx')
    const { setWordLanguage, t: word } = await import('../src/shared/i18n.ts')
    const { settingsPath } = await import('../src/shared/addresses.ts')
    const fault = readFault(403, '/api/office/key-window/close', answer.body)
    try {
      for (const lang of ['en', 'zh'] as const) {
        setWordLanguage(lang)
        const html = renderToStaticMarkup(h(ui.ErrorNote, { message: fault.message, fault, retry: () => undefined }))
        const text = html.replace(/<[^>]+>/g, ' ')
        expect(text, lang).toContain(word('server.keptOnTheOfficesComputer'))
        expect(text, lang).not.toContain('Closing the key window')
        const presses = [...html.matchAll(/<(a|button)\b[^>]*>(.*?)<\/\1>/g)]
        expect(presses.map((one) => one[2]), lang).toEqual([word('keptHere.press')])
        expect(html, lang).toContain(`href="#${settingsPath('settings.access')}"`)
      }
    } finally {
      setWordLanguage('en')
    }
  })

  it("7: GET /api/access leaves the person's decisions off their list from there, and keeps the doors kept here", async () => {
    const routesOf = (body: any): string[] => ((body?.caller?.refusedHere ?? []) as { routes: string[] }[]).flatMap((one) => one.routes)
    const theirs = await ask(anotherMachine, 'GET', '/api/access', theDevice())
    expect(theirs.status, theirs.text.slice(0, 300)).toBe(200)
    const anAgents = await ask(anotherMachine, 'GET', '/api/access', fromThere('test-rook', keys.get('test-rook')!))
    expect(anAgents.status, anAgents.text.slice(0, 300)).toBe(200)
    for (const route of ['POST /api/roles/card/:handle', 'POST /api/roles/elevation/:handle', 'POST /api/participants/agent/:id/retire', 'POST /api/records/:id/revisions/:seq/revoke']) {
      expect(routesOf(theirs.body), `${route} is listed as refused to the person`).not.toContain(route)
      expect(routesOf(anAgents.body), `${route} is not listed as refused to an agent`).toContain(route)
    }
    for (const route of ['POST /api/office/trusted-machines', 'POST /api/office/visitors/:id/confirm', 'POST /api/office/key-window/close']) {
      expect(routesOf(theirs.body), `${route} is not listed as refused to the person`).toContain(route)
    }
  })
})
