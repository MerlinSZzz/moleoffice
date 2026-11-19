// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The key the dead-letter sweep keeps a waiting letter by: the letter's message id and its addressee's id, joined by a tilde. It imports no database client, so the re-mint remakes a key with it. */
export const aDeadLetterKey = (messageId: string, agentId: string): string => `${messageId}~${agentId}`
