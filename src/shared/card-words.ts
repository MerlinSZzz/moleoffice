// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { content, t, type WordKey } from './i18n.ts'
import { THE_INSPECTOR, THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from './roles.ts'
/**
 * A ROLE CARD'S NAME, IN THE PAGE LANGUAGE. Problem SGTqdnfCmQxh.
 *
 * A card is stored under its name: `secretary`, `worker` and so on, in the role cards' declaration
 * and on every row that names a card. That stored name stays as it is. A page that names a card
 * reads it through `cardWord`, so a Chinese page says 秘书 where it used to say `secretary`.
 *
 * THIS IS THE ONE PLACE A CARD'S WORD IS READ (invariant 9). The Embassy, the Casting table, the
 * agent page, the Role cards page, the census, the contacts list, the contact groups, the check
 * panel's "who the office asked" and the new card page's list of rungs all ask here. The contact
 * groups of the four agent cards are named by these same words (`groupHeading` in
 * src/shared/contacts.ts), so the group heading and the card cannot come to say two different
 * things.
 *
 * THE WORKER CARD IS 工人 IN CHINESE, ONE WORD ACROSS THE INTERFACE, and never 工作者.
 * The word is decided, and one thing keeps one word everywhere the interface
 * names it. The cards' own Chinese texts in the role cards' declaration say
 * 工人, and so do the word lists. The same test fails if any Chinese string, in the word lists or in
 * the cards' texts, uses the other of the two words, so a later change of this word changes every
 * string that says it, and the test names each one.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT TELLS AN OFFICE CARD FROM A CARD A PERSON NAMED
 * ---------------------------------------------------------------------------------------
 *
 * `CARD_WORD_KEYS` holds exactly the names the role cards' declaration declares: its agent cards
 * and its person cards.
 *
 * Any other name was written by a person: a card made on the Role cards page (criterion P51), or a
 * name on a row whose card has since left the declaration. Such a name is drawn exactly as it was
 * written, as content. Nothing guesses a translation for it. A card made on the Role cards page
 * never carried a declared name, because `POST /api/roles/cards` in src/server/api/roles.ts refused a
 * name the declaration already holds, and that door now refuses every write. So a name in this table
 * always means the office's card.
 */

/** The word-list key of each card the declaration declares, by its stored name. */
export const CARD_WORD_KEYS: Readonly<Record<string, WordKey>> = {
  [THE_SECRETARY]: 'unlistedWords.card.secretary',
  [THE_INSPECTOR]: 'unlistedWords.card.inspector',
  [THE_SUPERVISOR]: 'unlistedWords.card.supervisor',
  [THE_WORKER]: 'unlistedWords.card.worker',
  // The one person card. src/shared/roles.ts names it only as what a person with no card reads as.
  administrator: 'unlistedWords.card.administrator',
}

/** The word-list key for this card's name, or null because the name is not a declared card. */
export function cardWordKey(name: string): WordKey | null {
  return Object.hasOwn(CARD_WORD_KEYS, name) ? (CARD_WORD_KEYS[name] ?? null) : null
}

/**
 * THE NAME A PAGE DRAWS FOR A CARD. A declared card is read from the word lists; any other name is
 * drawn as it was written. `read` is the page's reader of words; a page that keeps its own reader,
 * as the office map does, passes it.
 */
export function cardWord(name: string, read: (key: WordKey) => string = (key) => t(key)): string {
  const key = cardWordKey(name)
  return key === null ? content(name) : read(key)
}

/** One part of a numbered step of a card's How it works, in English and in Chinese. */
export interface AStepsPart {
  readonly n: number
  readonly en: string
  readonly zh: string
}

/**
 * WHAT EACH AGENT CARD SAYS ABOUT A DECISION OF THE AGENT'S OWN, word for word as the role cards'
 * declaration (src/config/roles.json) ships it. An agent that decides something others will rely on
 * records it as a decision under its own handle, with its authority, and a superior reviews the
 * decisions its agents recorded. The duties carry whole sentences, in English, the one language the
 * declaration gives a card's duties. Each numbered step of How it works carries its part in English
 * and in Chinese.
 *
 * The declaration is a JSON file and cannot read this constant, so the words are written in both
 * places. A test deleted on 13 November 2026 read them from here and failed when a card did not carry one of
 * them. Nothing checks that now, so a change to one place needs the same change in the other.
 */
export const A_DECISION_OF_ITS_OWN: Readonly<Record<string, { readonly duties: readonly string[]; readonly steps: readonly AStepsPart[] }>> = {
  [THE_WORKER]: {
    duties: [
      'When it decides something of its own that others will rely on, such as an engineering judgement, it records that as a decision under its own handle, with its authority, and does not only write it inside its report.',
    ],
    steps: [{ n: 5, en: 'and records the decision under its own handle with its authority', zh: '并以自己的名义把它记成一条决定，写明依据' }],
  },
  [THE_SUPERVISOR]: {
    duties: [
      'When it decides something of its own that others will rely on, such as a design choice or an engineering judgement, it records that as a decision under its own handle, with its authority, and does not only write it inside a report.',
      "When it reviews a worker's work, it reviews the decisions the worker recorded too, and says whether each holds.",
    ],
    steps: [
      { n: 4, en: 'and records the decision under its own handle with its authority', zh: '并以自己的名义把它记成一条决定，写明依据' },
      { n: 5, en: 'and the decisions its workers recorded, and says whether each holds', zh: '也读工人记下的决定，说明每一条是否站得住' },
    ],
  },
  [THE_SECRETARY]: {
    duties: [
      'When it decides something of its own that others will rely on, such as a ruling between lines or an engineering judgement, it records that as a decision under its own handle, with its authority, and does not only write it inside a report.',
      "When it reviews a supervisor's work, it reviews the decisions the supervisor and its workers recorded too, and says whether each holds.",
    ],
    steps: [{ n: 14, en: 'records the decision under its own handle with its authority', zh: '以自己的名义把它记成一条决定、写明依据' }],
  },
  [THE_INSPECTOR]: {
    duties: ['It reads the decisions the run recorded, and says whether each holds.'],
    steps: [{ n: 2, en: 'the decisions it recorded', zh: '它记下的决定' }],
  },
}

/**
 * HOW THE AGENTS COME BACK AFTER THEY HAVE STOPPED, as the secretary card's step 4 of How it works says it, word for
 * word as the role cards' declaration (src/config/roles.json) ships it, in English and in Chinese. They come back down
 * the chain, one at a time. The administrator brings back the secretary, and each superior on this computer then
 * brings back the agents below it, through the way back's press (src/server/api/terminal-agents.ts).
 *
 * The declaration is a JSON file and cannot read this constant, so the words are written in both places.
 * A test deleted on 13 November 2026 read them from here and failed when the card did not carry them. Nothing checks that
 * now, so a change to one place needs the same change in the other.
 */
export const AGENTS_COME_BACK_DOWN_THE_CHAIN: AStepsPart = {
  n: 4,
  en:
    'After the agents have stopped, they come back down the chain, one at a time and not all at once. The administrator ' +
    'brings back the secretary. Then each superior on this computer brings back, through the office, the agents below ' +
    'it that the work needs: an agent it started, or one started by an agent below it. Each comes back to its own ' +
    'conversation, and its run gets its own key, as when the administrator brings it back. No press brings every agent back.',
  zh:
    '智能体都停下以后，它们沿着上下级一级一级地回来，一次一个，不是一起回来。管理员把秘书叫回来。然后，这台电脑上的每个上级' +
    '通过办公室，把手下工作用得上的智能体叫回来：它自己启动的，或者由它手下的智能体启动的。每个智能体都回到自己原来的对话，' +
    '它的运行拿到自己的密钥，和管理员叫它回来时一样。没有一个按钮能把所有智能体一起叫回来。',
}
