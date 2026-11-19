// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { seedStatusOffice, STATUS_FIXTURE } from './status-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { englishWords } from '../src/shared/words/joined.ts'

const out = process.env.W13U_PANEL_SHOTS
let t: TestDb
let app: LiveApp
beforeAll(async () => {
  t = await freshDb()
  const api = (await apiApp()).app
  await api.ready()
  await seedStatusOffice(t, api, 2)
  t.client.sqlite.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?").run(STATUS_FIXTURE.presence, 'status-extra-0')
  t.client.sqlite.prepare("INSERT INTO agent_starter_changes (id,agent_id,from_kind,from_id,to_kind,to_id,asked_by_kind,asked_by_id,because,asked_at,state,runs_not_ended) VALUES (?,?,'person',?,'agent',?,'person',?,?,?,'waiting','[]')").run('fixture-wait', STATUS_FIXTURE.all, THE_PERSON, STATUS_FIXTURE.presence, THE_PERSON, 'A made-up reason', '2026-10-20 09:05:00')
  await api.close()
  const { migrateRevisions } = await import('../src/server/db/revision-backfill.ts')
  migrateRevisions(t.client.sqlite)
  app = await liveApp({ name: 'starter-panel-pictures', viewport: { width: 1440, height: 900 }, database: t.file })
}, 240_000)
afterAll(async () => { await app?.stop(); t?.close() }, 60_000)

it('shows the waiting change and both choices at four widths and in both themes', async () => {
  if (out) mkdirSync(out, { recursive: true })
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) {
    const context = await app.browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
    await context.addInitScript((look) => { localStorage.setItem('mole-office.preset.theme', look); localStorage.setItem('mole-office.language', 'en'); localStorage.setItem('mole-office.workspace', 'default') }, theme)
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/#/who/agent/${STATUS_FIXTURE.all}`)
      await waitForThePage(page)
      const panel = page.locator('section.px-panel').filter({ has: page.getByRole('heading', { name: 'Who answers for this agent' }) })
      await panel.waitFor({ state: 'visible', timeout: 30000 })
      await panel.getByText('the change to Bell Listener is waiting.').waitFor({ state: 'visible', timeout: 30000 })
      expect(await panel.getByRole('button', { name: 'Make the change now' }).getAttribute('data-size')).toBe('md')
      expect(await panel.getByText('Make the change now: the runs that are going keep going, and Bell Listener answers for them from now.').count()).toBe(1)
      expect(await panel.getByRole('button', { name: 'Withdraw the change' }).count()).toBe(1)
      await panel.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `panel-${width}-${theme}.png`) })
      let changed: 'applied' | 'withdrawn' | null = null
      const bodies: unknown[] = []
      await page.route(`**/api/agents/${STATUS_FIXTURE.all}/starter`, async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON() as { withdraw?: boolean }
          bodies.push(body)
          changed = body.withdraw ? 'withdrawn' : 'applied'
          const response = await route.fetch({ method: 'GET' })
          return route.fulfill({ response, json: {} })
        }
        if (changed === null) return route.continue()
        const response = await route.fetch()
        const answer = await response.json() as { starter: unknown; changes: { state: string; to: unknown }[] }
        answer.changes[0]!.state = changed
        if (changed === 'applied') answer.starter = answer.changes[0]!.to
        return route.fulfill({ response, json: answer })
      })
      await panel.getByRole('button', { name: 'Make the change now' }).click()
      await expect.poll(() => bodies.length).toBe(1)
      expect(bodies[0]).toEqual({ to: STATUS_FIXTURE.presence, because: 'A made-up reason', atOnce: true })
      await panel.getByText('The change to Bell Listener was applied.').waitFor({ state: 'visible', timeout: 30000 })
      expect(await panel.innerText()).not.toContain('This page is talking to a different Mole Office')
      await panel.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `made-now-${width}-${theme}.png`) })
      changed = null
      await page.reload()
      await waitForThePage(page)
      await panel.getByText('the change to Bell Listener is waiting.').waitFor({ state: 'visible', timeout: 30000 })
      await panel.getByRole('button', { name: 'Withdraw the change' }).click()
      await expect.poll(() => bodies.length).toBe(2)
      expect(bodies.at(-1)).toEqual({ withdraw: true })
      await panel.getByText('The change to Bell Listener was withdrawn.').waitFor({ state: 'visible', timeout: 30000 })
      await panel.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `confirmation-${width}-${theme}.png`) })

      await page.goto(`${app.site}/#/who/agent/${STATUS_FIXTURE.presence}`)
      await waitForThePage(page)
      const selection = page.locator('section.px-panel').filter({ has: page.getByRole('heading', { name: 'Who answers for this agent' }) })
      // THE FORM OPENS ON A PRESS (13u's 20b144ddc): on arrival the panel draws one press and no dropdown.
      await selection.getByRole('button', { name: 'Change who answers' }).waitFor({ state: 'visible', timeout: 30000 })
      expect(await selection.getByLabel('Who should answer for it').count()).toBe(0)
      await selection.getByRole('button', { name: 'Change who answers' }).click()
      await selection.getByLabel('Who should answer for it').selectOption(STATUS_FIXTURE.all)
      await selection.getByRole('button', { name: 'See what changes' }).click()
      await selection.getByText('Ledger Keeper will answer for this agent.').waitFor({ state: 'visible', timeout: 30000 })
      expect(await selection.innerText()).not.toContain('This press is off. This page does not say why.')
      expect(await selection.innerText()).toContain('1 record will name who answers for it.')
      expect(await selection.innerText()).not.toContain('0 agents')
      expect(await selection.innerText()).not.toContain('0 runs')
      expect(await selection.getByText('Write why first.').isVisible()).toBe(true)
      await selection.getByLabel('Why are you making this change?').fill('A made-up reason')
      expect(await selection.getByText('Write why first.').count()).toBe(0)
      expect(await selection.getByRole('button', { name: 'Change who answers' }).getAttribute('aria-disabled')).toBeNull()
      await selection.getByLabel('Why are you making this change?').fill('')
      await selection.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `selection-${width}-${theme}.png`) })
      await selection.getByLabel('Who should answer for it').selectOption('status-extra-0')
      await selection.getByRole('button', { name: 'See what changes' }).click()
      await selection.getByRole('alert').waitFor({ state: 'visible', timeout: 30000 })
      await selection.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `refusal-${width}-${theme}.png`) })
    } finally { await context.close() }
  }
}, 240_000)

