// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT IS MADE FROM THE SIDEBAR'S SWITCH, wave 13y round 175, as decided.
 *
 * The Switch's list ends with a New project press, below the projects. The press opens the making form in the list,
 * in its place: the name with its label and its example, Make and Cancel, with the checks, the words, the developer-mode
 * line and the door Settings › Projects had. Make closes the list and switches to the new project. Cancel brings the
 * press back, and closing the list forgets what was typed. Settings › Projects keeps only the rename press. Each case
 * runs at 1440 and at 390, where the sidebar is the menu, and the last runs at four window sizes, two of them short.
 *
 * It fails when:
 * - the list's last press is not New project, a project stands outside the projects' part of the list, or New project
 *   stands above that part;
 * - the press does not open the form in its place, the field has another label or example, Make can be pressed with
 *   no name or with a name with no letter or digit, the form draws other words for that name, or Cancel does not
 *   bring the press back;
 * - the developer-mode line is drawn outside developer mode, or not drawn in it;
 * - the list opened again after it closed still holds the form or what was typed;
 * - Make does not reach POST /api/workspaces and get 201, the list stays open, the sidebar names another project, or
 *   the list opened again does not hold the new project as the current one;
 * - Settings › Projects draws a make press, or draws no rename press;
 * - with the form open, the page is wider than the window, or a part of the form is wider than the list;
 * - opening the list, or pressing New project in it, moves a row of the sidebar, or scrolls the sidebar or the page;
 * - with the list open, the list does not lie wholly inside the window below its press;
 * - with the form open, the list does not lie wholly inside the window, or it ends above the Switch's foot;
 * - at 1440 the open list or the open form covers a row of the sidebar;
 * - with the form open at 1440 by 900, 390 by 900, 1440 by 700 or 390 by 667, whatever name is typed, the field, Make
 *   or Cancel does not lie wholly inside the window, or something else is drawn at its centre or at its top or bottom
 *   edge.
 *
 * It runs in a test office with made-up projects and a made-up name for the person.
 *
 * Test change (wave 13y round 175, as decided): the field's label is Name. The list is drawn as a layer over the page,
 * beside the sidebar at 1440 and over the menu at 390, so the form is held inside the list and not the sidebar, and two
 * cases ask that the list move nothing in the sidebar and lie inside the window.
 *
 * Test change (wave 13y round 175, as decided): the projects scroll in their own part of the list, and New project or
 * its form stays whole below that part, so New project is held below the part and not below each project's box. Where
 * the room under the Switch is too short for the form, the list rises until its foot is inside the window, so the open
 * form's list may cover the Switch, and is held to end below the Switch's foot.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { openTheProjectList, theProjectIdOnScreen, theProjectOnScreen, waitForTheProjects } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'

const en = createI18n('en')
const PROJECTS = [{ id: 'test-copper', title: 'Copper Studio' }, { id: 'test-lake', title: 'Lake Books' }]
const PERSON = 'Robin Vale'
const WIDTHS = [1440, 390] as const
/** The window sizes at which the open form is read whole, the short ones as well. */
const SIZES = [{ width: 1440, height: 900 }, { width: 390, height: 900 }, { width: 1440, height: 700 }, { width: 390, height: 667 }] as const
const panel = `[data-target="${targetAttributeValue({ kind: 'uiSurface', surfaceId: 'settings.projects' })}"]`

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'new-project-switch', workspace: 'default', viewport: { width: 1440, height: 900 } })
  // THE LIST OPENS AND CLOSES AT ONCE, so a case reads where the list ends and not a motion on the way.
  await app.page.emulateMedia({ reducedMotion: 'reduce' })
  const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  for (const project of PROJECTS) {
    const made = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers, body: JSON.stringify(project) })
    expect(made.status, await made.text()).toBe(201)
  }
  // A made-up name for the person, because the sidebar's foot draws the person's name.
  const named = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers, body: JSON.stringify({ name: PERSON }) })
  expect(named.status, await named.text()).toBe(200)
  // Every load starts in the same project, so a project made by one case does not move the next.
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.workspace', 'test-copper')
    localStorage.setItem('mole-office.preset.theme', 'light')
  })
}, 240_000)

afterAll(async () => { await app?.stop() })

// A LOAD EVERY TIME. Going to the same address with a hash is a move inside the page, not a load, so each open carries
// a number of its own.
let loads = 0
async function open(width: number, address: string, query = 'lang=en', height = 900): Promise<void> {
  await app.page.setViewportSize({ width, height })
  loads += 1
  await app.page.goto(`${app.site}/?${query}&load=${String(loads)}#${address}`)
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
}

