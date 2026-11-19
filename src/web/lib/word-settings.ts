// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { moleOfficeRequest } from '../api.ts'
import { installSavedWords, wordReadFailed, wordGeneration, subscribeWords, type SavedWords } from '@shared/word-settings.ts'
import { useSyncExternalStore } from 'react'
import { hearAlways, whenEventsWereLost, whenTheStreamCameBack } from './channel.ts'

let request = 0
export function useWordGeneration(): number { return useSyncExternalStore(subscribeWords, wordGeneration, wordGeneration) }
/** Refresh every tab, including another project, through the office's existing settings event. */
export async function readPageWords(): Promise<void> {
  const thisRequest = ++request
  const reply = await moleOfficeRequest<{ words: SavedWords; revision: string }>('/api/words/effective')
  if (thisRequest === request) installSavedWords(reply.words, reply.revision)
}
export function listenForWordChoices(): void {
  const refresh = () => { void readPageWords().catch(error => {
    // A failed refresh keeps the last observed choice and names the unconfirmed state.
    wordReadFailed(error instanceof Error ? error.message : String(error))
  }) }
  hearAlways(event => { if (event.name === 'machine.changed' && event.changed.includes('settings')) refresh() }, ['machine.changed'])
  whenEventsWereLost(refresh)
  whenTheStreamCameBack(refresh)
}
