// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PlanBlocksReply, RecordDetail } from '../src/web/api.ts'

let app: LiveApp
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
async function request(path: string, method = 'GET', body?: unknown) {
  const reply = await fetch(app.api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return reply.json()
}
async function plan(title = 'Footbridge walk', body = '- [x] Check the footbridge') {
  const made = await request('/api/plans', 'POST', { title, body })
  return await request(`/api/plans/${made.plan.id}/blocks`) as PlanBlocksReply
}
async function open(id: string) {
  const address = `${app.site}/?lang=en#/plans/${id}`
  if (app.page.url() === address) await app.page.reload()
  else await app.page.goto(address)
  await waitForThePage(app.page, 30_000)
  await app.page.locator('.op-title').waitFor()
}
async function stored(id: string) { return await request(`/api/plans/${id}/blocks`) as PlanBlocksReply }

beforeAll(async () => { app = await liveApp({ name: 'g8-plan-tiers', workspace: 'default', viewport: { width: 1440, height: 1000 } }) })
afterAll(async () => { await app?.stop() })

it('asks before deleting a plan and names the plan and its stored lines', async () => {
  const made = await plan()
  await open(made.plan.id)
  await app.page.getByRole('button', { name: /Ending this plan/ }).click()
  await app.page.getByRole('button', { name: 'Delete this plan', exact: true }).click()
  const question = app.page.getByRole('dialog')
  expect(await question.innerText()).toContain('Footbridge walk')
  expect((await question.innerText()).toLowerCase()).toContain('stored lines')
  expect((await stored(made.plan.id)).lines).toHaveLength(1)
  await question.getByRole('button', { name: 'Keep it', exact: true }).click()
  expect((await stored(made.plan.id)).lines).toHaveLength(1)
  await app.page.getByRole('button', { name: 'Delete this plan', exact: true }).click()
  await question.getByRole('button', { name: 'Yes, delete it', exact: true }).click()
  await app.page.waitForURL(/#\/plans$/)
  expect((await fetch(`${app.api}/api/plans/${made.plan.id}`, { headers })).status).toBe(404)
})

it('asks before replacing newer writing and leaves the stored writing alone on cancel', async () => {
  const made = await plan('Picnic route', '- Read the map')
  await open(made.plan.id)
  await request(`/api/plans/${made.plan.id}/body`, 'PUT', { body: '- Check the weather', ifVersion: made.version })
  await app.page.locator('.pw-box').fill('- Pack a picnic')
  await app.page.getByRole('button', { name: 'Save now', exact: true }).first().click({ timeout: 5_000 })
  await app.page.getByRole('button', { name: 'Read what is stored now', exact: true }).click()
  await app.page.getByRole('button', { name: 'Replace it with what is on this page', exact: true }).click()
  const question = app.page.getByRole('dialog')
  expect(await question.innerText()).toContain('Picnic route')
  expect((await stored(made.plan.id)).lines[0]?.line.text).toBe('- Check the weather')
  await question.getByRole('button', { name: 'Keep it', exact: true }).click()
  expect((await stored(made.plan.id)).lines[0]?.line.text).toBe('- Check the weather')
  await app.page.getByRole('button', { name: 'Replace it with what is on this page', exact: true }).click()
  await question.getByRole('button', { name: 'Replace it with what is on this page', exact: true }).click()
  await expect.poll(async () => (await stored(made.plan.id)).lines[0]?.line.text).toBe('- Pack a picnic')
})

it.each([['Mark it finished', 'done'], ['Mark it given up', 'dropped']] as const)('offers the exact inverse after %s and refuses an undo over a newer write', async (press, next) => {
  const made = await plan()
  await open(made.plan.id)
  await app.page.getByRole('button', { name: /Ending this plan/ }).click()
  await app.page.getByRole('button', { name: press, exact: true }).click()
  const undo = app.page.getByRole('button', { name: /^Undo \(/ })
  await undo.waitFor({ timeout: 5_000 })
  expect((await stored(made.plan.id)).plan.state).toBe(next)
  await undo.click()
  await expect.poll(async () => (await stored(made.plan.id)).plan.state).toBe('open')
  expect((await stored(made.plan.id)).lines.map(row => row.line.text)).toEqual(made.lines.map(row => row.line.text))
  await app.page.getByRole('button', { name: press, exact: true }).click()
  await undo.waitFor({ timeout: 5_000 })
  await request(`/api/plans/${made.plan.id}`, 'PATCH', { title: 'A newer picnic route' })
  await undo.click()
  await app.page.locator('.op-end .px-error').waitFor()
  const after = await stored(made.plan.id)
  expect(after.plan.state).toBe(next)
  expect(after.plan.title).toBe('A newer picnic route')
})

it.each([
  ['task', ['done']], ['block', ['done']], ['obligation', ['fulfilled', 'cancelled']], ['problem', ['fixed', 'worked_around', 'accepted']],
] as const)('keeps an undo after the %s line agrees with its work again', async (kind, endings) => {
  const made = await plan('Footbridge repairs')
  const linePath = `/api/plans/${made.plan.id}/lines/${made.lines[0]!.line.id}`
  let recordId: string
  if (kind === 'block') {
    const pipeline = await request('/api/records', 'POST', { kind: 'pipeline', title: 'Footbridge inspection', data: {} })
    const block = await request(`/api/records/${pipeline.record.id}/blocks`, 'POST', { name: 'Check the footbridge', state: 'todo' })
    recordId = block.record.id
    await request(linePath, 'PATCH', { recordId })
  } else {
    recordId = (await request(`${linePath}/file-as-work`, 'POST', { kind, workspaceId: 'default' })).recordId
  }
  const before = await request(`/api/records/${recordId}`) as RecordDetail
  for (const next of endings) {
    await open(made.plan.id)
    const buttons = app.page.locator('.pi-apart-acts button')
    const index = endings.indexOf(next as never)
    await buttons.nth(index).click()
    const undo = app.page.locator('.pi-apart-acts').getByRole('button', { name: /^Undo \(/ })
    await undo.waitFor({ timeout: 5_000 })
    expect((await request(`/api/records/${recordId}`)).record.data.state).toBe(next)
    expect(await app.page.locator('.pi-apart').count()).toBe(0)
    await undo.click()
    await expect.poll(async () => (await request(`/api/records/${recordId}`)).record.data).toEqual(before.record.data)
  }
  if (kind === 'task') {
    await request(`/api/records/${recordId}`, 'PATCH', { dataPatch: { state: null } })
    await open(made.plan.id)
    await app.page.locator('.pi-apart-acts button').first().click({ timeout: 5_000 })
    const undo = app.page.locator('.pi-apart-acts').getByRole('button', { name: /^Undo \(/ })
    await undo.waitFor({ timeout: 5_000 })
    await undo.click()
    await expect.poll(async () => Object.hasOwn((await request(`/api/records/${recordId}`)).record.data, 'state')).toBe(false)
    await app.page.locator('.pi-apart-acts button').first().click({ timeout: 5_000 })
    await undo.waitFor({ timeout: 5_000 })
    await request(`/api/records/${recordId}`, 'PATCH', { title: 'A newer inspection' })
    await undo.click()
    await app.page.locator('.pi-apart-acts .px-error').waitFor({ timeout: 5_000 })
    const newer = await request(`/api/records/${recordId}`)
    expect(newer.record.data.state).toBe('done')
    expect(newer.record.title).toBe('A newer inspection')
  }

})
