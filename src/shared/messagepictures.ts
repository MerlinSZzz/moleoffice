// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PICTURE INSIDE A CHAT MESSAGE IS DRAWN: shown, shown after a press, or the path alone.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE ARE THREE ANSWERS AND NOT TWO
 * ---------------------------------------------------------------------------------------
 *
 * Pictures in the chat are a setting, with three choices: pictures shown by default, a picture shown
 * after a press, and only the picture's path shown. Criterion M64 of design/messages/ACCEPTANCE.md
 * section 37.
 *
 * The three are not a scale from less to more. Each answers a different situation: a person reading
 * a conversation wants the picture; a person on a slow link or scrolling a long conversation wants
 * the words with the picture one press away; a person who is going to open the file in another
 * program wants the path and nothing else. `src/shared/pictures.ts` is the same question asked of a
 * REPORT and it has two answers there, because a report is read once and a conversation is scrolled.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ALT TEXT IS PART OF THE MIDDLE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * A picture waiting to be pressed is drawn as a placeholder carrying the alt text, never as a blank
 * grey box. A reader deciding whether to press has to be told what they would be pressing for, and
 * the alt text is the only description of the picture that exists. That is why `alt` is required on
 * an `ImageBlock` and not optional.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE PERSON'S ANSWER, KEPT ON THEIR REGISTRY ROW, SINCE 7 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Decision rJphPkCG3l7X moved it off this browser and onto the person's registry row, so it follows
 * them to every machine, the way every other choice about how their chat is drawn does. The
 * vocabulary is here, shared, because the conversation, the pool page and the settings panel all
 * name the same three answers and two lists of three would drift. Reading and writing the choice is
 * the browser's business and lives beside the reading, in `src/web/lib/messagepictures.ts`, the way
 * `lib/queueview.ts` does. This heading said "this browser" until 13 September 2026, and the line
 * about the person's row was already thirty lines further down saying the opposite; it is corrected
 * here rather than left as a second answer to where the choice lives.
 */

/**
 * The three answers. The first is what a person who has never chosen gets.
 *
 * The stored words are short and are not the words on the screen: `MESSAGE_PICTURE_WORDS` below
 * holds those, so the name a person reads can be rewritten without invalidating what every browser
 * has already remembered.
 */
export const MESSAGE_PICTURE_CHOICES = ['shown', 'pressed', 'path'] as const

/** One of the three. */
export type MessagePictureChoice = (typeof MESSAGE_PICTURE_CHOICES)[number]

/**
 * WHAT IT DOES WHEN NOBODY HAS CHOSEN: the picture is drawn.
 *
 * Showing the picture is the first of the three choices, and it is the default.
 */
export const MESSAGE_PICTURE_BY_DEFAULT: MessagePictureChoice = 'shown'

/**
 * WHERE THIS CHOICE USED TO BE KEPT, and nothing reads or writes it any more.
 *
 * Decision rJphPkCG3l7X of 7 September 2026 moved the choice onto the person's registry row. The key
 * stays named here so that anybody finding the leftover row in a browser's storage can see what it
 * was; nothing copies it up, because a choice made on one machine is not a choice made on another,
 * and nothing deletes it either, because this product does not reach into a browser to tidy.
 */
export const MESSAGE_PICTURE_KEY_BEFORE_IT_MOVED = 'mole-office.chat.pictures'

/**
 * WHAT EACH ANSWER IS CALLED. Three names, and none of them is a sentence.
 *
 * They name what the reader will see, not the mechanism that produces it: "On a press" rather than
 * "lazy loading", "Path only" rather than "text mode".
 */
export const MESSAGE_PICTURE_WORDS: Readonly<Record<MessagePictureChoice, string>> = {
  shown: 'Shown',
  pressed: 'On a press',
  path: 'Path only',
}

/** True when this value, which came out of storage and could be anything, is one of the three. */
export function isMessagePictureChoice(word: unknown): word is MessagePictureChoice {
  return typeof word === 'string' && (MESSAGE_PICTURE_CHOICES as readonly string[]).includes(word)
}

/**
 * WHAT A PERSON PRESSES TO SEE A PICTURE THAT IS WAITING, and what is said when there is nothing.
 *
 * Written here so the conversation and the pool page cannot come to call the same press two
 * different things.
 */
export const MESSAGE_PICTURE_PRESS = {
  /** The press on the placeholder, under the alt text. */
  show: 'Show the picture',
  /** How many pictures a message carries, said on the placeholder when there is more than one. */
  ofMany: (n: number, of: number): string => `Picture ${String(n)} of ${String(of)}`,
} as const
