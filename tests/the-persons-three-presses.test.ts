// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S THREE PRESSES, EACH DRAWN FOR THE PERSON AND NOBODY ELSE. Criterion M118.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * The reading at report `5WFgRK7duJw-` found three doors that were the person's alone and had no
 * surface: revoking a regulation, pinning a fork, and deleting a relationship the person stated about their
 * own code. Each was reachable only with `curl`. Criterion M118 is that each gets a press on the
 * page that draws the thing, drawn only for the person, calling the door that already exists.
 *
 * One browser test per press proves the same three claims, in the same order:
 *
 *   1. the press exists for the person who may make the act,
 *   2. it is absent for an agent viewer, who may not,
 *   3. pressing it changes the record, read back from the door rather than from the screen.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE IT, EACH RUN AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 * THE CONTROL. With the three presses as committed, this file is green and the run below is: the
 * six files of the step, with `--no-file-parallelism`, all passing.
 *
 * MUTATION ONE — the press gone. Delete the `Revoke` block from `Regulation` in
 * src/web/pages/RegulationsPage.tsx, the `PinTheFork` mount from `ProposalGovernance` in
 * src/web/components/Governance.tsx, and the `DeleteARelationship` `act` from the stated rows in
 * `OneRepository` in src/web/components/Implementation.tsx. The first test of each group goes red:
 * "the person sees no Revoke press on his own regulation", and the same for Pin and Delete.
 *
 * MUTATION TWO — the press drawn for an agent. Make each press ignore who is asking: remove
 * `getActor().type !== 'human'` from `PinTheFork`, remove the person half of `canRevoke` in
 * `Regulation`, and remove the `isPerson` half of the delete condition in `OneRepository`. The
 * second test of each group goes red: an agent is offered the person's own act.
 *
 * Restore both, and the file is green again. The two mutations are separate on purpose: a press
 * that is always drawn passes the "exists for the person" test and fails only the second, and a
 * press that is never drawn does the opposite. Neither mutation can pass both.
 *
 * THE WRITES FROM ANOTHER PROJECT'S PAGE (wave 13w round 1). Mutations run on 13 October 2026, each after a green
 * control, each restored:
 *   - src/web/pages/RegulationsPage.tsx, `revoke` sends no project, so the switcher's is asked: only "revokes a
 *     regulation from the page of a project it is not filed in" goes red.
 *   - the same, for `saveChineseTitle`: only "saves a Chinese title ... not filed in" goes red.
 *   - src/server/lib/office-regulations.ts reads regulation records of the asked project only: both those cases go red.
 *   - the same file says every regulation is filed in the asked project: both those cases go red.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A BROWSER TEST, AND WHY THE RECORD IS READ BACK FROM THE DOOR
 * ---------------------------------------------------------------------------------------
 *
 * All three claims are about a press. A rendered-markup test can see a button; it cannot see that
 * the third press changes what the server holds, and it cannot set who the browser is writing as.
 * So this starts a stack of its own, drives a real browser, and after each press asks the API what
 * the record now holds. `getActor` in src/web/api.ts is the one value the browser reads to decide
 * who it is, and the sidebar's picker sets the same value; an agent viewer is set here the way the
 * picker sets it, through `mole-office.actor` in the browser's own storage.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { REGULATIONS_WORDS } from '../src/web/pages/RegulationsPage.tsx'

let app: LiveApp
let page: Page

const WORKSPACE = 'default'

/** The headers a person writes with, for the seeding and for every read-back. */
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The headers a fork is filed with, because an agent is who files them. */
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
}

/** Why the person revokes the regulation. Distinctive, so it can be found again on the wire. */
const WHY = 'The world moved on and this constraint no longer binds anybody.'

/** A project of this world that files no regulation, and the regulation revoked from its page. */
const ELSEWHERE = 'a-project-with-no-regulation'
const FILED_ELSEWHERE = 'A constraint filed in default and revoked from the page of another project.'
const WHY_ELSEWHERE = 'Revoked from the page of a project it is not filed in.'
/** The Chinese title the person gives that regulation from the same page. */
const ZH_ELSEWHERE = '在另一个项目的页面上撤销的规定'
let filedElsewhereId = ''

