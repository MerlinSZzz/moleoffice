// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD PAGE NAMES THE OFFICE'S OWN WRITES AS THE OFFICE (wave 13p round 27, piece 2d).
 *
 * The API server writes a change row as the agent `mole-office/the-api-server` when it acts on its own.
 * No registry row holds that id, so `writerNamed` in src/web/lib/participant-lookup.ts used to say
 * "an unregistered agent" for it, as if somebody's program had written without registering. It names
 * that writer by the office's word now, the same word a `system` row gets.
 *
 * The server's writer (`THE_OFFICE_WRITES_AS`) is checked here too, so the page and the server are
 * shown to hold the one id between them.
 *
 * MUTATIONS, each proved red after a control run and restored:
 *   1. writerNamed back to asking only `system` turns the first case red.
 *   2. THE_OFFICE_WRITES_AS given its own literal id with a typo turns the second case red.
 *
 * THREE OTHER PARTS OF THE OFFICE (wave 13p round 29). The message worker (the merge tool writes as it),
 * the dev supervisor and the world sweep each write under an id no registry holds. A page names each as
 * that part of Mole Office, and never as an unregistered agent.
 *   3. writerNamed back to naming only THE_OFFICE_WRITER_ID as the office turns the third case red.
 *
 * THE THREE NAMES ARE TRANSLATED. Each language reads the office-part word key, with and without
 * registries. A person using an office writer id is still a person, and an unknown agent remains
 * unregistered. All three names have Chinese.
 * The fourth case holds the three tools' own copies of the ids to the ones the page reads.
 */

import { describe, expect, it } from 'vitest'

import { THE_DEV_SUPERVISOR_ID, THE_MESSAGE_WORKER_ID, THE_OFFICE_WRITER_ID, THE_WORLD_SWEEP_ID } from '../src/shared/participants.ts'
import { THE_OFFICE_WRITES_AS } from '../src/server/lib/the-offices-secretary-run.ts'
import type { ParticipantOnTheWire, ParticipantsReply } from '../src/web/api.ts'
import { createI18n, WORD_LISTS } from '../src/shared/i18n.ts'
import { theWaitingList } from './words-waiting-for-translation.ts'

const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
;(globalThis as unknown as { window: unknown }).window ??= {
  localStorage: storage,
  sessionStorage: storage,
  location: { hash: '', search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
}

const registry = {
  people: [],
  agents: [{ kind: 'agent', id: 'fixture-agent-id', handle: 'fixture-agent', name: 'Fixture Agent' } as unknown as ParticipantOnTheWire],
} as unknown as ParticipantsReply

describe("the office's own writes", () => {
  it('are named as the office, with or without the registries, and an unregistered agent is still said to be one', async () => {
    const { setWordLanguage } = await import('../src/shared/i18n.ts')
    const { writerNamed } = await import('../src/web/lib/participant-lookup.ts')
    setWordLanguage('en')
    const office = { actorType: 'agent', actorId: THE_OFFICE_WRITES_AS.id }
    expect(writerNamed(office, registry)).toBe('Mole Office')
    expect(writerNamed(office, undefined)).toBe('Mole Office')
    expect(writerNamed({ actorType: 'system', actorId: 'anything' }, registry)).toBe('Mole Office')
    expect(writerNamed({ actorType: 'agent', actorId: 'fixture-agent' }, registry)).toBe('Fixture Agent')
    expect(writerNamed({ actorType: 'agent', actorId: 'fixture-nobody' }, registry)).not.toBe('Mole Office')
    // A person stored under the office's id is not the office: only an agent row is.
    expect(writerNamed({ actorType: 'human', actorId: THE_OFFICE_WRITER_ID }, registry)).not.toBe('Mole Office')
  })

  it('are written by the server under the id the page knows', () => {
    expect(THE_OFFICE_WRITES_AS).toEqual({ type: 'agent', id: 'mole-office/the-api-server' })
    expect(THE_OFFICE_WRITES_AS.id).toBe(THE_OFFICE_WRITER_ID)
  })

  it('name the message worker, the dev supervisor and the world sweep as parts of Mole Office in both languages', async () => {
    const { setWordLanguage } = await import('../src/shared/i18n.ts')
    const { writerNamed } = await import('../src/web/lib/participant-lookup.ts')
    const named = (id: string, participants: ParticipantsReply | undefined) => writerNamed({ actorType: 'agent', actorId: id }, participants)
    try {
      const names = [
        [THE_MESSAGE_WORKER_ID, 'record.writer.theMessageWorker'],
        [THE_DEV_SUPERVISOR_ID, 'record.writer.theDevSupervisor'],
        [THE_WORLD_SWEEP_ID, 'record.writer.theWorldSweep'],
      ] as const
      for (const language of ['en', 'zh'] as const) {
        setWordLanguage(language)
        const { t } = createI18n(language)
        for (const participants of [registry, undefined]) {
          for (const [id, key] of names) expect(named(id, participants)).toBe(t(key))
        }
        expect(named('fixture-nobody', registry)).toBe(t('record.writer.unregisteredAgent'))
      }
      const keys = new Set(names.map(([, key]) => key))
      const waiting = theWaitingList().waiting.filter(one => keys.has(one.key as typeof names[number][1]) && one.reason === 'noChinese')
      expect(waiting).toEqual([])
      for (const [, key] of names) expect(WORD_LISTS.zh[key]).toBeDefined()
      // A person stored under one of these ids is not that part of the office.
      expect(writerNamed({ actorType: 'human', actorId: THE_MESSAGE_WORKER_ID }, registry)).toBe(createI18n('zh').t('record.writer.unregisteredPerson'))
    } finally {
      setWordLanguage('en')
    }
  })
})
