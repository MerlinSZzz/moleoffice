// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { LinkType, PanelRecord } from '../src/shared/types.ts'
import type { Gate } from '../src/shared/work.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { LiveApp } from './helpers.ts'

export const g7bHeaders = {
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
}

export async function g7bRequest(app: LiveApp, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(app.api + path, { method, headers: g7bHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`)
  return JSON.parse(text)
}

export async function g7bFixture(app: LiveApp) {
  const file = async (kind: PanelRecord['kind'], title: string, data: PanelRecord['data']) =>
    (await g7bRequest(app, '/api/records', 'POST', { kind, title, data })).record as PanelRecord
  const shelf = await file('module', 'Cedar Shelf', { context: 'Keep books ready for readers.', parts: [] })
  const desk = await file('module', 'Cedar Desk', { context: 'Return books to readers.', parts: [] })
  const pipe = await file('pipeline', 'Cedar Returns', { blockIds: [], dependenciesComplete: true })
  const empty = await file('pipeline', 'Cedar Empty', { blockIds: [] })
  const first = (await g7bRequest(app, `/api/records/${pipe.id}/blocks`, 'POST', { name: 'Receive Books', state: 'done' })).record as PanelRecord
  const second = (await g7bRequest(app, `/api/records/${pipe.id}/blocks`, 'POST', { name: 'Read Cards', state: 'doing' })).record as PanelRecord
  const last = (await g7bRequest(app, `/api/records/${pipe.id}/blocks`, 'POST', { name: 'Return Books', state: 'todo' })).record as PanelRecord
  const link = async (fromId: string, toId: string, type: LinkType, gate?: Gate) =>
    (await g7bRequest(app, '/api/links', 'POST', { fromId, toId, type, ...(gate === undefined ? {} : { gate }) })).link
  await link(shelf.id, first.id, 'implements')
  await link(shelf.id, second.id, 'implements')
  await link(desk.id, second.id, 'implements')
  await link(first.id, second.id, 'blocks', { kind: 'partial', upTo: 'First review' })
  await link(second.id, last.id, 'blocks', { kind: 'hard' })
  await link(shelf.id, desk.id, 'blocks', { kind: 'partial', upTo: 'First review' })
  const direction = await file('direction', 'Cedar Reading Corner', { depth: 'noticed', depth_reason: 'A reading corner beside the shelf.' })
  await link(direction.id, shelf.id, 'about')
  return { shelf, desk, pipe, empty, first, second, last, direction }
}