/** The one pattern the person states in this world. */
const THE_PATTERN = 'src/server/lib/regulations.ts'

let regulationId = ''
let proposalId = ''
let moduleId = ''
let relationshipRowId = ''

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${text}`)
  return JSON.parse(text) as Record<string, unknown>
}

async function get(path: string, headers: Record<string, string> = AS_THE_PERSON): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, { headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${path} answered ${String(res.status)}: ${text}`)
  return JSON.parse(text) as Record<string, unknown>
}

/** One record's stored data, read straight from the door. */
async function storedData(id: string): Promise<Record<string, unknown>> {
  const held = (await get(`/api/records/${id}`)) as { record: { data: Record<string, unknown> } }
  return held.record.data
}

/** Every relationship the route still draws as stated for one record. */
async function statedRows(id: string): Promise<{ rowId: string; pattern: string }[]> {
  const held = (await get(`/api/implementation/record/${id}`)) as {
    repositories: { stated: { rowId: string; pattern: string }[] }[]
  }
  return held.repositories.flatMap((held) => held.stated)
}

/** Ask again until `check` has an answer, or fail with which wait timed out. */
async function waitFor<T>(check: () => Promise<T | null>, what: string, timeout = 20_000): Promise<T> {
  const startedAt = Date.now()
  for (;;) {
    const got = await check()
    if (got !== null) return got
    if (Date.now() - startedAt > timeout) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/** Open one address as the person, from nothing: no actor stored, page freshly loaded. */
async function openAsPerson(where: string, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(`${app.site}/#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.localStorage.removeItem('mole-office.actor')
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/**
 * Open one address as an agent, the way the sidebar's actor picker sets it. The reload is what
 * makes `loadActor` in src/web/api.ts read the changed value: it runs at module load, once.
 */
async function openAsAgent(where: string, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(`${app.site}/#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate(() => {
    window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'claude-code' }))
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'three-presses', viewport: { width: 1440, height: 900 } })
  page = app.page

  // A REGULATION OF THE PERSON'S OWN, filed by the person the way G3 files the real one.
  const regulation = (await post('/api/records', {
    kind: 'regulation',
    title: 'The regulation this test world holds',
    data: { sentence: 'A constraint the test wrote, in the person\'s own words.', binds: 'person', since: '2026-09-12' },
  })) as { record: { id: string } }
  regulationId = regulation.record.id

  // A FORK, filed by an agent, which is who files them.
  const proposal = (await post(
    '/api/records',
    {
      kind: 'proposal',
      title: 'Should this test pin the fork?',
      data: {
        question: 'Should this test pin the fork?',
        options: ['a — Pin it.', 'b — Leave it.'],
        who_settles_it: 'the owner',
      },
    },
    AS_AN_AGENT,
  )) as { record: { id: string } }
  proposalId = proposal.record.id

  // A MODULE THAT CAN OWN CODE, one repository registered against this checkout, and one
  // relationship the person states about it.
  const module = (await post('/api/records', {
    kind: 'module',
    title: 'The module whose code this test states',
    data: { context: 'A module for the test.', parts: [] },
  })) as { record: { id: string } }
  moduleId = module.record.id

  const repository = (await post('/api/implementation/repositories', {
    name: 'panelx-test',
    root: process.cwd(),
  })) as { repository: { id: string } }

  const relationship = (await post('/api/implementation', {
    recordId: moduleId,
    repositoryId: repository.repository.id,
    pattern: THE_PATTERN,
    relation: 'implements',
    note: 'Stated by the person in this test.',
  })) as { row: { id: string } }
  relationshipRowId = relationship.row.id
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ============================================================ 1. revoke a regulation

