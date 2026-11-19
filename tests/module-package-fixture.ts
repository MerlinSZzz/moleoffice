// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { expect } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { thePersonsKeyHeader } from './helpers.ts'

type Post = (path: string, body: object) => Promise<{ status: number; body: any }>

/** File a module in this test office and update its requirements after the test's parent decision. */
export async function aMadeUpModuleForPackage(post: Post): Promise<string> {
  const made = await post('/api/records', {
    kind: 'module', title: 'Made-up module for a package',
    data: { context: 'Made-up requirements for this test.', parts: [] },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const id = String(made.body.record.id)
  await updateMadeUpModuleForPackage(post, id)
  return id
}

export async function updateMadeUpModuleForPackage(post: Post, id: string): Promise<void> {
  const updated = await post(`/api/records/${id}/requirements`, {
    items: [{ id: 'made-up-requirement', text: 'A made-up requirement for the package.', state: 'todo' }],
  })
  expect(updated.status, JSON.stringify(updated.body)).toBe(200)
}

/** The person acts through its own key, from the test database, in the selected project. */
export function injectedPackageFixture(app: FastifyInstance, workspace: string): Post {
  const headers = {
    'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader(),
  }
  return async (path, payload) => {
    const reply = await app.inject({ method: 'POST', url: path, headers, payload })
    return { status: reply.statusCode, body: reply.json() }
  }
}

/** The HTTP test's key file belongs to its own made-up office, never to the owner. */
export function httpPackageFixture(api: string, keyPath: string): Post {
  const headers = {
    'content-type': 'application/json', 'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(keyPath),
  }
  return async (path, payload) => {
    const reply = await fetch(`${api}${path}`, { method: 'POST', headers, body: JSON.stringify(payload) })
    return { status: reply.status, body: await reply.json() }
  }
}
