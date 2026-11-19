// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The id the message worker writes under. This module imports nothing, so the launcher can read the
 * id without loading participants.ts and the modules it imports. participants.ts exports it under
 * the same name for every other reader.
 */
export const THE_MESSAGE_WORKER_ID = 'mole-office/the-message-worker'