describe('a regulation has a Revoke press for the person, and only for the person', () => {
  it('draws the Revoke press on the person\'s own standing regulation', async () => {
    await openAsPerson('/regulations')
    await page.waitForSelector('.ofc-reg', { timeout: 30_000 })
    expect(await page.locator('.ofc-revoke button').count(), 'the person sees no Revoke press on the person\'s own regulation').toBe(1)
    expect(await page.locator('.ofc-revoke button').first().innerText()).toBe(REGULATIONS_WORDS.revoke)
  })

  it('draws no Revoke press when the viewer is an agent', async () => {
    await openAsAgent('/regulations')
    await page.waitForSelector('.ofc-reg', { timeout: 30_000 })
    // THE REGULATION IS STILL DRAWN — a page anybody may read. What is absent is the person's act.
    expect(await page.locator('.ofc-reg').count()).toBeGreaterThan(0)
    expect(await page.locator('.ofc-revoke button').count(), 'an agent is offered the person’s own act').toBe(0)
  })

  it('writes revoked_at and revoked_because through the PATCH door when the person presses it', async () => {
    await openAsPerson('/regulations')
    await page.waitForSelector('.ofc-revoke button', { timeout: 30_000 })
    await page.locator('.ofc-revoke button').first().click()
    await page.waitForSelector('.ofc-revoke textarea', { timeout: 15_000 })
    await page.locator('.ofc-revoke textarea').fill(WHY)
    await page.locator('.ofc-revoke button').first().click()

    const data = await waitFor(async () => {
      const held = await storedData(regulationId)
      return held['revoked_because'] === WHY ? held : null
    }, 'the regulation to be revoked')
    expect(data['revoked_because']).toBe(WHY)
    expect(typeof data['revoked_at']).toBe('string')
    expect(data['revoked_at'], 'the date is not a calendar day').toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // AND THE PAGE SAYS IT AS REVOKED, in the words the kind already has for that state.
    await page.waitForSelector('.ofc-reg-because', { timeout: 15_000 })
    expect(await page.locator('.ofc-reg-because').first().innerText()).toContain(WHY)
    expect(await page.locator('.ofc-revoke button').count(), 'a revoked regulation is still offered the press').toBe(0)
  })

  it('revokes a regulation from the page of a project it is not filed in, and the record where it is filed says so', async () => {
    // WAVE 13W ROUND 1, by answer mMnOgzH6UgeD on a decision.
    // Every project reads the office's regulation records, so the page of any project draws the person's regulations
    // and the press on each. The record door answers a record only in its own project, so the press addresses the
    // project the regulation is filed in.
    // Filed here, after the cases above, so they each still see one regulation.
    const second = (await post('/api/records', {
      kind: 'regulation',
      title: 'The regulation this test revokes from another project',
      data: { sentence: FILED_ELSEWHERE, binds: 'person', since: '2026-10-13' },
    })) as { record: { id: string } }
    filedElsewhereId = second.record.id
    await post('/api/workspaces', { id: ELSEWHERE, title: 'A project with no regulation' })
    await openAsPerson('/regulations')
    await page.evaluate((project) => window.localStorage.setItem('mole-office.workspace', project), ELSEWHERE)
    try {
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const row = page.locator('.ofc-reg', { hasText: FILED_ELSEWHERE })
      await row.waitFor({ timeout: 30_000 })
      await row.locator('.ofc-revoke button').first().click()
      await row.locator('.ofc-revoke textarea').waitFor({ timeout: 15_000 })
      await row.locator('.ofc-revoke textarea').fill(WHY_ELSEWHERE)
      await row.locator('.ofc-revoke button').first().click()

      const data = await waitFor(async () => {
        const held = await storedData(second.record.id)
        return held['revoked_because'] === WHY_ELSEWHERE ? held : null
      }, 'the regulation filed in default to be revoked from the page of another project')
      expect(data['revoked_at'], 'the date is not a calendar day').toMatch(/^\d{4}-\d{2}-\d{2}$/)
      await page.locator('.ofc-reg', { hasText: FILED_ELSEWHERE }).locator('.ofc-reg-because').waitFor({ timeout: 15_000 })
    } finally {
      await page.evaluate((project) => window.localStorage.setItem('mole-office.workspace', project), WORKSPACE)
    }
  }, 150_000)

  // THE PAGE OF A PROJECT THAT FILES NO REGULATION, PHOTOGRAPHED after the case above, at 1440, 990, 660 and 390 in both
  // looks. Set W13W_REGULATIONS_SHOTS to a folder to take the pictures. The ordinary run takes none and checks nothing here.
  const shots = process.env.W13W_REGULATIONS_SHOTS
  it.skipIf(shots === undefined || shots === '')('draws the regulations filed elsewhere on the page of a project that files none, at four widths in both looks', async () => {
    const out = shots as string
    mkdirSync(out, { recursive: true })
    const size = page.viewportSize()
    await openAsPerson('/regulations')
    try {
      for (const theme of ['light', 'dark']) {
        for (const width of [1440, 990, 660, 390]) {
          const name = `regulations-elsewhere-${String(width)}-${theme}`
          await page.setViewportSize({ width, height: 1000 })
          // THE LOOK AND THE PROJECT ARE READ WHEN THE PAGE LOADS, so both are stored first and the page is loaded again.
          await page.evaluate(([look, project]) => {
            window.localStorage.setItem('mole-office.preset.theme', look as string)
            window.localStorage.setItem('mole-office.workspace', project as string)
          }, [theme, ELSEWHERE])
          await page.reload({ timeout: 60_000 })
          await waitForThePage(page, 60_000)
          await page.locator('.ofc-reg', { hasText: FILED_ELSEWHERE }).waitFor({ timeout: 30_000 })
          expect(await page.locator('html').getAttribute('data-theme'), name).toBe(theme)
          const drawn = await page.evaluate(() => ({ width: innerWidth, drawn: document.documentElement.scrollWidth }))
          expect(drawn.drawn, name).toBeLessThanOrEqual(drawn.width)
          // THE WINDOW, NOT THE WHOLE PAGE: the regulations are its first section, and the chapters below them are long.
          await page.screenshot({ path: join(out, `${name}.png`) })
        }
      }
    } finally {
      if (size !== null) await page.setViewportSize(size)
      await page.evaluate((project) => {
        window.localStorage.removeItem('mole-office.preset.theme')
        window.localStorage.setItem('mole-office.workspace', project)
      }, WORKSPACE)
    }
  }, 600_000)

  it('saves a Chinese title for a regulation from the page of a project it is not filed in', async () => {
    // The title is the other write on a regulation's row, and it goes through the same record door, so it addresses
    // the project the regulation is filed in as the revoke does. It runs on the regulation the revoke case filed, after
    // the pictures, so they show no Chinese.
    expect(filedElsewhereId, 'the revoke case filed no regulation').not.toBe('')
    await openAsPerson('/regulations')
    await page.evaluate((project) => window.localStorage.setItem('mole-office.workspace', project), ELSEWHERE)
    try {
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const row = page.locator('.ofc-reg', { hasText: FILED_ELSEWHERE })
      await row.waitFor({ timeout: 30_000 })
      await row.locator('.ofc-reg-title-edit input').fill(ZH_ELSEWHERE)
      await row.locator('.ofc-reg-title-edit button').click()
      const data = await waitFor(async () => {
        const held = await storedData(filedElsewhereId)
        const zh = held['zh'] as { title?: unknown } | undefined
        return zh?.title === ZH_ELSEWHERE ? held : null
      }, 'the Chinese title to be saved on the regulation filed in default, from the page of another project')
      expect((data['zh'] as { from?: unknown }).from, 'the Chinese title names the English it was written from').toEqual(expect.any(String))
    } finally {
      await page.evaluate((project) => window.localStorage.setItem('mole-office.workspace', project), WORKSPACE)
    }
  }, 150_000)
})

