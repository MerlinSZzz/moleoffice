// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SETTINGS PAGE HAS THE ONE INJECT SWITCH, DRAWN AS A TOGGLE. Criterion M91, the drawing half, and a
 * decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED, IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 *   1. The switch is on the Settings page, under its own title.
 *   2. It is drawn as a switch: `role="switch"`, `aria-checked`, a track wider than it is tall with
 *      a knob in it, and a different fill on and off.
 *   3. Pressing it changes the stored value, read back through the door, and pressing it again
 *      puts it back.
 *   4. An agent's profile says where the switch is and draws no press and no switch of its own.
 *
 * The server half is tests/the-inject-switch-is-one-setting.test.ts.
 *
 * PICTURES. When `INJECT_SWITCH_SHOTS` names a directory, the Settings page and an agent's profile
 * are photographed at 1440, 990, 660 and 390, light and dark (chapter 6, rule 1), once with the
 * switch on and once with it off (the -off- pictures). The mutation runs leave it unset and take no
 * picture.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { INJECT_WORDS, type MayInject } from '../src/shared/profile.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let agentId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_PANEL = '[data-target="uiSurface/settings.inject"]'

async function theStoredSwitch(): Promise<MayInject> {
  const res = await fetch(`${app.api}/api/office/agents-may-inject`, { headers: AS_THE_OWNER })
  expect(res.status).toBe(200)
  return (await res.json()) as MayInject
}

async function openTheSettings(): Promise<void> {
  await app.page.goto(`${app.site}/#/settings/inject`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector(`${THE_PANEL} [role="switch"]`, { timeout: 20_000 })
}

async function photograph(name: string): Promise<void> {
  const dir = process.env['INJECT_SWITCH_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.screenshot({ path: `${dir}/${name}-${String(width)}-${theme}.png`, fullPage: true })
      const panel = await app.page.$(name.startsWith('settings') ? THE_PANEL : '[data-target*="profile.inject"]')
      if (panel !== null) {
        await panel.scrollIntoViewIfNeeded()
        await panel.screenshot({ path: `${dir}/${name}-panel-${String(width)}-${theme}.png` })
      }
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
  await app.page.emulateMedia({ colorScheme: 'light' })
}

beforeAll(async () => {
  app = await liveApp({ name: 'inject-switch', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Lark', data: { handle: 'lark', runtime: 'claude-code', state: 'active' } }),
  })
  expect(made.status, await made.text()).toBe(201)
  const all = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })).json()) as {
    agents: { id: string; handle: string }[]
  }
  agentId = all.agents.find((one) => one.handle === 'lark')?.id ?? ''
  expect(agentId).not.toBe('')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the switch on the Settings page', () => {
  it('is there under its title', async () => {
    await openTheSettings()
    const title = await app.page.$eval(`${THE_PANEL} .px-panel-title`, (one) => one.textContent ?? '')
    expect(title.trim()).toBe(INJECT_WORDS.agentsMayInject)
  }, 120_000)

  it('is drawn as a switch', async () => {
    await openTheSettings()
    const drawn = await app.page.$eval(`${THE_PANEL} [role="switch"]`, (el) => {
      const box = el.getBoundingClientRect()
      const knob = el.querySelector('.injs-knob')
      return {
        tag: el.tagName,
        checked: el.getAttribute('aria-checked'),
        name: el.getAttribute('aria-label'),
        wide: box.width > box.height,
        knob: knob !== null && knob.getBoundingClientRect().width > 0,
        fill: getComputedStyle(el).backgroundColor,
      }
    })
    expect(drawn).toMatchObject({ tag: 'BUTTON', checked: 'true', name: INJECT_WORDS.agentsMayInject, wide: true, knob: true })
    const says = await app.page.$eval(`${THE_PANEL} .injs-state`, (el) => el.textContent ?? '')
    expect(says).toBe(INJECT_WORDS.nobodyChose)
    expect(await app.page.$eval(`${THE_PANEL} .injs-word`, (el) => el.textContent ?? '')).toBe(INJECT_WORDS.on)
    await photograph('settings')
  }, 180_000)

  it('changes the stored value when pressed, and back again', async () => {
    await openTheSettings()
    // THE CONTROL: nobody has chosen before the press.
    expect((await theStoredSwitch()).nobodyChose).toBe(true)
    const onFill = await app.page.$eval(`${THE_PANEL} [role="switch"]`, (el) => getComputedStyle(el).backgroundColor)

    await app.page.click(`${THE_PANEL} [role="switch"]`)
    await app.page.waitForSelector(`${THE_PANEL} [role="switch"][aria-checked="false"]`, { timeout: 20_000 })
    expect(await theStoredSwitch()).toMatchObject({ may: false, nobodyChose: false })
    expect(await app.page.$eval(`${THE_PANEL} .injs-word`, (el) => el.textContent ?? '')).toBe(INJECT_WORDS.off)
    // THE FILL CHANGES OVER THE SWITCH'S 0.15-SECOND TRANSITION, so it is read once the transition
    // has had time to end, not at the moment aria-checked flips. Read at that moment it was still the
    // "on" colour in two runs of three on a loaded machine (25 September 2026).
    const offFill = await app.page
      .waitForFunction(
        ([selector, before]) => {
          const fill = getComputedStyle(document.querySelector(selector as string)!).backgroundColor
          return fill !== before ? fill : false
        },
        [`${THE_PANEL} [role="switch"]`, onFill] as const,
        { timeout: 5_000 },
      )
      .then((handle) => handle.jsonValue() as Promise<string>)
      .catch(() => onFill)
    expect(offFill, 'the switch is drawn the same on and off').not.toBe(onFill)

    // AND A RELOAD DRAWS WHAT IS STORED, not what this page remembered.
    await openTheSettings()
    expect(await app.page.$eval(`${THE_PANEL} [role="switch"]`, (el) => el.getAttribute('aria-checked'))).toBe('false')

    await app.page.click(`${THE_PANEL} [role="switch"]`)
    await app.page.waitForSelector(`${THE_PANEL} [role="switch"][aria-checked="true"]`, { timeout: 20_000 })
    expect(await theStoredSwitch()).toMatchObject({ may: true, nobodyChose: false })
  }, 120_000)
})

