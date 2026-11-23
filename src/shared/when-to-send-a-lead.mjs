// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHEN A MESSAGE SHOULD CARRY A LEAD, said to an agent in the places it meets one: the `lead` field's words in
 * src/shared/kinds.ts, the write door's answer to a message that carries one (`leadReminder` in
 * src/server/api/records.ts), the office tool's description in tools/office-request.mjs, and the skill's section on
 * taking somebody to a page. The skill carries these same words, and a test checks that it does. A lead takes the
 * reader to a place, so it is kept for a report written for the reader or a page where they must act. It is a reminder
 * only: nothing is refused because of it, and a lead to anything is stored as sent. The door says it only for a lead
 * that is not right, as src/server/lib/when-a-lead-is-reminded.ts works out.
 */
export const WHEN_TO_SEND_A_LEAD =
  "A message's lead is only for a report written for the reader or a page where they must act; for " +
  'anything else, put a plain link in the body.'
