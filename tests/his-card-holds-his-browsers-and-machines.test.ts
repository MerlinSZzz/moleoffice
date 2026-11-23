// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HIS ONE PERSON CARD HOLDS HIS BROWSERS AND THE MACHINES THE OFFICE TRUSTS. Design C of early idea B9.
 *
 * Before this, his browsers were drawn in three places: as device rows and asks on the Embassy, on the
 * credential page each row opened, and the machines this office trusts on the Worlds page. Design C makes
 * his person card the one place for them, and the old pages lead there. Nothing stored changes, and every
 * check stays at its door.
 *
 * WHAT THIS FILE HOLDS, against a made-up office and the real doors:
 *
 *   1. THE EMBASSY DOOR FOLDS HIS BROWSERS INTO HIS ONE ROW. A page of the Embassy draws no device row
 *      and no device ask. His row carries how many browsers he has and how many wait. The whole answer
 *      and a `row` read still answer a device's row, because the card's key press reads it there.
 *   2. THE EMBASSY PAGE DRAWS THAT ROW with the two counts and a link to his card, and its asking panel
 *      holds the agents' asks only.
 *   3. THE CARD'S PART, drawn from the real replies of GET /api/office/visitors and GET
 *      /api/office/trusted-machines: the waiting asks with both presses (and A1: no Confirm where no key
 *      works), each browser with its row, "this browser" on exactly one, the machines with Remove and
 *      Trust a machine, and the note under each press the office keeps on its own computer.
 *   4. A REFUSED READ IS SAID, never drawn as an empty list.
 *   5. THE ADDRESS OF ONE BROWSER'S ROW on his card, and what an old credential address opens.
 *   6. THE PAIRING PAGE: paired leads to his card, and the waiting sentence is a new word of this line.
 *   7. THE WORDS THAT NAME A PAGE THAT MOVED: the device ask's reply and the refusals of the presses that
 *      moved name his card.
 *
 * The page-level half (the part's place on his card, a press on a row, the old addresses in a real
 * browser) is in his-card-holds-his-browsers-in-the-browser.test.ts.
 *
 * Every credential, name and machine here is made up by this file.
 */

import { dirname, join } from 'node:path'
import { Fragment, createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { EmbassyRow, WhatTheEmbassySays } from '../src/shared/worlds.ts'
import type { VisitorCredential } from '../src/shared/visitors.ts'
import type { WhatTheOfficeTrusts } from '../src/shared/trustedmachines.ts'

let office: TestDb
let app: FastifyInstance
let person: Record<string, string> = {}
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-made-up-asker',
}

/** The made-up credentials, by what each is for. */
const made = { paired: '', waiting: '', ended: '', agentAsk: '' }
const PAIRED = 'Made-up kitchen tablet'
const WAITING = 'Made-up garden phone'
const ENDED = 'Made-up old laptop'
const AGENT = 'Made-up heron visitor'

/**
 * A DRAWN SENTENCE AS THE MARKUP WRITES IT. renderToStaticMarkup escapes an apostrophe, `&`, `<`, `>`
 * and `"` in text, so a sentence that holds one is not in the markup as it is written in the words.
 * This draws the sentence alone through the same renderer, so React says how it writes it and the
 * test copies no escape of its own. Every look for a drawn sentence with such a letter goes through it.
 */
function asDrawn(words: string): string {
  return renderToStaticMarkup(h(Fragment, null, words))
}

type PageReply = WhatTheEmbassySays & { rowsTotal: number; hidden?: number }

async function call(
  method: 'GET' | 'POST',
  url: string,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = person,
): Promise<{ status: number; body: Record<string, any>; text: string }> {
  const answer = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  const text = answer.body.replace(/[0-9a-f]{64}/g, '<a key>')
  return { status: answer.statusCode, body: JSON.parse(answer.body) as Record<string, any>, text }
}

async function aDeviceAsks(name: string): Promise<{ id: string; says: string }> {
  const asked = await call('POST', '/api/office/visitors', { device: name }, AS_AN_AGENT)
  expect(asked.status, asked.text).toBe(201)
  return { id: String(asked.body.credential.id), says: String(asked.body.says ?? '') }
}

