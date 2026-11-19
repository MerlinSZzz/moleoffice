// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIXED RULES OF LABELS AND THE ROLL, as the code applies them. The Casting page draws them as lines on its Rules
 * tab, each in the page's language under the word `casting.rule.<id>`, whose English is `says`. Nobody edits them:
 * a change to one is a change to the code that applies it.
 *
 * They are in a file that imports nothing because the English words read them: src/shared/casting.ts imports
 * participants.ts, which reaches the words, so a words file that read the list there would make a loop in which the
 * launcher reads AGENT_RUNTIMES before it is set. src/shared/casting.ts gives the list on as its own.
 */
export const CASTING_LABEL_RULES = [
  { id: 'theMark', says: 'In each list, one row carries the mark. The tools take that row when no model is named.' },
  { id: 'onlyWorkerBriefs', says: "The roll reads labels only for a worker started from a brief. Every other start draws from all of the role's rows, whatever their labels." },
  { id: 'briefNamesALabel', says: 'A brief names a label on a line that begins Difficulty:. The roll then draws only rows that carry that label. A brief with no such line draws from all of the rows.' },
  { id: 'noRowCarriesIt', says: 'If no row in force carries the label, nothing is drawn and the start is refused, naming the label.' },
  { id: 'zeroIsNotDrawn', says: 'A row with a probability of 0 is not drawn. That is all 0 means.' },
  { id: 'markedRow', says: 'If no row that carries the label has a probability above 0, the marked row of the list is taken, whatever its labels.' },
  { id: 'outUntil', says: "The roll and the next round skip a row while its Out until is still to come, and a row whose program the office's limits stop." },
  { id: 'projectReplaces', says: "A project's own list for a role replaces the list for every project as a whole." },
] as const satisfies readonly { id: string; says: string }[]
export type CastingLabelRule = (typeof CASTING_LABEL_RULES)[number]
