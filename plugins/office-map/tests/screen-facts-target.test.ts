// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE MAP MEASURES A READ WITH THE SLOT'S OWN BUILDER AND STAYS INSIDE ITS TARGET LIMIT.
 *
 * A people or work read is split by the conservative 20-id budget within the published 500-id ceiling and by the published path-and-query limit,
 * READ_TARGET_LIMIT. The map keeps the encoded bound and target arithmetic from the slot: its
 * wrapper returns what theTargetOfARead in src/shared/plugin-read.ts returns.
 *
 * These tests check every chunk of 500 distinct 64-character ids against the published builder on both
 * views, and exact coverage and order. They take no timing measurement.
 */
import { describe, expect, it } from 'vitest'
import { AGENTS_LIMIT, theTargetOfARead } from '../../../src/shared/plugin-read.ts'
import { AGENT_CHUNK, ENCODED_REQUEST_LIMIT, agentIds, chunks, encodedAgentsRequest } from '../src/screen-facts.ts'

const VIEWS = ['people', 'work'] as const
const bytesOf = (target: string): number => Buffer.byteLength(target, 'ascii')
const aLongId = (number: number): string => `agent-${String(number).padStart(5, '0')}`.padEnd(AGENTS_LIMIT.idLength, 'x')
const longIds = (count: number): string[] => Array.from({ length: count }, (_, at) => aLongId(at))

describe('the map measures a read as the published slot does', () => {
  it('builds both views with the published builder, byte for byte', () => {
    const some = longIds(3)
    for (const view of VIEWS) {
      const target = encodedAgentsRequest(view, some)
      expect(target).toBe(theTargetOfARead(view, { agents: some.join(',') }))
      expect(bytesOf(target)).toBe(target.length)
    }
    expect(encodedAgentsRequest('people', [])).toBe(theTargetOfARead('people', { agents: '' }))
  })

  it('splits 500 distinct 64-character ids under the limit on both views, covering each one once in order', () => {
    const selected = agentIds(longIds(AGENTS_LIMIT.most))
    expect(selected).toHaveLength(AGENTS_LIMIT.most)
    expect(new Set(selected).size).toBe(AGENTS_LIMIT.most)
    expect(selected.every(id => id.length === AGENTS_LIMIT.idLength)).toBe(true)
    const parts = chunks(selected)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.flat()).toEqual(selected)
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0)
      expect(part.length).toBeLessThanOrEqual(AGENT_CHUNK)
      for (const view of VIEWS) {
        const target = encodedAgentsRequest(view, part)
        expect(bytesOf(target)).toBeLessThanOrEqual(ENCODED_REQUEST_LIMIT)
        expect(target).toBe(theTargetOfARead(view, { agents: part.join(',') }))
      }
    }
  })
})
