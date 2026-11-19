// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PICKING A PICTURE FOR SOMEBODY FROM THE SET THIS PRODUCT OFFERS.
 *
 * Criterion M30 of design/messages/ACCEPTANCE.md, section 9b, the half that was not built: *a set
 * of drawn animal avatars … is offered on the participant page and one is given to each agent that
 * has none.* `tests/the-avatar-set-is-complete.test.ts` measures the files on disk. This measures
 * the product reaching them: the API listing the set, the bytes coming back, the offer, and the
 * picker in a real browser posting one through the door an upload goes through.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SECOND HALF IS A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * A picture's address is only wrong when a browser resolves it. `npm run dev` has no proxy, so a
 * bare `/api/avatars/...` asks Vite and Vite answers the app's own HTML with status 200: no console
 * error, no 4xx, and fifty broken pictures. That is measured, not hypothetical — problem
 * `YY3ryy7FEpK2` is the same defect on the avatars beside a name, and
 * `tests/an-avatar-draws-in-development.test.ts` is the test written for it. A render to a string
 * passed throughout that defect and would pass through this one.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { expectStoredPicture } from './avatar-picture-identity.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AVATARS_IN_THE_CHECKOUT, defaultAvatarAssetId } from '../src/shared/participants.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

// ONE OFFICE FOR THE WHOLE FILE. The browser stack below already answers an API, so the API cases ask
// that one instead of starting a test office each. It starts once, and every case that changes a
// picture puts it back before the next.
let app: LiveApp
let page: Page

interface Answer {
  status: number
  body: Record<string, unknown>
  bytes: Buffer
  contentType: string
}

async function ask(
  method: string,
  path: string,
  payload?: unknown,
  headers: Record<string, string> = AS_THE_OWNER,
): Promise<Answer> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const bytes = Buffer.from(await res.arrayBuffer())
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(bytes.toString()) as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: res.status, body, bytes, contentType: res.headers.get('content-type') ?? '' }
}

