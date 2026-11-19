// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LAUNCHER'S REFUSAL CARRIES THE REASON AN ANSWER WITH NO SELECTION GIVES.
 *
 * GET /api/office/run-models/for/<agent> now says why it gave no selection. When the launcher's own table does not
 * name the run's model, the start is refused with that reason instead of the generic sentence about filling in a
 * Casting row. This test's stand-in office answers one made-up model and one made-up reason; no model runs and the
 * live office is never asked.
 */
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'

import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { aCommandsStartFromTheOffice } from '../src/config/sandbox-start-values.mjs'

let office: { api: string; close: () => Promise<void> } | null = null
afterEach(async () => {
  await office?.close()
  office = null
})

/** A model name made up for this run, which the launcher's table does not name. */
function anUnlistedModel(): string {
  const model = `office-${randomUUID()}`
  const listed = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, unknown> }
  expect(listed.aliases[model] ?? listed.startValues[model]).toBeUndefined()
  return model
}

async function theRefusal(reason: string): Promise<{ model: string; refusal: string }> {
  const model = anUnlistedModel()
  const server = createServer((request, response) => {
    const asked = new URL(request.url ?? '/', 'http://synthetic.invalid').searchParams.get('model')
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      model: asked,
      effort: 'an-effort-the-office-gave',
      effortFrom: 'Casting',
      from: 'the caller',
      casting: { id: 731, scope: 'the project', decision: null },
      noSelection: { reason: 'row-has-no-native', castingRow: 731, says: reason },
    }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as AddressInfo).port
  expect(thePortsATestKeepsOff()).not.toContain(port)
  office = {
    api: `http://127.0.0.1:${String(port)}`,
    close: () => new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  }
  let refusal = ''
  try {
    await aCommandsStartFromTheOffice(['claude', '-p', 'Synthetic: a made-up prompt.'], { api: office.api, agent: 'synthetic-agent', runtime: 'claude-code', model })
  } catch (why) {
    refusal = why instanceof Error ? why.message : String(why)
  }
  return { model, refusal }
}

describe('the launcher carries the reason the office gives', () => {
  it('puts the answer’s own reason in the refusal, whole', async () => {
    const reason = 'A made-up reason from this test’s stand-in office.'
    const { model, refusal } = await theRefusal(reason)
    expect(refusal).toBe(
      `The office gave no native selection for model ${model}, and the launcher's table does not name it. ${reason} Nothing was started.`,
    )
  }, 30_000)

  it('puts a reason with a newline and 1,000 characters on one line, cut', async () => {
    const reason = `A made-up reason with a line break\nand ${'x'.repeat(1_000)}`
    const { model, refusal } = await theRefusal(reason)
    const oneLine = reason.replace(/\s+/gu, ' ').trim()
    const cut = oneLine.length <= 400 ? oneLine : `${oneLine.slice(0, 399).trimEnd()}…`
    expect(refusal).toBe(
      `The office gave no native selection for model ${model}, and the launcher's table does not name it. ${cut} Nothing was started.`,
    )
    expect(refusal).not.toContain('\n')
    expect(refusal).not.toContain('x'.repeat(1_000))
  }, 30_000)
})