let deviceAskSays = ''

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(dirname(office.file), 'keys.json')),
  }
  // ONE BROWSER PAIRED: it asked and he confirmed it, so it holds a key.
  const paired = await aDeviceAsks(PAIRED)
  made.paired = paired.id
  deviceAskSays = paired.says
  const confirmed = await call('POST', `/api/office/visitors/${made.paired}/confirm`)
  expect(confirmed.status, confirmed.text).toBe(200)
  // ONE BROWSER WAITING for his press.
  made.waiting = (await aDeviceAsks(WAITING)).id
  // ONE BROWSER ENDED after it was paired.
  made.ended = (await aDeviceAsks(ENDED)).id
  expect((await call('POST', `/api/office/visitors/${made.ended}/confirm`)).status).toBe(200)
  const ended = await call('POST', `/api/office/visitors/${made.ended}/end`)
  expect(ended.status, ended.text).toBe(200)
  // AND ONE AGENT ASKING, whose ask stays on the Embassy.
  const agent = await call('POST', '/api/office/visitors', {
    handle: 'made-up-heron', name: AGENT, role: 'worker', conversationPath: '/tmp/made-up-heron.jsonl',
  }, AS_AN_AGENT)
  expect(agent.status, agent.text).toBe(201)
  made.agentAsk = String(agent.body.credential.id)
  // ONE MACHINE THIS OFFICE TRUSTS, added by a press.
  const machine = await call('POST', '/api/office/trusted-machines', { address: 'made-up-box.test', note: 'made up' })
  expect(machine.status, machine.text).toBe(200)
}, 60_000)

afterAll(async () => {
  await app?.close()
  office?.close()
})

describe('1. the Embassy door folds his browsers into his one row', () => {
  it('draws no device row and no device ask on a page, and his row carries the two counts', async () => {
    const first = await call('GET', '/api/office/embassy?shape=page&everyone=1&retired=1&limit=200')
    expect(first.status, first.text).toBe(200)
    const page = first.body as PageReply
    expect(page.rows.filter((one) => one.device), 'no device row on a page').toEqual([])
    expect(page.visitors.map((one) => one.id), 'the agent asks and no browser asks').toEqual([made.agentAsk])
    const his = page.rows.find((one) => one.who.kind === 'person' && one.who.id === THE_PERSON)
    expect(his, 'his own row is on the page').toBeDefined()
    expect(his?.hisBrowsers, 'one paired and one waiting; the ended one is not counted').toEqual({ paired: 1, waiting: 1 })
    // AND THE DEFAULT PAGE DRAWS HIS ROW TOO, because it carries a count to press.
    const plain = (await call('GET', '/api/office/embassy?shape=page&limit=200')).body as PageReply
    const hisOnThePlainPage = plain.rows.some((one) => one.who.kind === 'person' && one.who.id === THE_PERSON)
    expect(hisOnThePlainPage, 'his row on the default page').toBe(true)
    expect(plain.rows.filter((one) => one.device)).toEqual([])
  })

  it('keeps the device rows in the whole answer and in a row read, which the card reads its keys from', async () => {
    const whole = (await call('GET', '/api/office/embassy')).body as WhatTheEmbassySays
    const devices = whole.rows.filter((one) => one.device)
    expect(devices.map((one) => one.credential).sort(), 'the whole answer still names every browser that asked').toEqual(
      [made.paired, made.waiting, made.ended].sort(),
    )
    const one = await call('GET', `/api/office/embassy?shape=page&row=${encodeURIComponent(`credential:${made.paired}`)}`)
    expect(one.status, one.text).toBe(200)
    const row = (one.body as PageReply).rows[0] as EmbassyRow | undefined
    expect(row?.credential, 'the row read answers the paired browser').toBe(made.paired)
    expect(row?.heldKeys.length, 'with its key').toBe(1)
  })

  it('counts his browsers in one place, which the door and the card both read', async () => {
    const { hisBrowsersIn } = await import('../src/shared/worlds.ts')
    const listed = (await call('GET', '/api/office/visitors')).body as { credentials: VisitorCredential[] }
    const counted = hisBrowsersIn(listed.credentials)
    expect(counted.waiting.map((one) => one.id)).toEqual([made.waiting])
    expect(counted.paired.map((one) => one.id)).toEqual([made.paired])
    expect(counted.ended.map((one) => one.id)).toEqual([made.ended])
    const everyOne = [...counted.waiting, ...counted.paired, ...counted.ended].map((one) => one.id)
    expect(everyOne, 'no agent').not.toContain(made.agentAsk)
  })
})