// ============================================================ 2. pin a fork

describe('a fork has a Pin press for the person, and only for the person', () => {
  it('draws the Pin press on the fork’s own record page', async () => {
    await openAsPerson(`/r/${proposalId}`)
    await page.waitForSelector('.px-gov-q', { timeout: 30_000 })
    expect(await page.locator('.px-pin button').count(), 'the person sees no Pin press on the fork').toBe(1)
    expect(await page.locator('.px-pin button').first().innerText()).toBe('Pin')
  })

  it('draws no Pin press when the viewer is an agent', async () => {
    await openAsAgent(`/r/${proposalId}`)
    await page.waitForSelector('.px-gov-q', { timeout: 30_000 })
    expect(await page.locator('.px-pin button').count(), 'an agent is offered the person’s own act').toBe(0)
  })

  it('writes data.pinned when the person presses Pin, and takes the pin off when the person presses Unpin', async () => {
    await openAsPerson(`/r/${proposalId}`)
    await page.waitForSelector('.px-pin button', { timeout: 30_000 })
    await page.locator('.px-pin button').first().click()

    const pinned = await waitFor(async () => {
      const held = await storedData(proposalId)
      return held['pinned'] === true ? held : null
    }, 'the fork to be pinned')
    expect(pinned['pinned']).toBe(true)

    // THE SAME PRESS NOW SAYS UNPIN, and it writes the other value: taking a pin off is pinning in
    // the other direction.
    await page.waitForFunction(
      () => document.querySelector('.px-pin button')?.textContent?.trim() === 'Unpin',
      undefined,
      { timeout: 15_000 },
    )
    await page.locator('.px-pin button').first().click()

    const unpinned = await waitFor(async () => {
      const held = await storedData(proposalId)
      return held['pinned'] === false ? held : null
    }, 'the pin to come off')
    expect(unpinned['pinned']).toBe(false)
  })
})

