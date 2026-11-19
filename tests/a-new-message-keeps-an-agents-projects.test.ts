// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A message in another project does not change the projects of an agent contact. */
import { expect, it } from 'vitest'
import { contactsWithANewMessage } from '../src/web/lib/chatdeltas.ts'
import type { ShortContactsReply } from '../src/web/api.ts'
import type { WhatANewMessageChanges } from '../src/shared/events.ts'

it('keeps an agent’s projects and still updates a person’s conversation projects', () => {
  const me = { kind: 'person', id: 'made-up-reader' } as const
  for (const kind of ['agent', 'person'] as const) {
    const them = { kind, id: 'made-up-contact' }
    const reply = {
      me, unread: { messages: 0, groups: 0 },
      contacts: [{ who: them, key: `${kind}:made-up-contact`, group: 'made-up-group', at: 0, online: false, last: null, unread: 0, anythingUnread: false, foldedUnder: null, projects: ['made-up-home'] }],
    } as unknown as ShortContactsReply
    const event = {
      entry: { id: 'made-up-message', body: 'Made-up message', sentAt: '2026-01-01 00:00:00', aboutProject: 'made-up-elsewhere', writtenIn: null },
      pairs: [[me, them]], counts: [], fresh: true,
      forTheReader: { reader: me, placedByHand: [], betweenAgents: [] },
    } as unknown as WhatANewMessageChanges
    const changed = contactsWithANewMessage(reply, event)
    expect(changed).not.toBe('read')
    if (changed === 'read') throw new Error('The row could not be updated.')
    expect(changed.contacts[0]?.projects).toEqual(kind === 'agent' ? ['made-up-home'] : ['made-up-elsewhere', 'made-up-home'])
  }
})
