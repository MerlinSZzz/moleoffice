// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE CHINESE TEXT TAKES A SPACE, IN ONE PLACE.
 *
 * Chinese text in this office puts a space between a Chinese character and a Latin word or a number
 * ("在 Default 中", "其中 3 项"), and no space between two Chinese characters ("直到你结束授权"). A
 * full-width mark such as ，or 。 already separates, so it takes no space beside it. The curly
 * quotation marks, which both languages write with the same character, take no space beside a
 * Chinese character ("直到“标题”完成") and one beside a Latin word ("until “Title” is finished"). A
 * dash is spaced like a word in both, as the Chinese word list writes it ("已删除 — 从本周安排中移除").
 *
 * Three readers ask here. A line that is put together from parts on the page, such as the agent page's
 * acting-for-you line, asks `gapBetween` at each join, so its spaces follow the same rule as the word
 * lists. A word with a value in it, such as the card panel's "{card}角色卡做什么", is read through
 * `wordWithSpacedValues`, which asks `gapBetween` where the value meets Chinese text. A test
 * deleted on 13 November 2026 held the Chinese word lists to the same rule with `breaksTheSpacing`, so that a
 * word and a joined line followed one rule.
 */

/** One Chinese character (the unified ideographs and their extension A, and the compatibility block). */
const HAN = String.raw`[㐀-鿿豈-﫿]`
/** A full-width mark or space, which separates on its own. */
const FULL_WIDTH = /[　-〿＀-￯]/u
/** The quotation marks Chinese and English write with the same character: ‘ ’ “ ”. */
const SHARED_MARK = /[‘’“”]/u

const IS_HAN = new RegExp(HAN, 'u')
/** The curly marks that open a quotation, and those that close one (’ is also the apostrophe, which closes too). */
const OPENING_MARK = /[‘“]/u
const CLOSING_MARK = /[’”]/u

/**
 * THE SEPARATOR BETWEEN TWO PARTS OF A LINE: one space, or nothing. Nothing when either side is empty
 * or already ends or starts with a space or a full-width mark, and nothing between two Chinese
 * characters. One space in every other case: between two Latin words, and between a Chinese character
 * and a Latin word or a number.
 */
export function gapBetween(before: string, after: string): '' | ' ' {
  const last = before.slice(-1)
  const first = after.slice(0, 1)
  if (last === '' || first === '') return ''
  if (/\s/u.test(last) || /\s/u.test(first)) return ''
  if (FULL_WIDTH.test(last) || FULL_WIDTH.test(first)) return ''
  // A CURLY MARK FACES ONE WAY: nothing inside the marks, so no space after “ or ‘ and none before ” or ’. Until wave
  // 13q's round 30b this answered a space between “ and a Latin letter, and a value filled into “{id}” read “ Émile ”.
  if (OPENING_MARK.test(last) || CLOSING_MARK.test(first)) return ''
  // AN ELLIPSIS JOINS WHAT IT FOLLOWS, in both languages: "正在加载源文件索引…", "Loading…" (wave 13q's round 30b).
  if (first === '…') return ''
  // A QUOTATION MARK takes the spacing of what stands on its other side: none beside a Chinese character
  // or another mark, one space beside a Latin letter or a digit.
  if (SHARED_MARK.test(last) || SHARED_MARK.test(first)) {
    const other = SHARED_MARK.test(last) ? first : last
    return IS_HAN.test(other) || SHARED_MARK.test(other) ? '' : ' '
  }
  if (IS_HAN.test(last) && IS_HAN.test(first)) return ''
  return ' '
}

/** Placeholders that always hold a project's name or a count, so a Chinese character beside one wants a space. */
const NAME_OR_NUMBER_PLACEHOLDERS = ['project', 'n', 'count'] as const

/**
 * WHAT IS WRONG WITH ONE CHINESE STRING'S SPACING, or an empty list. It names:
 *   - a Chinese character joined straight to a Latin letter or a digit;
 *   - a space between two Chinese characters;
 *   - a space between a Chinese character and a curly quotation mark;
 *   - a Chinese character joined straight to a placeholder that always holds a name or a number.
 * Other placeholders are not judged: most of them hold a Chinese word ({kind}, {field}, {state}),
 * which takes no space.
 */
