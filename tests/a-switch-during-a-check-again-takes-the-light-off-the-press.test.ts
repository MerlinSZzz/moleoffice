// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SWITCH DURING A CHECK AGAIN TAKES THE LIGHT OFF THE PRESS.
 *
 * The Check again press is lit while the read it started is out. That light says the press caused the
 * wait, so it must not stand on a read a switch of project started. The press's light used to stay up
 * until the newest read answered, so pressing Check again, holding its read, then switching project
 * put the press's light on the switch's read — a read nobody pressed for.
 *
 * A browser of its own, at 390 in the light look. It holds ALPHA's Check again read, presses, then switches
 * to BETA while that read is still out and holds BETA's read too. While BETA is being read the press
 * carries no light, and it still carries none after BETA answers and after ALPHA's held answer comes.
 * The shell's own sign is the one that is drawn for the switch.
 *
 * MUTATION: leave `fromAPress` true when a switch's read starts, and the held-switch check is red:
 * the Check again press glows though nobody pressed it.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pathFor } from '../src/web/components/router.tsx'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { switchTheProjectAtAnyWidth } from './switch-the-project-at-any-width.ts'
import { waitForTheProjects } from './switch-the-project.ts'

const ALPHA = { id: 'alpha', title: 'Made-up Alpha' }
const BETA = { id: 'beta', title: 'Made-up Beta' }
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
  app = await liveApp({ name: 'a-switch-during-a-check-again', viewport: VIEWPORT })
  for (const project of [ALPHA, BETA]) {
    await write('/api/workspaces', { id: project.id, title: project.title }, asThePerson('default'))
    for (let i = 0; i < 4; i++) {
      await write('/api/records', { kind: 'session', title: `A made-up paused run ${String(i + 1)} of ${project.title}`, data: { state: 'paused', runtime: 'claude-code' } }, asThePerson(project.id))
    }
  }
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

interface Held {
  page: Page
  arm: (project: string) => void
  caught: (project: string) => number
  release: (project: string) => void
  close: () => Promise<void>
}

async function aBrowser(theme: 'light' | 'dark'): Promise<Held> {
  const context = await app.browser.newContext({ viewport: VIEWPORT })
  await context.addInitScript((look: string) => {
    localStorage.setItem('mole-office.workspace', 'alpha')
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.chat.open', 'no')
  }, theme)
  const page = await context.newPage()
  const gates = new Map<string, { promise: Promise<void>; release: () => void }>()
  const counts = new Map<string, number>()
  const armed = new Set<string>()
  const gateFor = (project: string): { promise: Promise<void>; release: () => void } => {
    const held = gates.get(project)
    if (held !== undefined) return held
    let release: () => void = () => undefined
    const promise = new Promise<void>((resolve) => { release = resolve })
    const made = { promise, release }
    gates.set(project, made)
    return made
  }
  await page.route(
    (url) => url.pathname === '/api/sessions',
    async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const project = route.request().headers()['x-mole-office-workspace'] ?? ''
      if ((project !== ALPHA.id && project !== BETA.id) || !armed.has(project)) return route.continue()
      counts.set(project, (counts.get(project) ?? 0) + 1)
      await gateFor(project).promise
      await route.continue()
    },
  )
  return {
    page,
    arm: (project) => { armed.add(project) },
    caught: (project) => counts.get(project) ?? 0,
    release: (project) => { gateFor(project).release() },
    close: async () => { for (const one of gates.values()) one.release(); await context.close() },
  }
}

async function theLightAroundThePress(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const press = document.querySelector<HTMLElement>('.sx-read-act .px-btn')
    if (press === null) return false
    const box = press.getBoundingClientRect()
    return [...document.querySelectorAll<HTMLCanvasElement>('canvas[data-wait-light]')].some((one) => {
      const frame = one.getBoundingClientRect()
      return frame.x <= box.x && frame.y <= box.y && frame.right >= box.right && frame.bottom >= box.bottom
    })
  })
}

for (const theme of ['light'] as const) {
  it(`takes the press's light off a switch during a held Check again, in the ${theme} look`, async () => {
    const watched = await aBrowser(theme)
    const { page } = watched
    try {
      await page.goto(`${app.site}/?lang=en#${pathFor('sessions')}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await waitForTheProjects(page)
      await page.locator('#main').getByText('A made-up paused run 1 of Made-up Alpha').first().waitFor({ timeout: 30_000 })
      await page.mouse.move(0, 0)
      watched.arm(ALPHA.id)
      watched.arm(BETA.id)

      const press = page.locator('.sx-read-act .px-btn').first()
      await press.click()
      await expect.poll(() => watched.caught(ALPHA.id), { timeout: 20_000, message: 'the Check again read was never held' }).toBeGreaterThan(0)
      await expect.poll(() => theLightAroundThePress(page), { timeout: 20_000, message: 'Check again has no light for the read it started' }).toBe(true)

      await switchTheProjectAtAnyWidth(page, BETA.id)
      await expect.poll(() => watched.caught(BETA.id), { timeout: 20_000, message: 'the switch never read BETA' }).toBeGreaterThan(0)
      await page.locator('.px-reread[data-another-project]').waitFor({ timeout: 20_000 })
      expect(await theLightAroundThePress(page), 'Check again glows for the switch nobody pressed').toBe(false)

      watched.release(BETA.id)
      await page.locator('#main').getByText('A made-up paused run 1 of Made-up Beta').first().waitFor({ timeout: 30_000 })
      expect(await theLightAroundThePress(page), 'Check again glows after the switch answered').toBe(false)

      watched.release(ALPHA.id)
      await page.waitForTimeout(500)
      expect(await theLightAroundThePress(page), 'the held Check again answer put its light back after the switch').toBe(false)
    } finally {
      await watched.close()
    }
  }, 120_000)
}
