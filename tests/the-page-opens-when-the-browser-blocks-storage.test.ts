// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13j round 14): the switcher case read the second project's record on #/records. A
// decision has All records read across projects now. So the case reads an idea of the second
// project on #/ideas, one of the project's own pages. What it proves is unchanged.
/**
 * THE APP STARTS WHEN THE BROWSER REFUSES TO REMEMBER ANYTHING.
 *
 * Criterion M6 of design/messages/ACCEPTANCE.md asks that the chat panel work with storage blocked.
 * It did not, and the panel was not the reason: `Chat.tsx` reads through `src/web/lib/store.ts`,
 * which catches and answers with a reason, and the honest answer when nothing can be read is
 * "closed". The app never got that far. Two modules read `window.localStorage` while they were
 * still being evaluated, so the whole page drew "Mole Office did not start" and there was no circle
 * on it at all. Problem `uihbRUojyr2p`.
 *
 * ---------------------------------------------------------------------------------------
 * STORAGE IS BLOCKED THE TWO WAYS A REAL BROWSER BLOCKS IT
 * ---------------------------------------------------------------------------------------
 *
 * 1. **The property throws.** Reading `window.localStorage` at all fails. This is what Chrome does
 *    when site data is blocked, and it is the one a `try` around `getItem` does not catch: the
 *    expression fails before the call is made.
 * 2. **The methods throw.** The property is there and `getItem` and `setItem` throw. This is closer
 *    to what Safari's private browsing used to do.
 *
 * Both are set with `addInitScript`, so they are in place before any of the app's code is
 * evaluated — which is the point, because the failure was at import time.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY IT IS NOT "NO ERRORS"
 * ---------------------------------------------------------------------------------------
 *
 * That the shell drew and the panel opens. A page can log a handled complaint about storage and be
 * perfectly usable — that is what this product does on purpose — so the measurement is what a
 * reader can see and press, not a silent console.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE TWO PATHS THE PROBLEM ACTUALLY NAMED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `vwyWGzSyCDl7` names a second failure beside the boot one: `setWorkspace` called
 * `window.localStorage.setItem` with no guard, so the WRITE made after a project change threw and
 * left a blank page. That write is the one at src/web/lib/workspace.ts, and by the time this file
 * grew these two cases it had been wrapped like its siblings — but the two paths were never driven
 * with storage refused, so nobody could say from a measurement that the fix reached them. They are
 * driven here for both ways a browser blocks storage:
 *
 *   1. the switcher moves the reader, and a reload is allowed to forget the choice; and
 *   2. the address of a record filed in another project opens that record's own page.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { switchTheProject, theProjectIdOnScreen, theProjectOnScreen, waitForTheProjects } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * A SECOND PROJECT, and one record that lives only in it.
 *
 * THE TWO CASES BELOW NEED A PROJECT THAT IS NOT THE ONE THE BROWSER OPENS ON. The switcher has
 * to have somewhere to move to, and the record whose address is opened has to be filed somewhere
 * the browser is not reading — which is the problem's own `how_to_tell_it_is_back`, "open any
 * record that is not in the currently chosen project". The default project keeps more records than
 * this one on purpose, so `openingWorkspace` has no reason to move a never-chosen browser off the
 * stated default and the reload assertion below can name that default.
 */
const SECOND = {
  id: 'second-project',
  title: 'Second Project',
  record: 'The second project holds a record of its own',
  // AN IDEA OF ITS OWN TOO, drawn on #/ideas, one of the project's own pages. All records reads across
  // projects, so it no longer shows the switch.
  idea: 'The second project holds an idea of its own',
}
let secondRecordId = ''

/** Every way this test blocks storage, with the name that goes in the failure message. */
const BLOCKED = [
  {
    how: 'the property itself throws, which is what Chrome does when site data is blocked',
    script: `
      const refuse = () => { throw new Error('Access to storage is not allowed from this context.') }
      Object.defineProperty(window, 'localStorage', { configurable: true, get: refuse })
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get: refuse })
    `,
  },
  {
    how: 'the store is there and every method throws',
    script: `
      const refusing = {
        getItem() { throw new Error('The operation is insecure.') },
        setItem() { throw new Error('The operation is insecure.') },
        removeItem() { throw new Error('The operation is insecure.') },
        clear() { throw new Error('The operation is insecure.') },
        key() { throw new Error('The operation is insecure.') },
        get length() { throw new Error('The operation is insecure.') },
      }
      Object.defineProperty(window, 'localStorage', { configurable: true, get: () => refusing })
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => refusing })
    `,
  },
] as const