export function breaksTheSpacing(text: string): string[] {
  const found: string[] = []
  const plain = text.replace(/\{[^}]*\}/gu, ' ')
  if (new RegExp(`${HAN}[A-Za-z0-9]|[A-Za-z0-9]${HAN}`, 'u').test(plain)) found.push('a Chinese character joined to a Latin letter or a digit')
  if (new RegExp(`${HAN} ${HAN}`, 'u').test(text)) found.push('a space between two Chinese characters')
  if (new RegExp(`${HAN} ${SHARED_MARK.source}|${SHARED_MARK.source} ${HAN}`, 'u').test(text)) {
    found.push('a space between a Chinese character and a quotation mark')
  }
  const named = NAME_OR_NUMBER_PLACEHOLDERS.join('|')
  if (new RegExp(`${HAN}\\{(?:${named})\\}|\\{(?:${named})\\}${HAN}`, 'u').test(text)) {
    found.push('a Chinese character joined to a name or a number')
  }
  return found
}

/** Marks put around a value while a word is read, so the joins on each side of it can be found. Private-use characters, which no word holds. */
const VALUE_OPENS = ''
const VALUE_CLOSES = ''

/** Whether a character joins by the Chinese rule: a Chinese character or a curly quotation mark. */
const JOINS_THE_CHINESE_WAY = (char: string | undefined): boolean =>
  char !== undefined && (IS_HAN.test(char) || SHARED_MARK.test(char))

/**
 * THE GAP TO ADD BETWEEN TWO PARTS THAT ALREADY CARRY THEIR OWN JOINS, such as the parts Intl writes a day in:
 * `gapBetween`'s answer where a Chinese character or a curly quotation mark meets the other side, and nothing
 * anywhere else. So "2026年10月" becomes "2026 年 10 月", and "Thu, 13 August" keeps its comma where Intl put it.
 */
export function gapWhereChineseMeets(before: string, after: string): '' | ' ' {
  return JOINS_THE_CHINESE_WAY(before.slice(-1)) || JOINS_THE_CHINESE_WAY(after.slice(0, 1)) ? gapBetween(before, after) : ''
}

/**
 * THE ONE PLACE A FILLED VALUE IS SPACED FROM WHAT IS AROUND IT: the parts of a line, text and values in order. At each
 * edge where a value meets the word's text, or meets another value written beside it, the join is `gapBetween`'s answer
 * when a Chinese character or a curly quotation mark stands on either side, and a single space typed there is replaced
 * by it. Every other join keeps what the word writes, so English reads as it is written. An empty value is passed
 * over, so the text on its two sides meet. Both readers of words with values come here: `wordWithSpacedValues`, and
 * the Chinese word reader `t` through `filledWithChineseSpacing` (wave 13q's round 30b; round 30 had a second copy of
 * the rule, which check wYVnljDG-XQ8 refused).
 */
