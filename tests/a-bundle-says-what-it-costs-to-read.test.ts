// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION T3: A BUNDLE SAYS WHAT IT COSTS TO READ.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION, WHOLE
 * ---------------------------------------------------------------------------------------
 *
 * "A brief says what it cost to read. A copy (THE BUNDLE) says, beside its size in bytes, its
 * size in tokens by the tokenizer of the model named, or says no tokenizer is installed and
 * gives the estimate it uses today."
 *
 * No tokenizer package is installed, so this repository builds and tests the second branch: the
 * copy says its size in tokens as an ESTIMATE, and says in words that no tokenizer is installed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHY EACH ASSERTION IS THE ONE IT IS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE REPLY CARRIES THE TOKEN SIZE, beside the byte size, on the JSON a caller reads.
 *   2. THE WORDS SAY IT IS AN ESTIMATE AND THAT NO TOKENIZER IS INSTALLED. The sentence is not
 *      read from a copy written here: it is the one the reply carries, so a reply that stopped
 *      saying it cannot pass.
 *   3. THE RULE IS READ FROM ONE PLACE. `src/config/token-estimate.mjs` declares the assumed
 *      characters-per-token; the test changes it and both the brief's answer and the bundle's
 *      answer move. A private copy of the constant in either reader would stay at the old number
 *      and go red here, which is the point of this file. The ninth invariant names this defect:
 *      one fact worked out in two places, free to drift.
 *   4. THE PANEL CARRIES THE TOKEN SIZE TOO, beside the bytes, in the same sentence, as about so
 *      many tokens. This is a browser check because a panel is drawn, not served: the same page a
 *      person reads is opened and its own words are read back. Criterion change: the panel no longer
 *      draws the sentence that the figure is an estimate and that no tokenizer is installed, as
 *      decided, since explanations come off the pages. The reply still says it, for agents (case 2).
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, PROVED IN THIS FILE'S OWN RUN
 * ---------------------------------------------------------------------------------------
 *
 *   a. Remove the three token fields from the reply in `src/server/api/bundle.ts`. Cases 1, 2 and
 *      4 above go red by name.
 *   b. Give `src/server/lib/bundle.ts` its own `const CHARS_PER_TOKEN = 4` instead of reading the
 *      shared declaration. Case 3 goes red on the bundle's own answer, which is exactly the
 *      second copy this test exists to make impossible to add back quietly.
 *
 * The control run is green before either mutation. After each is restored, the file is
 * byte-identical (`sha256sum`) and green again.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { Page } from 'playwright'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** The shared declaration's path, as this file and the product's readers resolve it. */
const SHARED_RULE = '../src/config/token-estimate.mjs'

/**
 * EACH CASE GETS ITS OWN PROJECT, so the copy a case asks for is made of the records that case filed
 * and not of one an earlier case left behind.
 */
let WORKSPACE = 'default'

function theHeaders(): Record<string, string> {
  return { ...HEADERS, 'x-mole-office-workspace': WORKSPACE }
}

async function post(app: FastifyInstance, url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: theHeaders() })
  return { status: res.statusCode, body: res.json() }
}

async function get(app: FastifyInstance, url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: theHeaders() })
  return { status: res.statusCode, body: res.json() }
}

/** A module, so a copy has something that is really there to carry. */
async function aModule(app: FastifyInstance): Promise<void> {
  const made = await post(app, '/api/records', {
    kind: 'module',
    title: 'The perception stack',
    summary: 'Everything between the camera and a grasp pose.',
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
}

async function aPreview(app: FastifyInstance): Promise<{ status: number; body: any }> {
  return await get(app, '/api/bundles/preview?preset=continue')
}

describe('the bundle reply says what it cost to read', () => {
  let t: TestDb
  let app: FastifyInstance
  let caseNumber = 0

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  beforeEach(async () => {
    caseNumber += 1
    WORKSPACE = `bundle-case-${String(caseNumber)}`
    const made = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { id: WORKSPACE, title: `Bundle case ${String(caseNumber)}` },
    })
    expect(made.statusCode, made.body).toBe(201)
  })

  it('carries a token estimate beside the bytes', async () => {
    await aModule(app)
    const reply = await aPreview(app)
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    const body = reply.body

    // BOTH SIZES ARE THERE AND THE TOKEN ONE IS BESIDE THE BYTE ONE.
    expect(typeof body.characters, 'the copy does not say how many characters it is').toBe('number')
    expect(typeof body.bytes, 'the copy does not say how many bytes it is').toBe('number')
    expect(typeof body.tokensEstimated, 'the copy does not say how many tokens it is').toBe('number')
    expect(body.tokensEstimated, 'the copy claims zero tokens').toBeGreaterThan(0)

    // IT IS THE ESTIMATE THE REST OF THE OFFICE USES: characters divided by the assumed divisor,
    // rounded, which is the brief's own arithmetic. The divisor is read out of the reply, so this
    // cannot pass by assuming four.
    expect(body.charsPerTokenAssumed, 'the reply does not say what divisor it assumed').toBeGreaterThan(0)
    expect(body.tokensEstimated).toBe(Math.round(body.characters / body.charsPerTokenAssumed))
  })

  it('says the token figure is an estimate and that no tokenizer is installed', async () => {
    await aModule(app)
    const reply = await aPreview(app)
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)

    const said = String(reply.body.tokensAreAnEstimate)
    expect(said.length, 'the reply carries no sentence about the token figure').toBeGreaterThan(0)
    expect(said.toLowerCase(), 'the sentence does not say the token figure is an estimate').toContain('estimate')
    expect(said, 'the sentence does not say no tokenizer is installed').toContain(
      'no tokenizer is installed',
    )
    // AND THE FIELD NAME SAYS IT TOO, the way the brief's does.
    expect(reply.body).toHaveProperty('tokensEstimated')
    expect(reply.body).toHaveProperty('tokensAreAnEstimate')
  })
})

