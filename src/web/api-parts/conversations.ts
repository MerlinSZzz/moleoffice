// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s, the conversation sync. The browser's three doors to it. Wave 13s round 242 made the doors; a line
// adds its new doors to its own part, and src/web/api-parts/join.ts joins every part into `api`.
import type {
  ConversationLine,
  ConversationSyncOutcome,
  ConversationSyncReply,
  ConversationSyncSetting,
} from '@shared/conversation-sync.ts'
import { request } from '../api.ts'

/** What the run door answers: the setting it used, the counts, and every line it read. */
export interface ConversationSyncRunReply {
  setting: ConversationSyncSetting
  outcome: ConversationSyncOutcome
  lines: ConversationLine[]
}

export const conversationsDoors = {
  /**
   * WHAT THIS PROJECT HAS OPTED INTO, the path map, and a page of the copies already made. Each line names the run, its
   * runtime word and the state the office read. No transcript is in this answer.
   */
  conversationSync: () => request<ConversationSyncReply>('/api/conversations/sync'),

  /**
   * TURN THE SYNC ON OR OFF. THE PERSON ONLY, and the server refuses anybody else. The path map is kept when it is not
   * sent; the panel sends only the boolean, because it has no map to edit.
   */
  setConversationSync: (enabled: boolean) =>
    request<ConversationSyncReply>('/api/conversations/sync', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  /**
   * READ THE LATEST RUNS' CONVERSATION FILES AND STORE THEIR SCRUBBED COPIES. THE PERSON ONLY, and the server refuses
   * anybody else. The panel reads the sync again afterwards; this answer's lines are the same copies.
   */
  runConversationSync: () =>
    request<ConversationSyncRunReply>('/api/conversations/sync/run', { method: 'POST', body: '{}' }),
}