/** At 390 the sidebar is the menu, so it is opened with the menu press, as a person opens it. */
async function openTheSidebar(): Promise<void> {
  const menu = app.page.locator('.shell-menu')
  if (await menu.isVisible() && (await menu.getAttribute('aria-expanded')) !== 'true') await menu.click()
}

/** Open the sidebar and its Switch list, and press New project. Answers the list. */
async function openTheForm() {
  await openTheSidebar()
  const list = await openTheProjectList(app.page)
  await list.getByRole('button', { name: en.t('sidebarProject.newProject'), exact: true }).click()
  return list
}

/** Where each row of the sidebar and its foot stand, and how far the page and the sidebar's two scrollers are scrolled. */
async function theSidebarAsItStands() {
  return app.page.evaluate(() => {
    const rows = [...document.querySelectorAll('#shell-side .shell-list > li, #shell-side .sbp-foot')].map((one) => {
      const box = one.getBoundingClientRect()
      return { row: one.querySelector('[data-target]')?.getAttribute('data-target') ?? one.getAttribute('class') ?? '', top: box.top, left: box.left, width: box.width, height: box.height }
    })
    const scrolled = (selector: string) => document.querySelector(selector)?.scrollTop ?? null
    return { rows, scrolled: { page: window.scrollY, sidebar: scrolled('#shell-side .shell-side-inner'), sidebarRows: scrolled('#shell-side .sbp-scroll') } }
  })
}

/** The centre of each row of the sidebar that stands in the window, by its place among the rows. */
async function theRowCentres() {
  return app.page.evaluate(() => [...document.querySelectorAll('#shell-side .shell-list > li')].flatMap((one, index) => {
    const box = one.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const row = one.querySelector('[data-target]')?.getAttribute('data-target') ?? String(index)
    return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight ? [{ index, row, x, y }] : []
  }))
}

/** The list's box against the window and its press, and the rows whose noted centre is no longer the row. */
async function whereTheListLies(centres: readonly { index: number; row: string; x: number; y: number }[]) {
  return app.page.evaluate((noted) => {
    const list = document.querySelector('#sbp-choices')!.getBoundingClientRect()
    const press = document.querySelector('.sbp-switch')!.getBoundingClientRect()
    const rows = [...document.querySelectorAll('#shell-side .shell-list > li')]
    const covered = noted.filter((centre) => {
      const there = document.elementFromPoint(centre.x, centre.y)
      return there === null || rows[centre.index]?.contains(there) !== true
    }).map((centre) => centre.row)
    return {
      inside: list.left >= 0 && list.top >= 0 && list.right <= window.innerWidth && list.bottom <= window.innerHeight,
      belowThePress: list.top >= press.bottom,
      endsBelowThePress: list.bottom > press.bottom,
      covered,
    }
  }, centres)
}