/**
 * THIS CASE NEEDS A WORLD OF ITS OWN, and it keeps its own start of one. It changes the shared
 * declaration under a fresh module registry, and no office made before the mock could answer with
 * the changed rule. The block's own start comes after the block above has closed.
 */
describe('the bundle reply reads the rule from one declaration', () => {
  let t: TestDb
  let app: FastifyInstance | undefined

  beforeEach(async () => {
    t = await freshDb()
    WORKSPACE = 'default'
    app = undefined
  })

  afterEach(async () => {
    if (app !== undefined) await app.close()
    t.close()
    vi.doUnmock(SHARED_RULE)
    vi.resetModules()
  })

  it('reads the rule from one declaration, so the brief and the bundle move together', async () => {
    // THE REAL VALUE FIRST, from the one declaration, so the change below is a change and not a
    // coincidence. Imported before the mock so the test measures the product's own number.
    const real = (await import(SHARED_RULE)) as { CHARS_PER_TOKEN: number }
    const changed = real.CHARS_PER_TOKEN + 1

    // THE MOCK IS REGISTERED AFTER `freshDb` AND BEFORE THE APP IS BUILT, so every reader of the
    // declaration in this app is handed the changed rule.
    vi.doMock(SHARED_RULE, () => ({
      CHARS_PER_TOKEN: changed,
      tokensEstimatedFor: (characters: number) => Math.round(characters / changed),
      theTokenEstimateSentence: () =>
        `Tokens are an estimate: no tokenizer is installed on this machine, so the count is ` +
        `characters divided by ${String(changed)}. Characters and bytes are counted exactly.`,
    }))
    app = (await apiApp()).app
    await app.ready()

    const briefReply = await get(app, '/api/brief')
    expect(briefReply.status, JSON.stringify(briefReply.body)).toBe(200)
    const briefSize = briefReply.body.size

    const previewReply = await aPreview(app)
    expect(previewReply.status, JSON.stringify(previewReply.body)).toBe(200)
    const copy = previewReply.body

    // BOTH MOVED. A private copy anywhere would leave one of these at the old number.
    expect(
      briefSize.charsPerTokenAssumed,
      'the brief did not move when the shared rule changed, so it has a copy of its own',
    ).toBe(changed)
    expect(
      copy.charsPerTokenAssumed,
      'the bundle did not move when the shared rule changed, so it has a copy of its own',
    ).toBe(changed)

    // AND THE ARITHMETIC MOVED WITH IT, not just the field naming the divisor.
    expect(briefSize.tokensEstimated).toBe(Math.round(briefSize.characters / changed))
    expect(copy.tokensEstimated).toBe(Math.round(copy.characters / changed))

    // THE SENTENCE MOVED TOO, so the wording is not a second copy either.
    expect(String(briefSize.tokensAreAnEstimate)).toContain(`divided by ${String(changed)}`)
    expect(String(copy.tokensAreAnEstimate)).toContain(`divided by ${String(changed)}`)
  })
})

/**
 * THE PANEL. A browser, because the panel is drawn and the panel's words are what is claimed.
 *
 * The copy is reached the way a person reaches it: open the page, where the controls are since
 * criterion B33, and press Read what it would say. Then the size line is read off the screen.
 */
describe('the panel says what the copy costs to read, beside the bytes', () => {
  let live: LiveApp
  let page: Page

  beforeAll(async () => {
    live = await liveApp({ name: 'bundle-says-what-it-costs', viewport: { width: 1440, height: 1000 } })
    page = live.page
    const filed = await fetch(`http://127.0.0.1:${String(live.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'module',
        title: 'The perception stack',
        summary: 'Everything between the camera and a grasp pose.',
      }),
    })
    if (!filed.ok) throw new Error(`the seed module was not filed: ${String(filed.status)} ${await filed.text()}`)
  }, 300_000)

  afterAll(async () => {
    await live?.stop()
  }, 90_000)

  it('draws the token estimate beside the bytes, as about so many tokens', async () => {
    await page.goto(`http://127.0.0.1:${String(live.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForThePage(page, 60_000)
    // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
    await page.waitForSelector('#bx-preset')
    await page.getByRole('button', { name: 'Read what it would say' }).click()
    // THE SIZE LINE IS THE FIRST `.bx-size` INSIDE THE COPY PANEL, and it is the one that carries
    // both sizes. Wait for it rather than for a fixed time.
    const size = page.locator('.bx-size').first()
    await size.waitFor({ state: 'visible', timeout: 60_000 })
    const words = (await size.innerText()).replace(/\s+/g, ' ')

    // BYTES AND TOKENS IN THE SAME SENTENCE, so a reader who sees one sees the other.
    expect(words, `the size line does not carry both sizes: ${words}`).toMatch(
      /\d+ characters, \d+ bytes, about \d+ tokens/,
    )
  }, 120_000)
})