// ============================================================ 3. delete a relationship

describe('a stated relationship has a Delete press for the person, and only for the person', () => {
  it('draws the Delete press on the relationship the person stated', async () => {
    await openAsPerson(`/r/${moduleId}`)
    await page.waitForSelector('.im-row', { timeout: 30_000 })
    expect(await page.locator('.im-delete button').count(), 'the person sees no Delete press on the person\'s own row').toBe(1)
    expect(await page.locator('.im-delete button').first().innerText()).toBe('Delete')
  })

  it('draws no Delete press on the person\'s row when the viewer is an agent', async () => {
    await openAsAgent(`/r/${moduleId}`)
    await page.waitForSelector('.im-row', { timeout: 30_000 })
    // THE ROW IS STILL DRAWN, so a missing press is the act being withheld and not the row.
    expect(await page.locator(`.im-pattern:has-text("${THE_PATTERN}")`).count()).toBe(1)
    expect(await page.locator('.im-delete button').count(), 'an agent is offered the person’s own act').toBe(0)
  })

  it('soft-deletes the relationship through DELETE when the person confirms', async () => {
    await openAsPerson(`/r/${moduleId}`)
    await page.waitForSelector('.im-delete button', { timeout: 30_000 })
    expect(relationshipRowId).not.toBe('')
    // THE FIRST PRESS ASKS; THE SECOND IS THE CONFIRM. Deleting is not an alarm until it is one.
    await page.locator('.im-delete button').first().click()
    expect(await page.locator('.im-delete button').count()).toBe(2)
    await page.locator('.im-delete button').first().click()

    await waitFor(async () => {
      const rows = await statedRows(moduleId)
      return rows.some((held) => held.rowId === relationshipRowId) ? null : true
    }, 'the relationship to be deleted')
    const rows = await statedRows(moduleId)
    expect(rows.map((held) => held.rowId)).not.toContain(relationshipRowId)
    // AND THE PANEL READ AGAIN, so the press is gone from the screen and not left offering to
    // delete a row that is already deleted. The module page's separate "Claimed source" panel
    // keeps its own read — the same as the accept press has always done — so this waits on the
    // press that lives in the panel the delete was made in.
    await page.waitForFunction(
      () => document.querySelectorAll('.im-delete button').length === 0,
      undefined,
      { timeout: 15_000 },
    )
  })
})
