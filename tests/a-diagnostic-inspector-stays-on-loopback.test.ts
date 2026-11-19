// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { inspectorAddress } from '../tools/office-diagnostic-report.mjs'

// Mutation: remove the hostname check. A remote debugger would allow code execution elsewhere.
it('refuses every inspector address outside the two literal loopback addresses', () => {
  for (const address of ['ws://example.com:9229/id', 'ws://192.0.2.1:9229/id', 'ws://localhost:9229/id', 'ws://0.0.0.0:9229/id']) {
    expect(() => inspectorAddress(address)).toThrow('loopback')
  }
  expect(inspectorAddress('ws://127.0.0.1:12345/id').hostname).toBe('127.0.0.1')
  expect(inspectorAddress('ws://[::1]:12345/id').hostname).toBe('[::1]')
})