describe('the profile of an agent', () => {
  it('says where the switch is, and draws no press and no switch', async () => {
    await app.page.goto(`${app.site}/#/who/agent/${agentId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('[data-target*="profile.inject"] .inject-state', { timeout: 30_000 })
    const panel = await app.page.$eval('[data-target*="profile.inject"]', (el) => el.textContent ?? '')
    expect(panel).toContain(INJECT_WORDS.whereItIsSet)
    expect(await app.page.$$('[data-target*="profile.inject"] button')).toHaveLength(0)
    expect(await app.page.$$('[data-target*="profile.inject"] [role="switch"]')).toHaveLength(0)
    const goes = await app.page.$eval('[data-target*="profile.inject"] a', (el) => el.getAttribute('href') ?? '')
    expect(goes).toContain('settings')
    await photograph('profile')
  }, 180_000)
})

describe('the off state', () => {
  it('is drawn on the Settings page and on the profile', async () => {
    const off = await fetch(`${app.api}/api/office/agents-may-inject`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ may: false }),
    })
    expect(off.status, await off.text()).toBe(200)

    await openTheSettings()
    expect(await app.page.$eval(`${THE_PANEL} [role="switch"]`, (el) => el.getAttribute('aria-checked'))).toBe('false')
    expect(await app.page.$eval(`${THE_PANEL} .injs-word`, (el) => el.textContent ?? '')).toBe(INJECT_WORDS.off)
    expect(await app.page.$eval(`${THE_PANEL} .injs-state`, (el) => el.textContent ?? '')).toBe(INJECT_WORDS.switchedOff)
    await photograph('settings-off')

    await app.page.goto(`${app.site}/#/who/agent/${agentId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('[data-target*="profile.inject"] .inject-state', { timeout: 30_000 })
    expect(await app.page.$eval('[data-target*="profile.inject"] .inject-state', (el) => el.textContent ?? '')).toBe(
      INJECT_WORDS.no,
    )
    await photograph('profile-off')
  }, 240_000)
})
