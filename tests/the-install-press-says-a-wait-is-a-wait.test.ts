// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALL PRESS SAYS A WAIT IS A WAIT. Wave 13u round 13b, after the check refused round 13 (CR75pl5p0ZHg).
 *
 * Installing agent tools waits for the readiness signatures of every secretary (src/server/lib/readiness.ts). The
 * press is the person's signature, and the door answers 409 with the code readinessWaits. Round 13's panel drew that
 * 409 as "The tools could not be installed.", which was false: the signature was recorded and the install was waiting.
 * The panel now reads the code, says the signature is recorded, names who has not signed, says the install starts by
 * itself on the last signature, and links to the checklist. A refusal stays a refusal.
 *
 * MUTATIONS, each after a control run, restored byte for byte, named in the commit that adds this file:
 *   (h) theChecklistThePressWaitsFor answers null for every reply: the first case goes red.
 *   (i) TheInstallWaits draws harnesses.installRefused for its first line: the second case goes red.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AReadinessChecklist } from '../src/server/lib/readiness.ts'
import { en } from '../src/shared/words/en.ts'
import { localStamp } from '../src/shared/time.ts'

type ThePanel = typeof import('../src/web/components/InstallHarnesses.tsx')
type TheApi = typeof import('../src/web/api.ts')
let panel: ThePanel
let api: TheApi

// THE PANEL IS IMPORTED ONCE, with time to be transformed: it brings the browser app's api and ui modules with it.
beforeAll(async () => {
  panel = await import('../src/web/components/InstallHarnesses.tsx')
  api = await import('../src/web/api.ts')
}, 60_000)

/** A made-up checklist on installing one tool, signed by the person, waiting for two made-up secretaries. */
function aWaitingInstall(): AReadinessChecklist {
  const waiting = [
    { kind: 'agent' as const, id: 'example-secretary-one', why: 'a-secretary' as const, name: 'example-secretary-one', signedAt: null },
    { kind: 'agent' as const, id: 'example-secretary-two', why: 'a-secretary' as const, name: 'example-secretary-two', signedAt: null },
  ]
  return {
    id: 'example-checklist',
    workspaceId: 'default',
    operation: 'harnesses.install',
    inputs: { harnesses: ['codex'] },
    onWhat: 'example-hash',
    shows: 'Install or upgrade Codex, which every agent that runs on it uses.',
    level: 'everyone',
    signers: [...waiting, { kind: 'person', id: 'owner', why: 'the-person', name: null, signedAt: localStamp(new Date()) }],
    notSigned: waiting,
    raisedBy: { kind: 'person', id: 'owner', name: null },
    because: null,
    state: 'waiting',
    raisedAt: localStamp(new Date()),
    endsAt: localStamp(new Date(Date.now() + 30 * 60_000)),
    closedAt: null,
    closedBy: null,
    outcome: null,
  }
}

/** A word as React writes it into markup. */
const asDrawn = (words: string): string => words.replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** A failed press as the page's api makes it from the door's reply. */
function aFailedPress(status: number, body: object): Error {
  const fault = api.readFault(status, '/api/harnesses/install', body)
  return new api.ApiError(fault.status, fault.message, fault)
}

describe('the install press tells a wait from a refusal', () => {
  it('reads the checklist from a readinessWaits reply, and nothing from a refusal', () => {
    const waits = aFailedPress(409, { error: 'This waits for signatures before it runs. The readiness checklist is example-checklist.', code: 'readinessWaits', values: { checklist: 'example-checklist' } })
    expect(panel.theChecklistThePressWaitsFor(waits)).toBe('example-checklist')
    const refused = aFailedPress(400, { error: 'This server has no HOME. Nothing was installed.', code: 'harnessNoHome', values: {} })
    expect(panel.theChecklistThePressWaitsFor(refused)).toBeNull()
    expect(panel.theChecklistThePressWaitsFor(new Error('Example: no reply'))).toBeNull()
  })

  it('says the signature is recorded, who it waits for, that it starts by itself, and links to the checklist', () => {
    const drawn = renderToStaticMarkup(h(panel.TheInstallWaits, { id: 'example-checklist' }))
    expect(drawn).toContain(asDrawn(en['harnesses.waiting.signed']))
    expect(drawn).toContain(asDrawn(en['harnesses.waiting.byItself']))
    expect(drawn).toContain('href="#/readiness/example-checklist"')
    expect(drawn).not.toContain(asDrawn(en['harnesses.installRefused']))
    const who = renderToStaticMarkup(h(panel.TheSignersStillToSign, { checklist: aWaitingInstall() }))
    expect(who).toContain(asDrawn(en['harnesses.waiting.for']))
    expect(who).toContain('<li>example-secretary-one</li>')
    expect(who).toContain('<li>example-secretary-two</li>')
  })
})
