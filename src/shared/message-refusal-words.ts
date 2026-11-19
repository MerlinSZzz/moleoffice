// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO PIECES OF THE WORDS A REFUSAL ABOUT A MESSAGE USES.
 * `NOTHING_WAS_SENT` and `quotedUnlessAMessage` were moved byte for byte out of src/server/lib/messages.ts,
 * with no change of behaviour. That file re-exports both.
 */

/** What the record door adds to the sentence above when it refuses a message. */
export const NOTHING_WAS_SENT = 'Nothing was sent.'

/**
 * A RECORD'S TITLE AS A REFUSAL ABOUT THE WRONG KIND OF RECORD QUOTES IT: between `before` and `after`,
 * or nothing at all when the record is a message. Such a refusal answers whoever sent the id, and a
 * message's title is read only by those the rule lets read it, so no refusal
 * of that kind quotes one to anybody.
 */
export function quotedUnlessAMessage(record: { kind: string; title: string }, before: string, after: string): string {
  return record.kind === 'message' ? '' : `${before}"${record.title}"${after}`
}
