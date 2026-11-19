// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT LIST IS JUDGED AGAINST THE PROJECT IT WAS ASKED UNDER.
 *
 * Problem `bFwKhPWp7V0s`. A browser that has never chosen a project starts on "default". Opened
 * straight at a record of another project, it sends its one read of the project list under
 * "default". The record page then learns that the record lives elsewhere and moves the browser
 * there. If the list's reply arrives after that move, its `current` field still says "default".
 *
 * The frame used to record the reply as read for the project on screen when the reply ARRIVED. So
 * the reply was taken as an answer about the second project, and the frame drew "Wrong project
 * answered" with a press offering to read "default" instead. Every row on the page was the second
 * project's. `readWorkspacesOnce` now records the project the read was SENT under, from the same
 * value the request's header was set from, and the frame judges the reply against that.
 *
 * THE ORDER IS MADE CERTAIN, NOT LUCKY. The request for the list is held in the browser, and the
 * test reads the header it carried, so it can say the request really was sent under "default".
 * Since problem ipeva-Ir-5by, a browser that has never chosen a project draws no page until the list
 * has answered, so the record page cannot move the browser while the list is held. The list is let
 * through, and then the record page moves the browser to the second project. The reply in hand was
 * still sent under "default", which is the case this file is about.
 *
 * AND THE TRUE WARNING STILL FIRES. The warning exists for a real mismatch: a reply sent under the
 * project on screen that says it answered about another one. The second case makes that happen by
 * rewriting the reply's `current`, and asks for the warning.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Route } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import { theProjectIdOnScreen, waitForTheProjects } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': DEFAULT_WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * A SECOND PROJECT, and one record that lives only in it.
 *
 * "default" keeps more records than this one on purpose. `openingWorkspace` moves a browser that
 * has never chosen a project to the project with the most work in it, and here the browser has to
 * start on "default" for the read of the list to be sent under it.
 */
const SECOND = { id: 'second-project', title: 'Second Project', record: 'The second project holds a record of its own' }
let secondRecordId = ''

/** Where this browser keeps its project. The name is src/web/lib/workspace.ts's `WORKSPACE_KEY`. */
const WORKSPACE_KEY = 'mole-office.workspace'

async function file(workspace: string, title: string): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': workspace },
    body: JSON.stringify({ kind: 'problem', title, data: { state: 'open' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** Whether a route is the read of the project list, and not some other door under /api. */
function isTheProjectList(route: Route): boolean {
  const request = route.request()
  return request.method() === 'GET' && new URL(request.url()).pathname === '/api/workspaces'
}

beforeAll(async () => {
  app = await liveApp({ name: 'project-read-for', viewport: { width: 1440, height: 1000 } })
  const project = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ id: SECOND.id, title: SECOND.title }),
  })
  expect(project.status, await project.text()).toBe(201)
  await file(DEFAULT_WORKSPACE, 'A first problem that stays in the default project')
  await file(DEFAULT_WORKSPACE, 'A second problem that stays in the default project')
  secondRecordId = await file(SECOND.id, SECOND.record)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the frame judges the project list against the project it was asked under', () => {
  it('draws no false warning when a fresh browser opens straight at a record of another project', async () => {
    // A NEW CONTEXT, so nothing is stored and the browser starts on "default".
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    try {
      const page = await context.newPage()

      // HOLD THE PROJECT LIST until the page has moved. Every other door goes straight through.
      let release: () => void = () => undefined
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      const sentUnder: string[] = []
      await page.route('**/api/**', async (route) => {
        if (isTheProjectList(route)) {
          sentUnder.push(route.request().headers()['x-mole-office-workspace'] ?? '(no header)')
          await released
        }
        await route.continue()
      })

      await page.goto(`${app.site}/#/r/${secondRecordId}`)

      // THE LIST IS ASKED UNDER "default" AND HELD, and nothing moves the browser meanwhile.
      await expect.poll(() => sentUnder.length, { timeout: 30_000 }).toBeGreaterThan(0)
      expect(sentUnder[0], 'the held read of the project list was not sent under "default"').toBe(DEFAULT_WORKSPACE)
      expect(await page.evaluate((key) => window.localStorage.getItem(key), WORKSPACE_KEY)).toBe(null)
      release()

      // THEN THE RECORD PAGE MOVES THE BROWSER TO THE SECOND PROJECT, with the reply read under "default".
      await page.waitForFunction(
        ([key, id]) => window.localStorage.getItem(key) === id,
        [WORKSPACE_KEY, SECOND.id] as const,
        { timeout: 30_000 },
      )

      // THE LIST ARRIVES, and the project block reads the second project.
      await page.waitForFunction(
        (id: string) => document.querySelector('.sbp-block[data-projects="ready"]')?.getAttribute('data-project') === id,
        SECOND.id,
        { timeout: 30_000 },
      )
      await page.waitForSelector('.rp-title', { timeout: 30_000 })
      expect(await page.locator('.rp-title').first().innerText()).toBe(SECOND.record)

      // AND NO FALSE WARNING, and no press offering to go back to "default".
      expect(
        await page.locator('.shell-fault', { hasText: 'Wrong project answered' }).count(),
        'the frame said the wrong project answered, while every row on the page is the second project\'s',
      ).toBe(0)
      expect(
        await page.locator('.shell-project-out', { hasText: 'Read the default project' }).count(),
        'the frame offered to read "default" instead',
      ).toBe(0)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('still warns when a reply sent under the project on screen says it answered about another', async () => {
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    try {
      const page = await context.newPage()

      // THE REPLY IS REWRITTEN to say it answered about the second project, while the request was
      // sent under "default" and "default" stays on screen.
      const sentUnder: string[] = []
      await page.route('**/api/**', async (route) => {
        if (!isTheProjectList(route)) return route.continue()
        sentUnder.push(route.request().headers()['x-mole-office-workspace'] ?? '(no header)')
        const response = await route.fetch()
        const body = (await response.json()) as { current: { id: string; stated: boolean } }
        body.current = { id: SECOND.id, stated: true }
        await route.fulfill({ response, json: body })
      })

      await page.goto(`${app.site}/#/records`)
      await waitForTheProjects(page)
      expect(await theProjectIdOnScreen(page)).toBe(DEFAULT_WORKSPACE)
      expect(sentUnder[0], 'the read of the project list was not sent under "default"').toBe(DEFAULT_WORKSPACE)

      await page
        .locator('.shell-fault', { hasText: 'Wrong project answered' })
        .first()
        .waitFor({ timeout: 30_000 })
    } finally {
      await context.close()
    }
  }, 120_000)
})
