// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAILER CARD AND ITS ONE POWER, AS design/permissions/roles.json HELD THEM UNTIL 1 OCTOBER 2026.
 *
 * A decision: the mail tool is the owner's own tool, set in their Settings, and not an agent or a role
 * card. So the card and the power "Reading the summonses" left the declaration
 * (wave 13k, round 19). An office that registered its mail tool before then still holds a live agent on this card,
 * until the person's install press moves it (entry lFue85tybWsc). A test that needs such an agent puts
 * these two back into its own server's declaration for the moment it registers one, and takes them out
 * again, so the agent is then on a card that has gone, as it is in that office.
 *
 * This is a copy of what the file held, kept here and nowhere in src/, so no running office reads it.
 * The file's own history in git is the record of the card; this copy only lets a test make the old state.
 * Three citations of a decision were taken out of the card's words below; nothing else differs from the file.
 */
import type { RoleCard, RolesDeclaration } from '../src/shared/roles.ts'

export const THE_MAILER_CARD_THAT_LEFT = {
  "name": "mailer",
  "rung": null,
  "duties": "It is a tool, not a model. It reads each summons since the last one it read (who called, how urgent, the title and when) and takes it to the person another way: the mail tool mails it to the list of addresses the person keeps. It reads nothing else of the office and writes nothing in it: its card is refused everything but its one power, the acts no power names as well. It holds a key of its own, which the person can take back or renew on its card. The person's decision chose this over the office starting a program for each summons.",
  "powers": [
    "Reading the summonses"
  ],
  "refusedEverythingElse": true,
  "appointedBy": "the person",
  "appoints": "nobody",
  "mustRead": {
    "chapters": [],
    "andWhatItsStarterNames": null
  },
  "workArea": {
    "grain": "nothing",
    "most": 0,
    "says": "A mailer registers no files and no folders: it reads the summonses and mails them, and touches nothing of the office's."
  },
  "reportsTo": "The person.",
  "whatEndsIt": "Only the person retires it. A tool that stops is not retired, and its key stays until the person takes it back."
} as unknown as RoleCard

export const THE_SUMMONS_POWER_THAT_LEFT = {
  "name": "Reading the summonses",
  "whatItIs": "Read each summons since the last one it read: who called, how urgent, the one-line title and when, and nothing else of the office, so that a tool can take the summons to the person another way, as the mail tool mails it to the list the person keeps. The person's decision gives this power to the mailer card alone.",
  "acts": [
    {
      "act": "office.read-summonses",
      "inWords": "Read the summonses since the last one it read"
    }
  ]
} as unknown as RolesDeclaration['powers'][number]

/**
 * Run `act` with the mailer card and its power back in `decl`, then put `decl` back as it was, even
 * when `act` throws. `decl` is the declaration a test's own server holds in memory.
 */
export async function withTheMailerCardBack<T>(decl: Pick<RolesDeclaration, 'cards' | 'powers'>, act: () => Promise<T>): Promise<T> {
  const before = { cards: decl.cards, powers: decl.powers }
  decl.cards = [...decl.cards, THE_MAILER_CARD_THAT_LEFT]
  decl.powers = [...decl.powers, THE_SUMMONS_POWER_THAT_LEFT]
  try {
    return await act()
  } finally {
    decl.cards = before.cards
    decl.powers = before.powers
  }
}