describe('2. the Embassy page draws his row with the counts and a link to his card', () => {
  it('draws no device row, the two counts on his row, and the agents\' asks only', async () => {
    const ep = await import('../src/web/pages/EmbassyPage.tsx')
    const { hrefOf, whoPath } = await import('../src/web/components/router.tsx')
    const said = (await call('GET', '/api/office/embassy?shape=page&limit=200')).body as PageReply
    const page = renderToStaticMarkup(h(ep.TheEmbassy, { said }))
    expect(page, 'no device row').not.toContain('data-device="yes"')
    const rows = page.split('<li class="emb-row"').slice(1)
    const his = rows.filter((one) => one.includes(`href="${hrefOf(whoPath('person', THE_PERSON))}"`))
    expect(his, 'one row opens his card').toHaveLength(1)
    expect(his[0], 'and says how many browsers he has').toContain(ep.EMBASSY_WORDS.hisBrowsers(1))
    expect(his[0], 'and how many wait').toContain(ep.EMBASSY_WORDS.hisBrowsersWaiting(1))
    const asks = page.split('<li class="emb-row emb-asking-card"').slice(1)
    expect(asks.filter((one) => one.includes(AGENT)), 'the agent asks on the Embassy').toHaveLength(1)
    expect(page, 'and no browser asks there').not.toContain(WAITING)
  })

  it('draws the whole answer the same way: a hand-made or older reply drops the device rows too', async () => {
    const ep = await import('../src/web/pages/EmbassyPage.tsx')
    const whole = (await call('GET', '/api/office/embassy')).body as WhatTheEmbassySays
    const page = renderToStaticMarkup(h(ep.TheEmbassy, { said: whole }))
    expect(page).not.toContain('data-device="yes"')
    expect(page).not.toContain(PAIRED)
    expect(page).not.toContain(WAITING)
    expect(page).toContain(AGENT)
  })
})