export function spacedAtValues(parts: readonly ({ text: string } | { value: string })[]): string {
  // An empty value is passed over, and text that meets text is one text.
  const flat: ({ text: string } | { value: string })[] = []
  for (const part of parts) {
    if ('value' in part && part.value === '') continue
    const last = flat.at(-1)
    if ('text' in part && last !== undefined && 'text' in last) flat[flat.length - 1] = { text: last.text + part.text }
    else flat.push(part)
  }
  const join = (left: string | undefined, typed: string, right: string | undefined): string =>
    left === undefined || right === undefined || !(JOINS_THE_CHINESE_WAY(left) || JOINS_THE_CHINESE_WAY(right))
      ? typed
      : gapBetween(left, right)
  // A VALUE'S EDGE IS ITS FIRST OR LAST CHARACTER A PERSON SEES. Control and private-use characters are marks a page
  // puts in a value to find it again (WordsAroundAStamp's {when}, the lead pane's name marks), so they are read past;
  // a value made only of marks has no edge, and the word's own join is kept.
  const first = (value: string): string | undefined => value.replace(/[\p{Cc}\p{Co}]/gu, '')[0]
  const last = (value: string): string | undefined => value.replace(/[\p{Cc}\p{Co}]/gu, '').at(-1)
  let out = ''
  flat.forEach((part, at) => {
    const before = flat[at - 1]
    const after = flat[at + 1]
    if ('value' in part) {
      // TWO VALUES SIDE BY SIDE meet with nothing typed between them.
      if (before !== undefined && 'value' in before) out += join(last(before.value), '', first(part.value))
      out += part.value
      return
    }
    let text = part.text
    const L = before !== undefined && 'value' in before ? last(before.value) : undefined
    const R = after !== undefined && 'value' in after ? first(after.value) : undefined
    if (L !== undefined && R !== undefined && (text === '' || text === ' ')) {
      out += join(L, text, R)
      return
    }
    let lead = ''
    let trail = ''
    if (L !== undefined) {
      const typed = text.startsWith(' ') ? ' ' : ''
      text = text.slice(typed.length)
      lead = join(L, typed, text[0])
    }
    if (R !== undefined) {
      const typed = text.endsWith(' ') ? ' ' : ''
      text = text.slice(0, text.length - typed.length)
      trail = join(text.at(-1), typed, R)
    }
    out += lead + text + trail
  })
  return out
}

/** The marks taken out of a value, so a value handed on by `wordWithSpacedValues` is read as the value it is. */
const WITHOUT_MARKS = (value: string): string => value.replace(new RegExp(`[${VALUE_OPENS}${VALUE_CLOSES}]`, 'gu'), '')

/**
 * A WORD WITH ITS VALUES FILLED IN, EACH VALUE SPACED FROM THE TEXT AROUND IT BY `spacedAtValues`.
 *
 * A placeholder's spacing depends on the value that fills it: "由登记这个智能体的{who}选择" wants a
 * space around a Latin name ("的 Morgan Vale 选择") and none around a Chinese one ("的管理员选择"), and
 * "{card}角色卡做什么" wants one after a card named in Latin letters and none after 秘书. `say` is any reader of
 * words, `t` on a page; the values are marked while it reads, so the edges can be found in what it answers. The
 * Chinese reader spaces its values itself, by the same function, so its answer comes back with no marks in it and
 * is handed on as it is.
 */
export function wordWithSpacedValues<K extends string>(
  say: (key: K, values: Record<string, string>) => string,
  key: K,
  values: Readonly<Record<string, string>>,
): string {
  const marked = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, VALUE_OPENS + value + VALUE_CLOSES]))
  const text = say(key, marked)
  const parts: ({ text: string } | { value: string })[] = []
  let at = 0
  for (const found of text.matchAll(new RegExp(`${VALUE_OPENS}([^${VALUE_CLOSES}]*)${VALUE_CLOSES}`, 'gu'))) {
    parts.push({ text: WITHOUT_MARKS(text.slice(at, found.index)) }, { value: WITHOUT_MARKS(found[1]!) })
    at = found.index + found[0].length
  }
  parts.push({ text: WITHOUT_MARKS(text.slice(at)) })
  return spacedAtValues(parts)
}

/**
 * A CHINESE WORD WITH ITS VALUES FILLED IN, by `spacedAtValues`, the office's one rule: the Chinese word reader (`t` in
 * src/shared/i18n.ts) fills every value through this, so "无法联系{who}" reads "无法联系 the-narrow-read-agent" and
 * "无法联系秘书" without each page asking. A placeholder with no value is left as it is written.
 */
export function filledWithChineseSpacing(word: string, values: Readonly<Record<string, string | number>>): string {
  const parts: ({ text: string } | { value: string })[] = []
  let at = 0
  for (const found of word.matchAll(/\{(\w+)\}/gu)) {
    const name = found[1]!
    if (!Object.hasOwn(values, name)) continue
    parts.push({ text: word.slice(at, found.index) }, { value: WITHOUT_MARKS(String(values[name])) })
    at = found.index + found[0].length
  }
  parts.push({ text: word.slice(at) })
  return spacedAtValues(parts)
}