/** Put a participant back on the picture made from its id, which is the state this file measures. */
async function resetPicture(kind: 'agent' | 'person', id: string): Promise<void> {
  const back = await ask('POST', `/api/participants/${kind}/${encodeURIComponent(id)}/avatar`, { reset: true })
  expect(back.status, JSON.stringify(back.body)).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'avatar-picker', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = app.page
  // THE TWO AGENTS THIS FILE OFFERS A PICTURE TO. Since decision `HnoPsajfgR0A` an agent is
  // GIVEN the picture it is offered when it registers, so a freshly registered one is never in the state
  // this file measures; the cases put it back on the drawing below.
  for (const [title, handle] of [
    ['Builder X', 'builder-x'],
    ['Builder Y', 'builder-y'],
  ] as const) {
    const filed = await ask('POST', '/api/records', {
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active' },
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  }
}, 300_000)

afterAll(async () => {
  await app.stop()
})

// ============================================================================ the API half

describe('the API serves the set from the files', () => {
  beforeEach(async () => {
    await resetPicture('agent', 'builder-x')
    await resetPicture('agent', 'builder-y')
    await resetPicture('person', THE_PERSON)
  })

  const list = async (query = ''): Promise<{ status: number; body: Record<string, unknown> }> => {
    const res = await ask('GET', `/api/avatars${query}`)
    return { status: res.status, body: res.body }
  }

  it('lists both sets, read off the two directories rather than off a list in the code', async () => {
    const { status, body } = await list()
    expect(status).toBe(200)
    const avatars = body['avatars'] as { set: string; name: string; url: string }[]
    // THE TWELVE DRAWN ANIMALS AND THE OWNER'S BEE. Their names are the file names, so this fails if the
    // route ever starts answering from something other than the directory.
    //
    // THIRTEEN SINCE 6 SEPTEMBER 2026, and the thirteenth is not an animal drawn in this style: it
    // is the photograph the owner sent (chill-bee), which criterion M53 makes the picture a participant
    // gets when nobody chose one. It lives in this directory because this directory IS the drawn
    // set — `avatarsOnOffer` reads the files rather than a list — and because a set of its own for
    // one file would be a second mechanism doing what this one already does. What makes it the
    // default is `THE_DEFAULT_PICTURE` in lib/avatars.ts and nothing about where the file sits.
    const drawn = avatars.filter((one) => one.set === 'drawn').map((one) => one.name)
    expect(drawn).toContain('sheepdog')
    expect(drawn).toContain('mole')
    expect(drawn).toContain('chill-bee')
    expect(drawn.length).toBe(13)
    // AND THE GENERATED ONES, which grow as more are made. So this asserts
    // that there are many rather than exactly how many, and names two that are certainly there.
    const generated = avatars.filter((one) => one.set === 'generated').map((one) => one.name)
    expect(generated).toContain('spring-onion')
    expect(generated).toContain('hundred-eyes')
    expect(generated.length).toBeGreaterThan(20)
  })

  it('gives every picture an address on the API and never a bare file path', async () => {
    const { body } = await list()
    const avatars = body['avatars'] as { set: string; name: string; url: string }[]
    for (const one of avatars) {
      expect(one.url, `${one.name} is not addressed on the API`).toBe(`/api/avatars/${one.set}/${one.name}`)
    }
  })

  it('serves the bytes of one, and they are the bytes of the file on disk', async () => {
    const res = await ask('GET', '/api/avatars/drawn/sheepdog')
    expect(res.status).toBe(200)
    expect(res.contentType).toBe('image/png')
    const onDisk = readFileSync(join(ROOT, AVATARS_IN_THE_CHECKOUT, 'png', 'sheepdog.png'))
    expect(res.bytes.equals(onDisk)).toBe(true)
  })

  it('refuses a name that would walk out of the directory, and says nothing was read', async () => {
    for (const name of ['..%2F..%2F..%2Fetc%2Fpasswd', '..', 'Sheepdog', 'sheep dog']) {
      const res = await ask('GET', `/api/avatars/drawn/${name}`)
      expect(res.status, `${name} was not refused`).toBeGreaterThanOrEqual(400)
    }
  })

  it('refuses a set nobody has and names where the sets are listed', async () => {
    const res = await ask('GET', '/api/avatars/nope/sheepdog')
    expect(res.status).toBe(404)
    expect(String((res.body as { error: string }).error)).toContain('GET /api/avatars')
  })

  it('says nothing at all is offered when nobody was named', async () => {
    const { body } = await list()
    expect(body['offered']).toBe(null)
    expect(body['offeredFor']).toBe(null)
  })

  it('offers a drawn picture to an agent nobody has chosen one for, the same one every time', async () => {
    const first = await list('?for=agent:builder-x')
    expect(first.status).toBe(200)
    const offered = first.body['offered'] as { set: string; name: string } | null
    expect(offered, 'an agent with no picture was offered none').not.toBe(null)
    expect(offered?.set, 'the offered picture is not from the drawn set').toBe('drawn')
    // WORKED OUT FROM THE ID AND FROM NOTHING ELSE, so asking twice gives the same answer. A rule
    // that read a clock or a random source would pass the line above and fail this one.
    const again = await list('?for=agent:builder-x')
    expect((again.body['offered'] as { name: string }).name).toBe(offered?.name)
  })

  it('offers every participant the same picture, which is the bee', async () => {
    /*
     * THIS CASE USED TO ASSERT THE OPPOSITE, AND THE OWNER CHANGED THE RULE.
     *
     * It read: *offers a different agent its own picture rather than everybody the same one*, and
     * it checked that two agents were offered two different animals, because the recommendation was
     * worked out from the participant's id. That was criterion M30's *one is given to each agent
     * that has none*, with which one left to a digest.
     *
 * Criterion M53 replaces it: chill-bee.jpg is the default picture for everybody who downloads Mole
 * Office. So the same two agents
     * must now be offered the same picture, and it must be that one.
     *
     * THE REST OF THE SET IS STILL OFFERED, which the case above checks by counting the directory:
     * this decides which one is RECOMMENDED and takes nothing off the picker.
     */
    const x = (await list('?for=agent:builder-x')).body['offered'] as { set: string; name: string }
    const y = (await list('?for=agent:builder-y')).body['offered'] as { set: string; name: string }
    expect({ set: x.set, name: x.name }).toEqual({ set: 'drawn', name: 'chill-bee' })
    expect({ set: y.set, name: y.name }).toEqual({ set: 'drawn', name: 'chill-bee' })
  })

  it('offers nothing once somebody has chosen a picture, because the agent then has one', async () => {
    const picture = readFileSync(join(ROOT, AVATARS_IN_THE_CHECKOUT, 'png', 'owl.png'))
    const sent = await ask('POST', '/api/participants/agent/builder-x/avatar', { bytes: picture.toString('base64') })
    expect(sent.status, JSON.stringify(sent.body)).toBe(201)
    const after = await list('?for=agent:builder-x')
    expect(after.body['offered'], 'a picture was offered to an agent that already has one').toBe(null)
  })

  it('refuses a participant nobody holds rather than offering a picture to nobody', async () => {
    const res = await ask('GET', '/api/avatars?for=agent:nobody')
    expect(res.status).toBe(404)
  })

  // ------------------------------------- what a screen is given, which is the other half of M53

  /** The address the participants route says this participant's picture is at. */
  const pictureOf = async (kind: string, id: string): Promise<string> => {
    const res = await ask('GET', `/api/participants/${kind}/${id}`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    return (res.body as { participant: { avatarUrl: string } }).participant.avatarUrl
  }

  it('serves the bee to a person nobody has chosen a picture for, not the pattern drawn from the id', async () => {
    // PROBLEM `wO9DpHLtXts_`, THE OPEN HALF. Being offered a picture only reaches somebody who opens
    // the picker. A person's registry row is written by the participants migration and no door gives
    // a person a picture, so the owner's own face in a fresh installation stayed the drawing.
    const drawn = `/api/assets/${defaultAvatarAssetId({ kind: 'person', id: THE_PERSON })}`
    const said = await pictureOf('person', THE_PERSON)
    expect(said, 'the person is still drawn with the pattern made from their id').not.toBe(drawn)
    expect(said).toBe('/api/avatars/drawn/chill-bee')

    // AND THE ADDRESS REALLY CARRIES THE BEE, byte for byte. An address nothing answers would pass
    // the line above and draw a broken image.
    const bytes = await ask('GET', said)
    expect(bytes.status).toBe(200)
    expect(bytes.contentType).toBe('image/png')
    const onDisk = readFileSync(join(ROOT, AVATARS_IN_THE_CHECKOUT, 'png', 'chill-bee.png'))
    expect(bytes.bytes.equals(onDisk), 'the address serves something other than the owner\'s file').toBe(true)
  })

  it('keeps the picture of a person who has chosen one, and does not put the bee over it', async () => {
    const picture = readFileSync(join(ROOT, AVATARS_IN_THE_CHECKOUT, 'png', 'owl.png'))
    const sent = await ask('POST', `/api/participants/person/${THE_PERSON}/avatar`, { bytes: picture.toString('base64') })
    expect(sent.status, JSON.stringify(sent.body)).toBe(201)

    const said = await pictureOf('person', THE_PERSON)
    expect(said, 'a chosen picture was replaced by the bee').not.toBe('/api/avatars/drawn/chill-bee')
    expect(said.startsWith('/api/assets/'), `the chosen picture is at ${said}`).toBe(true)
    const bytes = await ask('GET', said)
    expect(bytes.status).toBe(200)
    const upload = await expectStoredPicture(app.dir, said, picture, bytes.bytes)
    expect(sent.body['upload']).toEqual(upload)
  })

  // ------------------------------------------------------------------ the door's own rules

  it('lets a person give any agent a picture from the set, through the upload door', async () => {
    const picture = readFileSync(join(ROOT, AVATARS_IN_THE_CHECKOUT, 'png', 'sheepdog.png'))
    const res = await ask('POST', '/api/participants/agent/builder-x/avatar', { bytes: picture.toString('base64') })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const held = (res.body as { participant: { avatarUrl: string } }).participant
    expect(held.avatarUrl).not.toBe(`/api/assets/${defaultAvatarAssetId({ kind: 'agent', id: 'builder-x' })}`)
  })

  it('refuses an agent giving another agent a picture from the set', async () => {
    const picture = readFileSync(join(ROOT, AVATARS_IN_THE_CHECKOUT, 'png', 'fox.png'))
    const res = await ask(
      'POST',
      '/api/participants/agent/builder-y/avatar',
      { bytes: picture.toString('base64') },
      AS_AN_AGENT('builder-x'),
    )
    expect(res.status, JSON.stringify(res.body)).toBe(403)
  })
})

// ============================================================================ the browser half

describe('the picker draws the set and posts one through the upload door', () => {
  // WHAT IS MEASURED HERE is what the picker offers somebody with no picture of their own, so the
  // agent goes back on the drawing before each case, whatever the case before it chose.
  beforeEach(async () => {
    await resetPicture('agent', 'builder-x')
  })

  /**
   * Open the roster, open the editor on the first agent, and wait for the pictures to decode.
   *
   * IT LOADS THE ADDRESS AND THEN RELOADS IT. Going to an address that differs from the current one
   * only after the `#` is a move within the same document, so the browser does not draw the page
   * again and whatever the last case left open is still open — with the answers it read before that
   * case wrote anything. The line below then finds a picker already there, skips the press that
   * opens one, and measures a stale reply. The reload is what makes each case below start from a
   * page nobody has touched.
   */
  async function openThePicker(): Promise<void> {
    await page.goto(`${app.site}/#/working`)
    await waitForThePage(page, 60_000)
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.agap-toggle', { timeout: 30_000 })
    const open = await page.$('.avp-grid')
    if (open === null) await page.click('.agap-toggle')
    await page.waitForSelector('.avp-one', { timeout: 30_000 })
    // Lazy images load when they come near the window; a test window is not scrolled, so ask for
    // all of them and then wait for the browser to finish with each.
    await page.evaluate(() => {
      for (const img of document.querySelectorAll('img.avp-img')) (img as HTMLImageElement).loading = 'eager'
    })
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('img.avp-img')).every((one) => (one as HTMLImageElement).complete),
      undefined,
      { timeout: 60_000 },
    )
  }

  it('draws every picture with real pixels behind it, from the API and not from Vite', async () => {
    await openThePicker()
    const pictures = await page.$$eval('img.avp-img', (all) =>
      all.map((one) => {
        const picture = one as HTMLImageElement
        return { src: picture.src, naturalWidth: picture.naturalWidth, alt: picture.alt }
      }),
    )
    expect(pictures.length, 'the picker drew no pictures at all, so nothing was measured').toBeGreaterThan(20)
    for (const one of pictures) {
      expect(one.naturalWidth, `the browser could not decode ${one.src}, so this picture is broken`).toBeGreaterThan(0)
      expect(one.src, `${one.src} was not asked for on the API`).toContain(`${app.api}/api/avatars/`)
      expect(one.src.startsWith(`${app.site}/`), `${one.src} was asked of Vite`).toBe(false)
      expect(one.alt.length, `${one.src} has no words for a reader who cannot see it`).toBeGreaterThan(0)
    }
  }, 240_000)

  it('marks the one picture offered to an agent nobody has chosen for', async () => {
    await openThePicker()
    const marked = await page.$$eval('.avp-one[data-offered="yes"]', (all) =>
      all.map((one) => one.getAttribute('data-picture')),
    )
    expect(marked.length, 'no picture was marked as the one offered').toBe(1)
    expect(String(marked[0]).startsWith('drawn/'), `${String(marked[0])} is not from the drawn set`).toBe(true)
    // AND THE STATE IS SAID AS A LABEL WITH A VALUE, not as a sentence explaining the screen.
    const said = await page.textContent('.avp-state')
    expect(said ?? '').toContain('Chosen picture')
    expect(said ?? '').toContain('none chosen')
  }, 240_000)

  it('stores the picture that was pressed, so the agent is drawn with it afterwards', async () => {
    await openThePicker()
    const before = await fetch(`${app.api}/api/participants/agent/builder-x`, { headers: AS_THE_OWNER })
    const was = ((await before.json()) as { participant: { avatarUrl: string } }).participant.avatarUrl
    // NOBODY HAS CHOSEN ONE FOR THIS AGENT YET, which is what makes the press below prove anything.
    // The address for that state is the picture anybody with none is given, criterion M53, and not
    // the drawing the row points at.
    expect(was, 'this agent already had a chosen picture, so nothing here would be proved').toBe(
      '/api/avatars/drawn/chill-bee',
    )

    await page.click('.avp-one[data-picture="drawn/owl"]')
    // WAIT FOR THE PANEL'S OWN LINE AND NOT THE PICKER'S. The picker sets a line of its own and
    // then calls `onStored`, which reloads the page that draws the row — and that reload builds the
    // picker again, so its line lives for part of one frame. AgentAppearance.tsx says exactly this
    // under *WHETHER IT IS OPEN IS HELD ABOVE THE ROW*, and the panel keeps `Picture stored.` across
    // the reload for the same reason. Waiting on the picker's line was waiting on a race; this waits
    // on the line a person actually reads.
    await page.waitForFunction(
      () => (document.querySelector('.agap-said')?.textContent ?? '').includes('Picture stored'),
      undefined,
      { timeout: 60_000 },
    )

    const after = await fetch(`${app.api}/api/participants/agent/builder-x`, { headers: AS_THE_OWNER })
    const now = ((await after.json()) as { participant: { avatarUrl: string } }).participant.avatarUrl
    expect(now, 'pressing a picture changed nothing').not.toBe(was)
    // The stored pixels and original provenance must both identify the owl that was pressed.
    const served = await fetch(`${app.api}${now}`, { headers: AS_THE_OWNER })
    expect(served.status).toBe(200)
    const bytes = Buffer.from(await served.arrayBuffer())
    await expectStoredPicture(app.dir, now,
      readFileSync(join(ROOT, AVATARS_IN_THE_CHECKOUT, 'png', 'owl.png')), bytes)
  }, 240_000)

  it('offers a way back to the drawn one only once a picture has been chosen, and putting it back works', async () => {
    // "Use the drawn one" came off the settings page, because a user who does not
    // want to change the picture will not press it. That was true of a press standing under a picture nobody had
    // chosen. Once one HAS been chosen there is no way to unchoose, and going back is a different
    // act from choosing a drawn animal: the row goes back to holding nothing.
    //
    // WHAT A ROW HOLDING NOTHING SHOWS IS THE BEE, since criterion M53 on 6 September, and this
    // case used to assert the drawing here. `pictureShownFor` answers with the picture anybody who
    // has chosen none is given; the row itself still points at the drawing and this measures what a
    // screen is given, which is the fact a reader can see.
    const notChosen = '/api/avatars/drawn/chill-bee'
    const now = async (): Promise<string> => {
      const said = await fetch(`${app.api}/api/participants/agent/builder-x`, { headers: AS_THE_OWNER })
      return ((await said.json()) as { participant: { avatarUrl: string } }).participant.avatarUrl
    }
    // START FROM NOBODY HAVING CHOSEN, whatever ran before this. The test above leaves the owl
    // chosen, and a test that only passes when it runs first is a test nobody can trust.
    const cleared = await fetch(`${app.api}/api/participants/agent/builder-x/avatar`, {
      method: 'POST',
      headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': 'default' },
      body: JSON.stringify({ reset: true }),
    })
    expect(cleared.status, await cleared.text()).toBe(201)
    await openThePicker()

    // WITH NOTHING CHOSEN, NOTHING IS OFFERED TO PUT BACK.
    expect(await now(), 'the picture was not put back before this test started').toBe(notChosen)
    expect(await page.$$eval('.avp-back', (all) => all.length), 'the way back is offered with nothing chosen').toBe(0)

    // CHOOSE ONE, AND THE WAY BACK APPEARS.
    await page.click('.avp-one[data-picture="drawn/owl"]')
    await page.waitForSelector('.avp-back', { timeout: 60_000 })
    expect(await now(), 'pressing a picture changed nothing').not.toBe(notChosen)

    // PRESS IT, AND THE PRESS GOES WITH IT, because there is nothing left to put back.
    await page.click('.avp-back')
    await page.waitForFunction(() => document.querySelector('.avp-back') === null, undefined, { timeout: 60_000 })
    // AND THE ROW HOLDS NO PICTURE AGAIN, which is the fact. The drawn asset is what the row points
    // at; the bee is what a screen is given for a row pointing there.
    expect(await now(), 'the choice was not put back').toBe(notChosen)
  }, 240_000)
})
