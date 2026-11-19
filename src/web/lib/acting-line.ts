// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ACTING-FOR-YOU LINE ON AN AGENT'S PAGE, WORKED OUT AS WORDS: "Acting for Morgan until today at
 * 18:15", "正在代替 Morgan 直到你结束授权".
 *
 * EVERY JOIN IN THE LINE IS `gapBetween`'S ANSWER (src/shared/spacing.ts), and nothing else's. The
 * head is three parts, the end is one of five things, and which separator each join takes depends on
 * the characters that meet there: a Chinese line reads 直到“标题”完成 and an English one "until
 * “Title” is finished". So the end is worked out here as words first, its separator with it, and the
 * page (`GrantEnd` in src/web/components/TheirCard.tsx) only draws what this returns. A typed space in
 * the page would be a second spacing rule.
 *
 * `tests/the-acting-line-has-one-spacing-rule.test.ts` holds this in Chinese and in English.
 */
import { content, t } from '@shared/i18n.ts'
import { gapBetween } from '@shared/spacing.ts'
import { momentOfStampInZone } from '@shared/time.ts'
import type { ElevationHeld } from '@shared/roles.ts'
import { whenInWords } from '../components/RaiseEndChoice.tsx'

/** The head of the line, "Acting for Morgan until", each join spaced by `gapBetween`. */
export function actingForHead(actingFor: string): string {
  const parts = [t('g6b.elevation.ACTING_FOR'), actingFor, t('g6b.elevation.UNTIL')]
  return parts.reduce((line, part) => line + gapBetween(line, part) + part)
}

/** The piece of work the grant ends with, once its record has been read; null while it has not. */
export interface TheWorkItEndsWith {
  id: string
  title: string
}

/**
 * THE END OF THE LINE: its words, the separator before them, and how the page draws them.
 *   · `words`: drawn as they are;
 *   · `absent`: the grant ends at a time and no time was ever stored, drawn as the product's absence
 *     mark, whose word is `words`;
 *   · `link`: the piece of work it ends with, drawn as a link to that record.
 */
export interface TheEndOfTheLine {
  gap: '' | ' '
  words: string
  draw: 'words' | 'absent' | 'link'
  to: string | null
}

/**
 * WHAT COMES AFTER `before`, in the page language. `inspect` is developer mode, where the line ends with
 * the server's own sentence; `work` is the record the grant ends with, or null while it is not read or
 * names nothing; `now` is the moment "today" and "tomorrow" are counted from.
 */
export function theEndOfTheLine(
  before: string,
  held: ElevationHeld,
  zone: string,
  options: { inspect: boolean; work: TheWorkItEndsWith | null; now: number },
): TheEndOfTheLine {
  const end = (words: string, draw: TheEndOfTheLine['draw'] = 'words', to: string | null = null): TheEndOfTheLine => ({
    gap: gapBetween(before, words),
    words,
    draw,
    to,
  })
  if (options.inspect) return end(held.untilInWords)
  if (held.endsWhen === 'at a time') {
    // A TIME NEVER STORED is drawn as the absence mark, joined by the same rule as every other end.
    if (held.until === null) return end(t('absence.mark'), 'absent')
    // THE STORED STAMP, ON THE OFFICE'S CLOCK, TO THE MINUTE. A stamp that does not read is drawn as it is stored.
    const at = momentOfStampInZone(held.until, zone)
    return end(at === null ? held.until : whenInWords(at, options.now, zone))
  }
  if (held.endsWhen !== 'when a piece of work ends') return end(t('g6b.elevation.youEndIt'))
  if (options.work === null) return end(t('g6b.elevation.namedWorkEnds'))
  return end(t('g6b.elevation.workEnds', { title: content(options.work.title) }), 'link', options.work.id)
}
