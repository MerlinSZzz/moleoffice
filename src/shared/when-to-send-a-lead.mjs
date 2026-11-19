// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHEN A MESSAGE SHOULD CARRY A LEAD, said to an agent in the three places it makes one: the `lead` field's words in
 * src/shared/kinds.ts, the write door's answer to a message that carries one (`leadReminder` in
 * src/server/api/records.ts), and the office tool's description in tools/office-request.mjs. A lead takes the reader
 * to a place, so it is kept for a reader who really must go there. It is a reminder only: nothing is refused because of
 * it, and a lead to anything is stored as sent.
 */
export const WHEN_TO_SEND_A_LEAD =
  "A message's lead is for a report the reader must read or a page where they must act, and a plain link in the body is for anything else."
