// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER MEDIA A RECORD POINTS AT ARE LOADED, AND WHEN: with the page, never, or on a press.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U5 of design/settings/ACCEPTANCE.md: whether media load is a setting with three choices,
 * on the Settings page, and the person's own. The three are:
 *
 *   1. the media load with the page;
 *   2. the media never load, and each shows its name, its size and a press; and
 *   3. the media load on a press.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS NOT `message_pictures`, AND READING IT AS ONE WOULD BUILD THE WRONG THING
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/messagepictures.ts` is the picture INSIDE A CHAT MESSAGE, and its three words are
 * `shown`, `pressed` and `path`. `path` draws the file's path as text and is not "never load, and
 * show the name, the size and a press". It also answers about a bubble, which is scrolled, where
 * this answers about a figure in a record, which is read. The two are different settings asking
 * different questions, and the person may want pictures drawn in a chat and never loaded in a
 * report. They live in the same shape on the same row on purpose, so a reader comparing them can
 * see that they are two, and neither is a rename of the other.
 *
 * ---------------------------------------------------------------------------------------
 * NULL IS A THIRD ANSWER AND NOT THE DEFAULT
 * ---------------------------------------------------------------------------------------
 *
 * The column that holds this is NULL when nobody has chosen. That is a real answer and is not the
 * same fact as having chosen `with-page`: a screen that reads NULL says "nobody has chosen yet",
 * and only a screen that reads `with-page` says the person chose to load with the page. It follows
 * the person to every machine because it is on the person's registry row, exactly as the message
 * pictures setting does since decision rJphPkCG3l7X.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS SETTING DOES NOT COVER, AND THE FIFTEEN PLACES THAT LOAD MEDIA WITHOUT IT
 * ---------------------------------------------------------------------------------------
 *
 * It governs media a RECORD OR A MESSAGE points at, which is the one fetch in this web app:
 * `usePictureBytes` in `src/web/components/SummaryBlocks.tsx`, called by `ImageFigure` for a
 * report's picture and by `MessagePictures.tsx` for the chat's own picture setting. FIFTEEN other
 * places draw media as a plain `<img src>` with no fetch, and they are outside this setting on
 * purpose:
 *
 *   Avatar.tsx:99 (its own docblock says an img src is not a fetch and was not moved),
 *   ChatCircle.tsx:142, Chat.tsx:2979, AvatarPicker.tsx:284, EmbassyPage.tsx:612,
 *   RolesPage.tsx:379 and :732, RoleCardNewPage.tsx:199 and :344, RoleCensusPage.tsx:173,
 *   TheirCard.tsx:147, RoleCard.tsx:285, YourCard.tsx:163 and :237, and
 *   pixel-office/PixelArtBook.tsx:4.
 *
 * That is the office's own furniture — avatars, role portraits, the chat circle and the pixel-office
 * sheets — and not a file a record or a message points at. A person who chose never still sees the
 * interface they navigate by. If that reading is ever judged wrong, the count is fifteen and the
 * lines are above, so widening the setting is a decision rather than an accident.
 */

/**
 * The three answers. The first is what a person who has never chosen gets.
 *
 * The stored words are short and are not the words on the screen: `MEDIA_LOAD_WORDS` below holds
 * those, so a name a person reads can be rewritten without invalidating what is already stored.
 */
export const MEDIA_LOAD_CHOICES = ['with-page', 'never', 'on-press'] as const

/** One of the three. */
export type MediaLoadChoice = (typeof MEDIA_LOAD_CHOICES)[number]

/**
 * WHAT IT DOES WHEN NOBODY HAS CHOSEN: the media load with the page.
 *
 * This is the behaviour every record drew before the setting existed, so a person who never opens
 * the control sees no change.
 */
export const MEDIA_LOAD_BY_DEFAULT: MediaLoadChoice = 'with-page'

/**
 * WHAT EACH ANSWER IS CALLED. Three names, and none of them is a sentence.
 *
 * They name what a reader will see, not the mechanism that produces it: "With the page" rather than
 * "eager", "On a press" rather than "lazy loading".
 */
export const MEDIA_LOAD_WORDS: Readonly<Record<MediaLoadChoice, string>> = {
  'with-page': 'With the page',
  never: 'Never',
  'on-press': 'On a press',
}

/** True when this value, which came out of a row and could be anything, is one of the three. */
export function isMediaLoadChoice(word: unknown): word is MediaLoadChoice {
  return typeof word === 'string' && (MEDIA_LOAD_CHOICES as readonly string[]).includes(word)
}

/**
 * WHAT A PERSON PRESSES TO LOAD A PICTURE OR A VIDEO THAT IS WAITING.
 *
 * Written here so a report draws one press and cannot come to call it two things.
 */
export const MEDIA_LOAD_PRESS = 'Load it'

/**
 * WHICH CHOICE IS IN FORCE, SAID AS A PERSON WOULD SAY IT.
 *
 * A report draws this where a picture is not drawn and the person's own choice is the reason, so
 * the reader is told the state rather than left to guess why nothing is there. It names the choice
 * by the word on the control — never the stored word and never the machinery, because chapter six
 * rule four and chapter ten rule two forbid both.
 */
export function mediaLoadSays(choice: MediaLoadChoice): string {
  switch (choice) {
    case 'with-page':
      return 'The choice in force is With the page, so a picture or video loads with the page.'
    case 'never':
      return 'The choice in force is Never, so this is not loaded.'
    case 'on-press':
      return 'The choice in force is On a press, so this loads when you press.'
  }
}

/**
 * WHAT A REPORT SAYS ABOUT A SIZE NOBODY HAS MEASURED.
 *
 * A size the browser has not fetched is a size nobody knows, and absence beats a guess. This is the
 * sentence that says so where the size would have been.
 */
export const MEDIA_LOAD_SIZE_NOT_KNOWN = 'Its size is not known until it is loaded.'

/**
 * WHAT A CONTROL SAYS WHEN THE ROW HOLDS NO CHOICE, so the default is not drawn as a choice
 * somebody made. Chapter six rule four: the state a reader is in, and it is nobody having chosen.
 */
export const MEDIA_LOAD_NOBODY_HAS_CHOSEN =
  'Default: with the page.'
