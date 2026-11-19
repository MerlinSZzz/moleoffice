// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST OFFICE DRAWS ITS OWN OWNER, AND NEVER THE NAME OF THE MACHINE IT RUNS ON.
 *
 * Wave 13k's round 33 pictures drew the person by the name of this repository's owner on "Last changed by …" and "Sent …". On the
 * owner's machine that is also the user's name, so it looked as if the office had read the machine.
 * Round 29 traced it: liveApp (tests/helpers.ts, devStackEnvironment) hands its servers the test
 * process's environment, where the setup has put MOLE_OFFICE_OWNER_ID and MOLE_OFFICE_OWNER_NAME from
 * THE_TEST_OFFICES_OWNER. The office writes its owner from those two at the first migrate, and every
 * page draws that owner. The user name (USER, LOGNAME, the account) and the machine's name (HOSTNAME,
 * the kernel's) are not read for the person. The owner's name and the user's name are equal only by
 * chance, and a picture cannot tell them apart.
 *
 * SO THIS TEST MAKES THEM DIFFERENT AND LOOKS. It starts a test office whose owner is an invented
 * person, with USER, LOGNAME and HOSTNAME set to other invented words, files a report and a message as
 * that person, and reads the record page ("Last changed … by") and the Messages page. Each page must
 * draw the invented owner, and none may draw the user, the machine, or the name of this repository's owner.
 * That name comes from the file of the owner's content, so the last case looks for it, and it is taken out,
 * and says why, where no such file was read.
 *
 * MUTATION, after a control run: in src/server/db/owner-setting.ts the name a new office gives its
 * owner is read from USER instead of MOLE_OFFICE_OWNER_NAME. Red: the pages draw the user's word.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, type LiveApp, waitForThePage, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { aWordPattern, OWNER_NAMES } from './neutral-names.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'

/** The owner of this office, invented: nobody's id and nobody's name. */
const AN_INVENTED_OWNER = { id: 'tamsin', name: 'Tamsin Example' } as const
/** What the machine says about itself in this test, invented too, and different from the owner. */
const THE_MACHINES_WORDS = { USER: 'quillon', LOGNAME: 'quillon', HOSTNAME: 'lantern-box-7' } as const
const SETTINGS = ['MOLE_OFFICE_OWNER_ID', 'MOLE_OFFICE_OWNER_NAME', 'USER', 'LOGNAME', 'HOSTNAME'] as const

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': AN_INVENTED_OWNER.id,
}

let app: LiveApp
let page: Page
let reportId = ''
const before: Partial<Record<(typeof SETTINGS)[number], string | undefined>> = {}

async function post(path: string, body: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_OWNER, body: JSON.stringify(body) })
  expect(res.status, `${path}: ${await res.clone().text()}`).toBe(theAnswerToAWriteInATestOffice(AS_THE_OWNER, body))
  return res.json()
}

/** Everything the page shows as text, once the part it is about has drawn. */
async function pageText(address: string, ready: string): Promise<string> {
  await page.goto(`${app.site}/?lang=en&mode=inspect${address}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  return page.evaluate(() => document.body.innerText)
}

function drawsNoMachine(said: string): void {
  expect(said, 'the user name').not.toContain(THE_MACHINES_WORDS.USER)
  expect(said, "the machine's name").not.toContain(THE_MACHINES_WORDS.HOSTNAME)
}

beforeAll(async () => {
  // liveApp hands its servers this process's environment, so the office is given its owner and the
  // machine its words here, and both are put back after.
  for (const name of SETTINGS) before[name] = process.env[name]
  process.env['MOLE_OFFICE_OWNER_ID'] = AN_INVENTED_OWNER.id
  process.env['MOLE_OFFICE_OWNER_NAME'] = AN_INVENTED_OWNER.name
  Object.assign(process.env, THE_MACHINES_WORDS)
  app = await liveApp({ name: 'no-machine-name', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  reportId = (await post('/api/records', {
    kind: 'report', title: 'A made-up report about the lantern shelf', summary: 'A made-up report.',
    data: { blocks: [{ id: 'one', type: 'text', text: 'Made up for this test.' }], date: '2026-10-04', for: AN_INVENTED_OWNER.id },
  })).record.id as string
  await post('/api/agents/started', { handle: 'shelf-reader', name: 'Shelf reader', runtime: 'claude-code', role: 'worker' })
  await post('/api/records', { kind: 'message', title: 'A made-up message', data: { to: [{ kind: 'agent', id: 'shelf-reader' }], body: 'Made up for this test.' } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  for (const name of SETTINGS) {
    if (before[name] === undefined) delete process.env[name]
    else process.env[name] = before[name]
  }
})

describe('a test office draws its owner, not the machine', () => {
  it('says who last changed a record with the owner it was given', async () => {
    const said = await pageText(`#/r/${reportId}`, 'h1')
    expect(said).toContain(`by ${AN_INVENTED_OWNER.id}`)
    expect(said).toContain(AN_INVENTED_OWNER.name)
    drawsNoMachine(said)
  }, 180_000)

  it('draws the owner on the Messages page, and nothing of the machine', async () => {
    const said = await pageText('#/messages', 'h1')
    expect(said).toContain(AN_INVENTED_OWNER.name)
    drawsNoMachine(said)
  }, 180_000)

  it("draws none of the owner's names on either page", async (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    if (OWNER_NAMES.length === 0) throw new Error("The file of the owner's content was read, and it gave no names.")
    for (const address of [`#/r/${reportId}`, '#/messages']) {
      expect(await pageText(address, 'h1'), `${address}: the name the test offices of this repository used to have`).not.toMatch(aWordPattern(OWNER_NAMES))
    }
  }, 180_000)
})
