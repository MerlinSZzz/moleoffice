// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'

const futureModule = '../src/shared/entry-end-recipients.ts'
const readSelector = () => import(futureModule)

it('keeps live supervisor and worker authors alongside their original starter and submitter in canonical first-seen order', async () => {
  const { entryEndRecipients } = await readSelector()
  for (const role of ['supervisor', 'worker']) {
    const agent = { id: `actual-${role}`, retired: false, startedBy: { kind: 'agent', id: 'original-line' } }
    const canonical = (stored: string) => stored === 'line-alias' ? 'original-line' : stored
    expect(entryEndRecipients({ agent, submittedBy: { kind: 'agent', id: 'line-alias' } }, canonical)).toEqual([
      { kind: 'agent', id: agent.id }, { kind: 'agent', id: 'original-line' },
    ])
    expect(entryEndRecipients({ agent: { ...agent, retired: true }, submittedBy: { kind: 'agent', id: 'distinct-submitter' } }, canonical)).toEqual([
      { kind: 'agent', id: 'original-line' }, { kind: 'agent', id: 'distinct-submitter' },
    ])
    expect(entryEndRecipients({ agent: null, submittedBy: { kind: 'person', id: 'synthetic-person' } }, canonical)).toEqual([])
  }
})
it('requires the supplied stored-reference resolution and propagates missing or ambiguous source without guessing a recipient', async () => {
  const { entryEndRecipients } = await readSelector()
  for (const reason of ['missing', 'ambiguous']) {
    expect(() => entryEndRecipients({ agent: null, submittedBy: { kind: 'agent', id: 'stored-reference' } }, () => { throw new Error(reason) })).toThrow(reason)
  }
})
