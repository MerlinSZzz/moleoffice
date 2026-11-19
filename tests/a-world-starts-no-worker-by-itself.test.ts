// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A world gives the API the off setting unless its caller asks for a message worker. */
import { describe, expect, it } from 'vitest'

import { environmentForTheWorld, readArguments } from '../tools/isolated-mole-office.mjs'

describe('a-world-starts-no-worker-by-itself', () => {
  it('passes off to the API unless --with-message-worker was given', () => {
    const ordinary = readArguments(['start', 'quiet-world'])
    expect(ordinary.bad).toBeUndefined()
    expect(ordinary.withMessageWorker).toBe(false)

    const env = environmentForTheWorld({
      // If the tool forgets to set off, this inherited on value would start a worker.
      base: { MOLE_OFFICE_MESSAGE_WORKER: 'on', PATH: '/usr/bin' },
      db: '/test/world-copy.db',
      apiPort: 40001,
      webPort: 40002,
      withMessageWorker: ordinary.withMessageWorker,
      authority: { startedBy: null, secretaries: [] },
      purpose: null,
      handback: null,
      otherHost: null,
      place: '/test/world',
      workspace: 'default',
    })

    expect(env.MOLE_OFFICE_MESSAGE_WORKER).toBe('off')

    const askedFor = readArguments(['start', 'delivery-world', '--with-message-worker'])
    expect(askedFor.bad).toBeUndefined()
    expect(askedFor.withMessageWorker).toBe(true)
    expect(
      environmentForTheWorld({
        base: {},
        db: '/test/world-copy.db',
        apiPort: 40001,
        webPort: 40002,
        withMessageWorker: askedFor.withMessageWorker,
        authority: { startedBy: null, secretaries: [] },
        purpose: null,
        handback: null,
        otherHost: null,
        place: '/test/world',
        workspace: 'default',
      }).MOLE_OFFICE_MESSAGE_WORKER,
    ).toBe('on')
  })
})