for (const width of WIDTHS) {
  it(`at ${String(width)} the Switch's list ends with the New project press, below every project`, async () => {
    await open(width, '/ideas')
    await openTheSidebar()
    const list = await openTheProjectList(app.page)
    const press = list.getByRole('button', { name: en.t('sidebarProject.newProject'), exact: true })
    expect(await press.count()).toBe(1)
    expect(await press.isVisible()).toBe(true)
    expect(await press.evaluate((one) => {
      const all = one.closest('#sbp-choices')!.querySelectorAll('button')
      return all[all.length - 1] === one
    }), 'New project is the list’s last press').toBe(true)
    const choices = await list.locator('.sbp-choice').all()
    // The default project and the two made-up ones.
    expect(choices.length).toBeGreaterThanOrEqual(PROJECTS.length + 1)
    // Test change (wave 13y round 175, as decided): the projects scroll in their own part of the list, so a project
    // scrolled out of that part reaches below it. New project is held below the part, and every project is in it.
    expect(await list.locator('.sbp-choice-list .sbp-choice').count(), 'the projects in the projects’ part').toBe(choices.length)
    const projects = (await list.locator('.sbp-choice-list').boundingBox())!
    expect((await press.boundingBox())!.y, 'New project below the projects’ part').toBeGreaterThanOrEqual(projects.y + projects.height)
  }, 120_000)

  it(`at ${String(width)} New project opens the form, a name with no letter or digit leaves Make disabled, and Cancel brings the press back`, async () => {
    await open(width, '/ideas')
    const list = await openTheForm()
    const press = list.getByRole('button', { name: en.t('sidebarProject.newProject'), exact: true })
    const field = list.getByLabel(en.t('sidebarProject.newProjectName'), { exact: true })
    const make = list.getByRole('button', { name: en.t('nav.make'), exact: true })
    await field.waitFor()
    expect(await press.count(), 'the form stands in the press’s place').toBe(0)
    expect(await field.getAttribute('placeholder')).toBe(en.t('nav.exampleName'))
    expect(await make.isDisabled(), 'Make with no name').toBe(true)
    await field.fill('...')
    expect(await list.innerText()).toContain(en.t('nav.nameForCreation'))
    expect(await make.isDisabled(), 'Make with a name of no letter or digit').toBe(true)
    // Outside developer mode the form does not say how the name is stored.
    await field.fill('Kite Works')
    expect(await make.isDisabled()).toBe(false)
    expect(await list.innerText()).not.toContain(en.t('nav.storedAs', { id: 'kite-works' }))
    await list.getByRole('button', { name: en.t('nav.cancel'), exact: true }).click()
    await press.waitFor()
    expect(await field.count(), 'Cancel closes the form').toBe(0)
    // CLOSING THE LIST FORGETS WHAT WAS TYPED: the list opened again offers the press, and the form opens empty.
    await press.click()
    await field.fill('Half a name')
    await app.page.locator('.sbp-switch').click()
    await list.waitFor({ state: 'hidden' })
    await openTheProjectList(app.page)
    await press.waitFor()
    expect(await field.count(), 'the list opened again holds no form').toBe(0)
    await press.click()
    expect(await field.inputValue()).toBe('')
    // In developer mode the form says how the name is stored, as Settings › Projects did.
    await open(width, '/ideas', 'lang=en&mode=inspect')
    const inspected = await openTheForm()
    await inspected.getByLabel(en.t('sidebarProject.newProjectName'), { exact: true }).fill('Kite Works')
    expect(await inspected.innerText()).toContain(en.t('nav.storedAs', { id: 'kite-works' }))
  }, 120_000)

  it(`at ${String(width)} a name and Make file the project, close the list and switch to it`, async () => {
    await open(width, '/ideas')
    const name = `Kite Works ${String(width)}`
    const id = `kite-works-${String(width)}`
    const list = await openTheForm()
    await list.getByLabel(en.t('sidebarProject.newProjectName'), { exact: true }).fill(name)
    const answered = app.page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workspaces')
    await list.getByRole('button', { name: en.t('nav.make'), exact: true }).click()
    expect((await answered).status()).toBe(201)
    await list.waitFor({ state: 'hidden' })
    await app.page.waitForFunction((made) => document.querySelector('.sbp-name')?.textContent === made, name)
    expect(await theProjectOnScreen(app.page)).toBe(name)
    expect(await theProjectIdOnScreen(app.page)).toBe(id)
    await openTheSidebar()
    const again = await openTheProjectList(app.page)
    const made = again.getByRole('button', { name, exact: true })
    expect(await made.count(), 'the list holds the new project').toBe(1)
    expect(await made.getAttribute('aria-current'), 'the new project is the one read').toBe('true')
  }, 120_000)

  it(`at ${String(width)} Settings › Projects draws no make press and still draws the rename press`, async () => {
    await open(width, '/settings')
    await openSettingsPanel(app.page, 'settings.projects')
    const projects = app.page.locator(panel)
    await projects.getByRole('button', { name: en.t('nav.renameProject'), exact: true }).waitFor()
    for (const key of ['nav.makeProject', 'sidebarProject.newProject', 'nav.make'] as const) {
      expect(await projects.getByRole('button', { name: en.t(key), exact: true }).count(), key).toBe(0)
    }
  }, 120_000)

  // Test change (wave 13y round 175, as decided): the list is a layer, beside the sidebar at 1440, so the form is held
  // inside the list and no longer inside the sidebar.
  it(`at ${String(width)} the open form fits inside the list and nothing is wider than the window`, async () => {
    // Developer mode, so the longest line the form draws for a name is drawn too.
    await open(width, '/ideas', 'lang=en&mode=inspect')
    const list = await openTheForm()
    const field = list.getByLabel(en.t('sidebarProject.newProjectName'), { exact: true })
    for (const typed of ['', 'A very long project name for the narrow menu', '...']) {
      await field.fill(typed)
      const measured = await app.page.evaluate(() => {
        const side = document.querySelector('#sbp-choices')!.getBoundingClientRect()
        const form = document.querySelector('#sbp-choices form')!
        const outside = [form, ...form.querySelectorAll('*')].filter((one) => {
          const box = one.getBoundingClientRect()
          return box.left < side.left - 0.5 || box.right > side.right + 0.5
        }).map((one) => one.tagName.toLowerCase())
        return { page: document.documentElement.scrollWidth, window: window.innerWidth, outside }
      })
      expect(measured.page, `the page with "${typed}" typed`).toBeLessThanOrEqual(measured.window)
      expect(measured.outside, `the parts of the form wider than the list with "${typed}" typed`).toEqual([])
    }
  }, 120_000)

  it(`at ${String(width)} opening the list and pressing New project move no row and scroll nothing`, async () => {
    await open(width, '/ideas')
    await openTheSidebar()
    const closed = await theSidebarAsItStands()
    expect(closed.rows.length, 'the rows noted').toBeGreaterThan(0)
    const list = await openTheProjectList(app.page)
    expect(await theSidebarAsItStands(), 'the sidebar with the list open').toEqual(closed)
    await list.getByRole('button', { name: en.t('sidebarProject.newProject'), exact: true }).click()
    await list.getByLabel(en.t('sidebarProject.newProjectName'), { exact: true }).waitFor()
    expect(await theSidebarAsItStands(), 'the sidebar with the form open').toEqual(closed)
  }, 120_000)

  it(`at ${String(width)} the open list and the open form lie inside the window${width === 1440 ? ' and cover no row' : ''}`, async () => {
    // Developer mode, so the form draws its longest lines.
    await open(width, '/ideas', 'lang=en&mode=inspect')
    await openTheSidebar()
    // Each row's centre is noted before the list opens, so a row the list pushed away is found covered as well.
    const centres = await theRowCentres()
    expect(centres.length, 'the rows seen in the window').toBeGreaterThan(0)
    const list = await openTheProjectList(app.page)
    const opened = await whereTheListLies(centres)
    expect(opened.inside, 'the open list inside the window').toBe(true)
    expect(opened.belowThePress, 'the open list below the Switch').toBe(true)
    if (width === 1440) expect(opened.covered, 'the rows the open list covers').toEqual([])
    await list.getByRole('button', { name: en.t('sidebarProject.newProject'), exact: true }).click()
    const field = list.getByLabel(en.t('sidebarProject.newProjectName'), { exact: true })
    for (const typed of ['', 'A very long project name for the narrow menu', '...']) {
      await field.fill(typed)
      const formed = await whereTheListLies(centres)
      expect(formed.inside, `the open form inside the window with "${typed}" typed`).toBe(true)
      // Test change (wave 13y round 175, as decided): where the room under the Switch is too short for the form, the
      // list rises until its foot is inside the window. It may cover the Switch then, and still ends below it.
      expect(formed.endsBelowThePress, `the open form's list ending below the Switch with "${typed}" typed`).toBe(true)
      if (width === 1440) expect(formed.covered, `the rows the open form covers with "${typed}" typed`).toEqual([])
    }
  }, 120_000)
}

