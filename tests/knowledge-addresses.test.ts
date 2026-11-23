// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { knowledgeAddress, parseRoute } from '../src/shared/addresses.ts'

it('round trips the knowledge root, category and entry addresses', () => {
  const id = randomUUID()
  for (const route of [{ name: 'knowledge' } as const, { name: 'knowledge', categoryId: id } as const, { name: 'knowledge', entryId: id } as const]) {
    expect(parseRoute(knowledgeAddress(route))).toEqual(route)
  }
})