beforeAll(async () => {
  app = await liveApp({ name: 'storage-blocked', viewport: { width: 1440, height: 1000 } })
  // ONE AGENT AND ONE MESSAGE, so the panel has a contact to draw rather than an empty list. What is
  // under test is that the panel opens at all, and an empty panel opening would prove that too;
  // this makes the failure easier to read when it comes.
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder X',
      data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-x' },
    body: JSON.stringify({
      kind: 'message',
      title: 'The wrist camera fit is holding',
      data: { body: 'The wrist camera fit is holding at 0.4 px.', to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.text()).toBe(201)

  // A SECOND PROJECT, AND A RECORD IN IT. The switcher's options come from the server's list of
  // projects, so the project has to exist before a browser opens the page. The record is captured by
  // id because the second case opens its own address.
  const project = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ id: SECOND.id, title: SECOND.title }),
  })
  expect(project.status, await project.text()).toBe(201)
  const filedInSecond = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': SECOND.id },
    body: JSON.stringify({ kind: 'problem', title: SECOND.record, data: { state: 'open' } }),
  })
  expect(filedInSecond.status, await filedInSecond.clone().text()).toBe(201)
  secondRecordId = ((await filedInSecond.json()) as { record: { id: string } }).record.id
  const ideaInSecond = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-workspace': SECOND.id },
    body: JSON.stringify({ kind: 'idea', title: SECOND.idea, data: {} }),
  })
  expect(ideaInSecond.status, await ideaInSecond.text()).toBe(201)
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the browser app starts when the browser refuses to remember anything', () => {
  for (const blocked of BLOCKED) {
    it(`draws the shell and opens the panel when ${blocked.how}`, async () => {
      const page = await app.browser.newPage({ viewport: { width: 1440, height: 1000 } })
      try {
        await page.addInitScript(blocked.script)
        await page.goto(`${app.site}/#/`)

        // THE SHELL IS THERE. `.boot-failure` is the markup index.html ships inside #root, which
        // React replaces the moment it renders anything. Its presence is the failure this file is
        // about, so it is asserted directly rather than through something that implies it.
        await page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
        expect(await page.$('.boot-failure'), 'the page is still showing "Mole Office did not start"').toBeNull()
        expect(await page.$('.shell'), 'the app shell did not draw').not.toBeNull()
        expect(await page.$('.shell-bar'), 'the top bar did not draw').not.toBeNull()

        // AND THE PANEL OPENS, WITH NOTHING REMEMBERED. Whether it was open last time cannot be
        // read, and the honest answer to that is closed, so it starts closed and one press opens it.
        expect(await page.$('.px-chat'), 'the panel was open before anything was pressed').toBeNull()
        await page.click('.px-chat-circle')
        await page.waitForSelector('.px-chat', { timeout: 20_000 })
        // AND IT DRAWS THE POOL. The contacts are a request, so this waits for one rather than
        // asking whether it has arrived in the same breath as the press.
        await page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
      } finally {
        await page.close()
      }
    }, 120_000)
  }

  /**
   * THE SWITCHER MOVES THE READER, EVEN WHEN NOTHING CAN BE REMEMBERED.
   *
   * Problem `vwyWGzSyCDl7` is about the write `setWorkspace` makes after the move. The switcher
   * calls `setWorkspace` on the reader's own press, and a browser that refuses that write has to
   * still move: the project is applied in memory and only the memory of it is lost.
   */
  for (const blocked of BLOCKED) {
    it(`moves to a project chosen in the switcher when ${blocked.how}`, async () => {
      const page = await app.browser.newPage({ viewport: { width: 1440, height: 1000 } })
      try {
        await page.addInitScript(blocked.script)
        await page.goto(`${app.site}/#/ideas`)

        // THE LIST OF PROJECTS HAS TO ARRIVE before the Switch list can offer one, so waiting for
        // it is waiting for the shell.
        await waitForTheProjects(page, 20_000)
        expect(await page.$('.boot-failure'), 'the page is showing "Mole Office did not start"').toBeNull()

        // THE PRESS A READER MAKES.
        await switchTheProject(page, SECOND.id)

        // THE MOVE HAPPENS AND THE NEW PROJECT IS DRAWN. The project block reads the second project,
        // it draws its name, and the record that lives only there is on the page.
        await page.waitForFunction(
          (id: string) => document.querySelector('.sbp-block')?.getAttribute('data-project') === id,
          SECOND.id,
          { timeout: 20_000 },
        )
        expect(await theProjectOnScreen(page)).toContain(SECOND.title)
        await page.getByText(SECOND.idea).first().waitFor({ timeout: 20_000 })
        expect(await page.$('.boot-failure'), 'the page blanked when the switcher moved').toBeNull()
        expect(
          await page.evaluate(() => (document.querySelector('#root')?.textContent ?? '').length),
          '#root has nothing in it after the switch',
        ).toBeGreaterThan(0)

        // THE CHOICE IS NOT REMEMBERED ACROSS A RELOAD, AND THAT IS THE CORRECT BEHAVIOUR. The write
        // answered that this browser will not keep "mole-office.workspace", so a reload is a browser
        // that has never chosen and it falls back to the stated default. A browser that cannot
        // remember is allowed to forget; it is not allowed to break, so the reload is asserted for
        // exactly what the first load was: the shell draws, `.boot-failure` is absent and #root has
        // characters in it.
        await page.reload()
        await waitForTheProjects(page, 20_000)
        expect(
          await theProjectIdOnScreen(page),
          'the browser remembered a project it said it could not remember',
        ).toBe(DEFAULT_WORKSPACE)
        expect(await page.$('.boot-failure'), 'the page blanked on a reload it could not remember across').toBeNull()
        expect(
          await page.evaluate(() => (document.querySelector('#root')?.textContent ?? '').length),
          '#root has nothing in it after a reload',
        ).toBeGreaterThan(0)
      } finally {
        await page.close()
      }
    }, 120_000)
  }

  /**
   * A RECORD IN ANOTHER PROJECT OPENS, EVEN WHEN NOTHING CAN BE REMEMBERED.
   *
   * The problem's own `how_to_tell_it_is_back`: open any record that is not in the currently chosen
   * project. The record page reads it, the server answers that it is in another project, and
   * `ui.tsx` either moves the reader there in an effect or offers the "Open it in <project>" press.
   * That move calls `setWorkspace`, which is the write the problem named.
   */
  for (const blocked of BLOCKED) {
    it(`opens a record that lives in another project when ${blocked.how}`, async () => {
      const page = await app.browser.newPage({ viewport: { width: 1440, height: 1000 } })
      try {
        await page.addInitScript(blocked.script)
        // START ON THE PROJECT THE BROWSER OPENS ON, then open the record's own address.
        await page.goto(`${app.site}/#/`)
        await page.waitForSelector('.shell', { timeout: 20_000 })
        await page.goto(`${app.site}/#/r/${secondRecordId}`)

        // THE EFFECT IN ui.tsx MOVES THE READER. If the record's own page has not drawn shortly, the
        // button that makes the same move is pressed instead. Either way the record has to draw.
        const drewByItself = await page
          .waitForSelector('.rp-title', { timeout: 8_000 })
          .then(() => true)
          .catch(() => false)
        if (!drewByItself) {
          await page.getByRole('button', { name: /^Open it in / }).click({ timeout: 10_000 })
        }
        await page.waitForSelector('.rp-title', { timeout: 20_000 })

        // THE RECORD'S OWN PAGE DREW, in the project that really holds it, at the record's address.
        expect(await page.locator('.rp-title').first().innerText()).toBe(SECOND.record)
        expect(await theProjectIdOnScreen(page)).toBe(SECOND.id)
        expect(await page.evaluate(() => window.location.hash)).toBe(`#/r/${secondRecordId}`)
        expect(await page.$('.boot-failure'), 'the page blanked opening a record in another project').toBeNull()
        expect(
          await page.evaluate(() => (document.querySelector('#root')?.textContent ?? '').length),
          '#root has nothing in it after opening a record in another project',
        ).toBeGreaterThan(0)
      } finally {
        await page.close()
      }
    }, 120_000)
  }
})