// THE FORM OPENS WHOLE IN VIEW (wave 13y round 175, as decided): its field, Make and Cancel stand in the window at once,
// with nothing drawn over them, so nobody scrolls the list, the menu or the page to reach them. The case presses and
// types only.
for (const { width, height } of SIZES) {
  it(`at ${String(width)} by ${String(height)} the New project form opens with its field, Make and Cancel in view, whatever name is typed`, async () => {
    // Developer mode, so the form draws its longest lines.
    await open(width, '/ideas', 'lang=en&mode=inspect', height)
    const list = await openTheForm()
    const field = list.getByLabel(en.t('sidebarProject.newProjectName'), { exact: true })
    const controls = [
      { name: 'the field', control: field },
      { name: 'Make', control: list.getByRole('button', { name: en.t('nav.make'), exact: true }) },
      { name: 'Cancel', control: list.getByRole('button', { name: en.t('nav.cancel'), exact: true }) },
    ]
    for (const typed of ['', 'A very long project name for the narrow menu', '...']) {
      await field.fill(typed)
      // The list is placed again in the frame after the form changes its height, so it is read two frames later.
      await app.page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
      for (const { name, control } of controls) {
        const box = await control.boundingBox()
        expect(box, `${name} drawn with "${typed}" typed`).not.toBeNull()
        const { x: left, y: top, width: across, height: down } = box!
        expect(left >= 0 && top >= 0 && left + across <= width && top + down <= height, `${name} inside the window with "${typed}" typed`).toBe(true)
        // A control the list cuts off at its foot can still be drawn at its centre, so its top and bottom edges are read
        // as well, a pixel inside each.
        expect(await control.evaluate((one) => {
          const at = one.getBoundingClientRect()
          const x = at.left + at.width / 2
          return [at.top + 1, at.top + at.height / 2, at.bottom - 1].every((y) => {
            const there = document.elementFromPoint(x, y)
            return there !== null && one.contains(there)
          })
        }), `${name} drawn at its centre and at its top and bottom edges with "${typed}" typed`).toBe(true)
      }
    }
  }, 120_000)
}
