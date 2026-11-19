// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SWITCH OF PROJECT LIGHTS THE SHELL, AND ITS KEPT ROWS HAVE ROOM ABOVE THE BAR.
 *
 * The page reads again when the reader switches project, and keeps the project just left's runs on
 * screen until the new answer comes. Two things were wrong at a narrow width while that read was
 * held:
 *
 *   1. The loading light was drawn around "Check again", though nobody pressed it. A light around a
 *      press must mean that press caused the wait. The shell's own sign — the ring around the menu
 *      press — was suppressed by that light, so the page had a press glowing for no reason and no
 *      sign on the shell.
 *   2. The bar saying "Reading <project>…" is fixed at the foot of the page, and its height was not
 *      in the room the page keeps there. A long project name makes the bar taller, and the last row
 *      could not be scrolled clear of it.
 *
 * The browser holds BETA's runs, switches from ALPHA, and checks both while the read is out. Every
 * row is made up: the projects, their runs and the name the bar wraps.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pathFor } from '../src/web/components/router.tsx'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProjectAtAnyWidth } from './switch-the-project-at-any-width.ts'
import { waitForTheProjects } from './switch-the-project.ts'

const ALPHA = { id: 'alpha', title: 'Made-up Alpha' }
const BETA = {
  id: 'beta',
  title: 'Made-up Beta, a made-up project whose name is long enough to wrap several times across the foot of a narrow page',
}
const VIEWPORT = { width: 390, height: 844 }

let app: LiveApp

function asThePerson(project: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
}

async function write(path: string, body: unknown, headers: Record<string, string>): Promise<void> {
  const answer = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `POST ${path}: ${text}`).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-switch-lights-the-shell', viewport: VIEWPORT })
  for (const project of [ALPHA, BETA]) {
    await write('/api/workspaces', { id: project.id, title: project.title }, asThePerson('default'))
    for (let i = 0; i < 6; i++) {
      await write(
        '/api/records',
        { kind: 'session', title: `A made-up paused run ${String(i + 1)} of ${project.title}`, data: { state: 'paused', runtime: 'claude-code' } },
        asThePerson(project.id),
      )
    }
  }
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

interface HeldSwitch {
  page: Page
  hold: () => Promise<{ caught: () => number; release: () => void }>
  close: () => Promise<void>
}

async function aBrowser(theme: 'light' | 'dark'): Promise<HeldSwitch> {
  const context = await app.browser.newContext({ viewport: VIEWPORT })
  await context.addInitScript((look: string) => {
    localStorage.setItem('mole-office.workspace', 'alpha')
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.chat.open', 'no')
  }, theme)
  const page = await context.newPage()
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => { release = resolve })
  let caught = 0
  await page.route(
    (url) => url.pathname === '/api/sessions',
    async (route) => {
      if (route.request().method() !== 'GET' || route.request().headers()['x-mole-office-workspace'] !== BETA.id) return route.continue()
      caught += 1
      await released
      await route.continue()
    },
  )
  return {
    page,
    hold: async () => ({ caught: () => caught, release }),
    close: async () => { release(); await context.close() },
  }
}

async function theHeldSwitch(watched: HeldSwitch): Promise<void> {
  await watched.page.goto(`${app.site}/?lang=en#${pathFor('sessions')}`, { timeout: 60_000 })
  await waitForThePage(watched.page, 60_000)
  await waitForTheProjects(watched.page)
  await watched.page.locator('#main').getByText('A made-up paused run 1 of Made-up Alpha').first().waitFor({ timeout: 30_000 })
  const held = await watched.hold()
  await switchTheProjectAtAnyWidth(watched.page, BETA.id)
  await expect.poll(() => held.caught(), { timeout: 20_000, message: 'the new project was never read' }).toBeGreaterThan(0)
  await watched.page.locator('.px-reread[data-another-project]').waitFor({ timeout: 20_000 })
}

for (const theme of ['light', 'dark'] as const) {
  it(`lights the shell and keeps the bar's room while the new project is read, in the ${theme} look`, async () => {
    const watched = await aBrowser(theme)
    try {
      await theHeldSwitch(watched)
      const geometry = await geometryWhileHeld(watched.page)
      expect(geometry.room, 'the bar height is not in the room the page keeps at its foot').toBeGreaterThanOrEqual(geometry.stripHeight)
      expect(geometry.lightAroundMenu, 'the shell has no ring around the menu press').toBe(true)
      expect(geometry.lightAroundCheckAgain, 'the Check again press glows though nobody pressed it').toBe(false)
      expect(geometry.lastRowClearsTheBar, 'the last row cannot be scrolled clear of the bar').toBe(true)
      expect(geometry.checkAgainStillThere, 'Check again went, though its reading is still on screen').toBe(true)
      expect(await watched.page.locator('.sx-read-act .px-btn').count()).toBe(1)
    } finally {
      await watched.close()
    }
  }, 120_000)
}

interface Geometry {
  stripHeight: number
  room: number
  lightAroundMenu: boolean
  lightAroundCheckAgain: boolean
  lastRowClearsTheBar: boolean
  checkAgainStillThere: boolean
}

function geometryWhileHeld(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('.px-reread[data-another-project]')!
    const menu = document.querySelector<HTMLElement>('.shell-menu')!
    const press = document.querySelector<HTMLElement>('.sx-read-act .px-btn')!
    const scroller = document.scrollingElement ?? document.documentElement
    const top = scroller.scrollTop
    scroller.scrollTo(0, scroller.scrollHeight)
    const last = [...document.querySelectorAll<HTMLElement>('#main .sx-line')].at(-1) ?? null
    const stripBox = strip.getBoundingClientRect()
    const lastBox = last?.getBoundingClientRect() ?? null
    scroller.scrollTo(0, top)
    const lights = [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-wait-light]')]
    const around = (box: DOMRect | undefined): boolean => box !== undefined && lights.some((one) => {
      const frame = one.getBoundingClientRect()
      return frame.x <= box.x && frame.y <= box.y && frame.right >= box.right && frame.bottom >= box.bottom
    })
    return {
      stripHeight: stripBox.height,
      room: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--reread-room')) || 0,
      lightAroundMenu: around(menu.getBoundingClientRect()),
      lightAroundCheckAgain: around(press.getBoundingClientRect()),
      lastRowClearsTheBar: lastBox !== null && lastBox.bottom <= stripBox.top,
      checkAgainStillThere: press.isConnected && press.checkVisibility(),
    }
  })
}