it('closes on Cancel and after an accepted change, and stays open with a refusal', async () => {
  const words = englishWords()
  const changesTo = words['starterMove.changesTo']
  if (!changesTo.startsWith('{name}')) throw new Error(`starterMove.changesTo no longer starts with {name}: ${changesTo}`)
  const theRestOfTheLine = changesTo.slice('{name}'.length).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const theLineEnding = new RegExp(`${theRestOfTheLine}$`)
  if (out) mkdirSync(out, { recursive: true })
  const looks = out
    ? [1440, 990, 660, 390].flatMap((width) => (['light', 'dark'] as const).map((theme) => ({ width, theme })))
    : [{ width: 1440, theme: 'light' as const }]
  for (const { width, theme } of looks) {
    const context = await app.browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
    await context.addInitScript((look) => { localStorage.setItem('mole-office.preset.theme', look); localStorage.setItem('mole-office.language', 'en'); localStorage.setItem('mole-office.workspace', 'default') }, theme)
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/#/who/agent/${STATUS_FIXTURE.presence}`)
      await waitForThePage(page)
      const panel = page.locator('section.px-panel').filter({ has: page.getByRole('heading', { name: words['starterMove.title'] }) })
      await panel.getByRole('button', { name: words['starterMove.change'] }).waitFor({ state: 'visible', timeout: 30000 })

      // 1. CANCEL CLOSES THE FORM AND CLEARS WHAT WAS TYPED.
      await panel.getByRole('button', { name: words['starterMove.change'] }).click()
      await panel.getByLabel(words['starterMove.to']).selectOption(STATUS_FIXTURE.all)
      await panel.getByRole('button', { name: words['starterMove.preview'] }).click()
      const previewLine = panel.getByText(theLineEnding)
      await previewLine.waitFor({ state: 'visible', timeout: 30000 })
      const chosenName = (await previewLine.innerText()).replace(theLineEnding, '')
      await panel.getByLabel(words['starterMove.reason']).fill('A made-up reason')
      expect(await panel.getByRole('button', { name: words['starterMove.cancel'] }).count()).toBe(1)
      await panel.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `open-${width}-${theme}.png`) })
      await panel.getByRole('button', { name: words['starterMove.cancel'] }).click()
      await expect.poll(() => panel.getByLabel(words['starterMove.to']).count()).toBe(0)
      expect(await panel.getByRole('button', { name: words['starterMove.cancel'] }).count()).toBe(0)
      expect(await panel.getByRole('button', { name: words['starterMove.change'] }).count()).toBe(1)
      await panel.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `cancelled-${width}-${theme}.png`) })
      await panel.getByRole('button', { name: words['starterMove.change'] }).click()
      expect(await panel.getByLabel(words['starterMove.to']).inputValue()).toBe('')
      expect(await panel.getByText(theLineEnding).count()).toBe(0)
      expect(await panel.getByLabel(words['starterMove.reason']).count()).toBe(0)

      // 2. A REFUSAL KEEPS THE FORM OPEN WITH WHAT WAS TYPED.
      let chosen: unknown = null
      let refusals = 1
      let accepted = false
      await page.route(`**/api/agents/${STATUS_FIXTURE.presence}/starter-preview*`, async (route) => {
        const response = await route.fetch()
        const body = await response.json() as { to: unknown }
        chosen = body.to
        return route.fulfill({ response, json: body })
      })
      await page.route(`**/api/agents/${STATUS_FIXTURE.presence}/starter`, async (route) => {
        if (route.request().method() === 'POST') {
          if (refusals > 0) {
            refusals -= 1
            const response = await route.fetch({ method: 'GET' })
            return route.fulfill({ response, status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'The starter was not changed: a made-up refusal.' }) })
          }
          accepted = true
          const response = await route.fetch({ method: 'GET' })
          return route.fulfill({ response, json: {} })
        }
        if (!accepted) return route.continue()
        const response = await route.fetch()
        const body = await response.json() as { starter: unknown; changes: unknown[] }
        body.starter = chosen
        body.changes = [{ id: 'made-up-applied', agent: STATUS_FIXTURE.presence, from: null, to: chosen, askedBy: { kind: 'person', id: THE_PERSON, name: 'The person' }, because: 'A made-up reason', askedAt: STATUS_FIXTURE.at, state: 'applied', appliedAt: STATUS_FIXTURE.at, refusedBecause: null, runsNotEnded: [] }]
        return route.fulfill({ response, json: body })
      })
      await panel.getByLabel(words['starterMove.to']).selectOption(STATUS_FIXTURE.all)
      await panel.getByRole('button', { name: words['starterMove.preview'] }).click()
      await panel.getByText(theLineEnding).waitFor({ state: 'visible', timeout: 30000 })
      await panel.getByLabel(words['starterMove.reason']).fill('A made-up reason')
      await panel.getByRole('button', { name: words['starterMove.change'] }).click()
      const alert = panel.getByRole('alert')
      await alert.waitFor({ state: 'visible', timeout: 30000 })
      expect(await alert.innerText()).toContain('a made-up refusal')
      expect(await panel.getByLabel(words['starterMove.to']).inputValue()).toBe(STATUS_FIXTURE.all)
      expect(await panel.getByLabel(words['starterMove.reason']).inputValue()).toBe('A made-up reason')
      expect(await panel.getByText(theLineEnding).count()).toBe(1)
      await panel.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `refused-${width}-${theme}.png`) })

      // 3. AN ACCEPTED CHANGE CLOSES THE FORM AND SHOWS THE NEW ANSWERER.
      await panel.getByRole('button', { name: words['starterMove.change'] }).click()
      await expect.poll(() => panel.getByLabel(words['starterMove.to']).count()).toBe(0)
      await panel.getByText(words['starterMove.current'].replace('{name}', chosenName)).waitFor({ state: 'visible', timeout: 30000 })
      expect(await panel.getByRole('button', { name: words['starterMove.cancel'] }).count()).toBe(0)
      await panel.scrollIntoViewIfNeeded()
      if (out) await page.screenshot({ path: join(out, `accepted-${width}-${theme}.png`) })
    } finally { await context.close() }
  }
}, 240_000)