describe('3. the part on his card', () => {
  async function theReplies(): Promise<{ credentials: VisitorCredential[]; trusted: WhatTheOfficeTrusts }> {
    const listed = await call('GET', '/api/office/visitors')
    expect(listed.status, listed.text).toBe(200)
    const trusted = await call('GET', '/api/office/trusted-machines')
    expect(trusted.status, trusted.text).toBe(200)
    return {
      credentials: (listed.body as { credentials: VisitorCredential[] }).credentials,
      trusted: trusted.body as WhatTheOfficeTrusts,
    }
  }

  async function drawn(options: {
    credentials?: VisitorCredential[]
    thisBrowser?: string | null
    row?: string | null
    refused?: boolean
  } = {}): Promise<string> {
    const part = await import('../src/web/components/YourBrowsersAndMachines.tsx')
    const replies = await theReplies()
    return renderToStaticMarkup(h(part.TheBrowsersAndMachines, {
      visitors: options.refused === true
        ? { status: 'error', message: 'This read was refused in a made-up test.', fault: null }
        : { status: 'ready', value: options.credentials ?? replies.credentials },
      trusted: { status: 'ready', value: replies.trusted },
      thisBrowser: options.thisBrowser ?? null,
      row: options.row ?? null,
      onChanged: () => {},
    }))
  }

  /** The `<li>` of one browser, by the credential it holds, or null where none is drawn. */
  function rowOf(page: string, id: string): string | null {
    const at = page.indexOf(`data-browser="${id}"`)
    if (at < 0) return null
    const end = page.indexOf('</li>', at)
    return page.slice(at, end < 0 ? undefined : end)
  }

  it('draws the waiting ask on an Embassy asking card, with both presses, and nothing of the agent\'s', async () => {
    const ep = await import('../src/web/pages/EmbassyPage.tsx')
    const page = await drawn()
    const asks = page.split('<li class="emb-row emb-asking-card"').slice(1)
    expect(asks, 'one ask, the browser\'s').toHaveLength(1)
    expect(asks[0]).toContain(WAITING)
    expect(asks[0], 'the press that lets it in').toContain(ep.EMBASSY_WORDS.confirm)
    expect(asks[0], 'the press that refuses it').toContain(ep.EMBASSY_WORDS.refuse)
    expect(page, 'an agent\'s ask is not his browser').not.toContain(AGENT)
  })

  it('draws A1 where it is drawn today: a browser from a copy without its key has no Confirm', async () => {
    const ep = await import('../src/web/pages/EmbassyPage.tsx')
    const { credentials } = await theReplies()
    const withoutAKey = credentials.map((one) => (one.id === made.waiting ? { ...one, tokenRemoved: true } : one))
    const asks = (await drawn({ credentials: withoutAKey })).split('<li class="emb-row emb-asking-card"').slice(1)
    expect(asks).toHaveLength(1)
    expect(asks[0], 'no press that the door would refuse').not.toContain(ep.EMBASSY_WORDS.confirm)
    expect(asks[0], 'Refuse stays').toContain(ep.EMBASSY_WORDS.refuse)
  })

  it('draws each browser on its own row, the paired with End and the ended without', async () => {
    const part = await import('../src/web/components/YourBrowsersAndMachines.tsx')
    const page = await drawn()
    const paired = rowOf(page, made.paired)
    expect(paired, 'the paired browser has a row').not.toBeNull()
    expect(paired).toContain(PAIRED)
    expect(paired, 'when it joined').toContain(part.YOUR_BROWSERS_WORDS.joined)
    expect(paired, 'how it was paired').toContain(part.YOUR_BROWSERS_WORDS.from)
    expect(paired, 'when it was last used').toContain(part.YOUR_BROWSERS_WORDS.lastUsed)
    expect(paired, 'and End').toContain(part.YOUR_BROWSERS_WORDS.end)
    const ended = rowOf(page, made.ended)
    expect(ended, 'the ended browser has a row').not.toBeNull()
    expect(ended, 'and says when it ended').toContain(part.YOUR_BROWSERS_WORDS.endedAt)
    expect(ended, 'with no End').not.toContain(part.YOUR_BROWSERS_WORDS.end)
    // IN THE ORDER THE DESIGN NAMES: the asks, his browsers, the ended ones, then the machines.
    const order = [WAITING, PAIRED, ENDED, 'made-up-box.test'].map((one) => page.indexOf(one))
    expect(order.every((one) => one >= 0), 'each is drawn').toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('marks "this browser" on the one live browser with its name, and on none where it cannot tell', async () => {
    const part = await import('../src/web/components/YourBrowsersAndMachines.tsx')
    const mark = `>${part.YOUR_BROWSERS_WORDS.thisBrowser}<`
    const page = await drawn({ thisBrowser: PAIRED })
    expect(rowOf(page, made.paired), 'the browser he reads on').toContain(mark)
    expect(page.split(mark).length - 1, 'and only there').toBe(1)
    expect(await drawn({ thisBrowser: null }), 'a browser that gave itself no name is not guessed').not.toContain(mark)
    // TWO LIVE BROWSERS WITH ONE NAME: the office cannot tell which one this is, so it marks neither.
    const { credentials } = await theReplies()
    const twin = credentials.find((one) => one.id === made.paired) as VisitorCredential
    const twice = await drawn({ credentials: [...credentials, { ...twin, id: 'made-up-twin' }], thisBrowser: PAIRED })
    expect(twice, 'two with the same name are not told apart').not.toContain(mark)
  })

  it('draws the machines with Remove and Trust a machine, and the note under each press kept here', async () => {
    const part = await import('../src/web/components/YourBrowsersAndMachines.tsx')
    const tm = await import('../src/web/components/TrustedMachines.tsx')
    const page = await drawn()
    expect(page).toContain('made-up-box.test')
    expect(page, 'Remove').toContain(tm.TRUSTED_WORDS.remove)
    expect(page, 'Trust a machine').toContain(tm.TRUSTED_WORDS.add)
    expect(page, 'no link away to set them elsewhere').not.toContain(tm.TRUSTED_WORDS.setOn)
    // UNDER CONFIRM AND UNDER TRUST A MACHINE, the two presses whose doors are kept on the office's computer.
    // Confirm is drawn here because the waiting garden phone still holds its key, so the note is said twice.
    const note = asDrawn(part.YOUR_BROWSERS_WORDS.keptHere)
    expect(page.split(note).length - 1, 'said under the two presses').toBe(2)
    const confirmAt = page.indexOf(`>${(await import('../src/web/pages/EmbassyPage.tsx')).EMBASSY_WORDS.confirm}<`)
    const firstNote = page.indexOf(note)
    expect(firstNote, 'the note comes after Confirm').toBeGreaterThan(confirmAt)
    const lastNote = page.lastIndexOf(note)
    expect(lastNote, 'and after Trust a machine').toBeGreaterThan(page.lastIndexOf(tm.TRUSTED_WORDS.add))
  })

  it('marks the row an address names', async () => {
    const page = await drawn({ row: made.paired })
    expect(rowOf(page, made.paired), 'the named row').toContain('data-picked="yes"')
    expect(page.split('data-picked="yes"').length - 1, 'and no other').toBe(1)
  })
})

describe('4. a refused read', () => {
  it('says the read was refused and draws no empty list in its place', async () => {
    const part = await import('../src/web/components/YourBrowsersAndMachines.tsx')
    const tm = await import('../src/web/components/TrustedMachines.tsx')
    const replies = await (async () => (await call('GET', '/api/office/trusted-machines')).body as WhatTheOfficeTrusts)()
    const page = renderToStaticMarkup(h(part.TheBrowsersAndMachines, {
      visitors: { status: 'error', message: 'This read was refused in a made-up test.', fault: null },
      trusted: { status: 'error', message: 'This read was refused in a made-up test too.', fault: null },
      thisBrowser: null,
      row: null,
      onChanged: () => {},
    }))
    expect(page, 'the refusal is drawn').toContain('This read was refused in a made-up test.')
    expect(page).toContain('This read was refused in a made-up test too.')
    expect(page, 'with the state word').toContain(part.YOUR_BROWSERS_WORDS.notRead)
    expect(page, 'and never the word for an empty list').not.toContain(`>${part.YOUR_BROWSERS_WORDS.none}<`)
    expect(page, 'or the trusted list\'s').not.toContain(tm.TRUSTED_WORDS.none)
    expect(replies.machines.length, 'the list that was not read is not empty').toBeGreaterThan(0)
  })
})

describe('5. the addresses', () => {
  it('names one browser\'s row on his card, and reads it back', async () => {
    const { hisBrowserPath, whoPath } = await import('../src/web/components/router.tsx')
    const { parseRoute } = await import('../src/shared/addresses.ts')
    const path = hisBrowserPath(made.paired)
    expect(path.startsWith(`${whoPath('person', THE_PERSON)}/`), 'under his card').toBe(true)
    expect(parseRoute(`#${path}`)).toEqual({ name: 'who', kind: 'person', id: THE_PERSON, browser: made.paired })
    expect(parseRoute(`#${whoPath('person', THE_PERSON)}`), 'his card alone is as before').toEqual({
      name: 'who', kind: 'person', id: THE_PERSON,
    })
    // ONLY A PERSON'S CARD HAS BROWSER ROWS, so the same tail on an agent's page is a typo.
    const onAnAgent = `#${whoPath('agent', 'made-up-agent')}${path.slice(whoPath('person', THE_PERSON).length)}`
    expect(parseRoute(onAnAgent).name).toBe('unknown')
  })

  it('opens his card at the browser\'s row from a browser\'s credential, and leaves an agent\'s alone', async () => {
    const cp = await import('../src/web/pages/CredentialPage.tsx')
    const { hisBrowserPath } = await import('../src/web/components/router.tsx')
    const listed = ((await call('GET', '/api/office/visitors')).body as { credentials: VisitorCredential[] }).credentials
    const byId = (id: string) => listed.find((one) => one.id === id) as VisitorCredential
    expect(cp.whereACredentialOpens(byId(made.paired))).toBe(hisBrowserPath(made.paired))
    expect(cp.whereACredentialOpens(byId(made.waiting))).toBe(hisBrowserPath(made.waiting))
    expect(cp.whereACredentialOpens(byId(made.ended))).toBe(hisBrowserPath(made.ended))
    expect(cp.whereACredentialOpens(byId(made.agentAsk)), 'an agent\'s credential page stays').toBeNull()
  })
})

describe('6. the pairing page', () => {
  it('leads a paired browser to his card, and keeps the unpaired page as it is', async () => {
    const pp = await import('../src/web/pages/PairingPage.tsx')
    const { hrefOf, whoPath } = await import('../src/web/components/router.tsx')
    const paired = renderToStaticMarkup(h(pp.PairingPage, {
      said: { status: 'ready', value: { paired: true, offered: false, mayAsk: false, mayMove: false, waiting: null } },
      onPaired: () => {},
    }))
    expect(paired, 'the way on is his card').toContain(`href="${hrefOf(whoPath('person', THE_PERSON))}"`)
    expect(paired).toContain(pp.PAIRING_WORDS.go)
    expect(paired, 'not the home page').not.toContain('href="#/"')
    const offered = renderToStaticMarkup(h(pp.PairingPage, {
      said: { status: 'ready', value: { paired: false, offered: true, mayAsk: false, mayMove: false, waiting: null } },
      onPaired: () => {},
    }))
    expect(offered, 'the unpaired page keeps its press').toContain(pp.PAIRING_WORDS.press)
    expect(offered, 'and leads nowhere else').not.toContain(hrefOf(whoPath('person', THE_PERSON)))
  })

  it('says to confirm on his card, in words new to this line, in English and in Chinese', async () => {
    const pp = await import('../src/web/pages/PairingPage.tsx')
    const { enWave13s } = await import('../src/shared/words/en-wave-13s.ts')
    const { zhWave13s } = await import('../src/shared/words/zh-wave-13s.ts')
    const { t } = await import('../src/shared/i18n.ts')
    const waiting = renderToStaticMarkup(h(pp.PairingPage, {
      said: {
        status: 'ready',
        value: {
          paired: false, offered: false, mayAsk: true, mayMove: false,
          waiting: { device: WAITING, askedAt: '2026-11-23 01:00:00', standing: 'pending' },
        },
      },
      onPaired: () => {},
    }))
    for (const key of Object.values(pp.PAIRING_KEYS_ON_HIS_CARD)) {
      expect(Object.keys(enWave13s), `${key} is a word of this line`).toContain(key)
      expect(Object.keys(zhWave13s), `${key} has its Chinese`).toContain(key)
    }
    expect(pp.PAIRING_WORDS.waitingAt).toBe(t(pp.PAIRING_KEYS_ON_HIS_CARD.waitingAt))
    expect(pp.PAIRING_WORDS.go).toBe(t(pp.PAIRING_KEYS_ON_HIS_CARD.go))
    expect(waiting, 'the waiting sentence is drawn').toContain(asDrawn(pp.PAIRING_WORDS.waitingAt))
  })
})

describe('7. the words that name a page that moved', () => {
  it('the reply to a browser that asks names his card and not the Embassy', async () => {
    const { whoPath } = await import('../src/web/components/router.tsx')
    expect(deviceAskSays, 'his card\'s address').toContain(`#${whoPath('person', THE_PERSON)}`)
    expect(deviceAskSays, 'not the Embassy\'s').not.toContain(`#/embassy`)
  })

  it('a refusal of a browser\'s press or of trusting a machine says it is done on his card', async () => {
    const { ON_HIS_OWN_CARD } = await import('../src/shared/visitors.ts')
    const end = await call('POST', `/api/office/visitors/${made.waiting}/end`, {}, AS_AN_AGENT)
    expect(end.status, end.text).toBe(403)
    expect(end.text, 'ending a browser').toContain(ON_HIS_OWN_CARD)
    const confirm = await call('POST', `/api/office/visitors/${made.waiting}/confirm`, {}, AS_AN_AGENT)
    expect(confirm.status, confirm.text).toBe(403)
    expect(confirm.text, 'confirming a browser').toContain(ON_HIS_OWN_CARD)
    const trust = await call('POST', '/api/office/trusted-machines', { address: 'another-made-up-box.test' }, AS_AN_AGENT)
    expect(trust.status, trust.text).toBe(403)
    expect(trust.text, 'trusting a machine').toContain(ON_HIS_OWN_CARD)
    // AN AGENT'S CREDENTIAL IS NOT HIS BROWSER: its refusal does not send anybody to his card.
    const anotherAgent = { ...AS_AN_AGENT, 'x-mole-office-actor-id': 'another-made-up-agent' }
    const agentEnd = await call('POST', `/api/office/visitors/${made.agentAsk}/end`, {}, anotherAgent)
    expect(agentEnd.status, agentEnd.text).toBe(403)
    expect(agentEnd.text).not.toContain(ON_HIS_OWN_CARD)
    // AND THE REFUSED PRESSES WROTE NOTHING.
    const listed = ((await call('GET', '/api/office/visitors')).body as { credentials: VisitorCredential[] }).credentials
    expect(listed.find((one) => one.id === made.waiting)?.standing).toBe('pending')
    expect(listed.find((one) => one.id === made.agentAsk)?.standing).toBe('pending')
  })
})
