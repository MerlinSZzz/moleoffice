// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE CHAPTER DOORS UNDER /api/office-regulations/chapters SEND AND ANSWER.
 *
 * The server's doors and the regulations page both read these shapes from here, so the two cannot
 * disagree about a field with nothing failing.
 *
 * THE OFFICE'S TWO LANGUAGES CHANGE TOGETHER, and the record door
 * already refuses a write that leaves a Chinese half beside English it was not written from. So the
 * person sends the Chinese with the English, and a part whose English changes needs its Chinese in the
 * same change. The door works out each half's `from` from the English beside it; nobody sends a hash.
 */

/** A rule's Chinese, as the person writes it. */
export interface ChapterRuleChinese {
  heading: string
  text: string
}

/**
 * One rule as the person edits it. `id` is `r-<n>`, and a rule the code names keeps its id.
 * `zh` is null when the rule holds no current Chinese: none was written, or it was written from
 * another English (then the rule is also named in `chineseWaiting`).
 */
export interface ChapterRuleContent {
  id: string
  heading: string
  text: string
  zh: ChapterRuleChinese | null
}

/** A chapter's own Chinese: its label, title and conclusion. */
export interface ChapterChinese {
  label: string
  title: string
  conclusion: string
}

/** One chapter as the person edits it. `zh` is null on the same terms as a rule's. */
export interface ChapterContent {
  label: string
  title: string
  conclusion: string
  zh: ChapterChinese | null
  rules: ChapterRuleContent[]
}

/**
 * WHICH CONTENT THE OFFICE USES FOR ONE CHAPTER NUMBER.
 * `stored`: exactly one live record holds the number, and it passes the check.
 * `shipped`: a live record holds it but fails the check, or two do; the shipped chapter is read, and `notUsed` names them.
 * `none`: no live record holds the number, and the office holds no such chapter.
 */
export type ChapterInUse = 'stored' | 'shipped' | 'none'

export interface SelectedChapter {
  n: number
  inUse: ChapterInUse
  /** The record Apply and Restore write to. Null when no live record holds the number. */
  record: string | null
  /** What Apply and Restore must send back. Null when no live record holds the number. */
  version: string | null
  /**
   * The newest revision of the record whose content is in use, which the regulations page shows beside the chapter. Null
   * when that content is the shipped text (`inUse` is `shipped`), when no record holds the number, and when the record
   * keeps no revision at all.
   */
  revision: number | null
  /** The content in use. Null when `inUse` is `none`. */
  chapter: ChapterContent | null
  /** The role the chapter in use is for, from its record's `extra.forRole`. Absent on a shared chapter. A run leaves a marked chapter out of its standing load. */
  forRole?: string
  /** The stored record's content, also when it is not used. Null when none is held. */
  stored: ChapterContent | null
  /** The content the shipped file holds for this number. Null when it holds none: a role chapter under a number the shipped file lacks. */
  shipped: ChapterContent | null
  /** The stored records this release does not use for the number, and why. */
  notUsed: null | { records: string[]; problems: string[] }
  /** Ids of the rules whose Chinese was written from another English, and `chapter` when the chapter's own Chinese was. */
  chineseWaiting: string[]
}

/** GET /api/office-regulations/chapters */
export interface TheSelectedChapters {
  chapters: SelectedChapter[]
  /** Live records this release does not use: a stored chapter under a number the shipped file lacks without a role mark, one whose mark names no role card, more than one record on one number, and one that fails the chapter check. Null when every live chapter is used. */
  unsupported: { records: string[]; problems: string[] } | null
  says: string
  /** Selected records for export, built with the content in use. Refused records and absent chapters are excluded. Shipped records carry neutral English and no Chinese. */
  records?: import('./office-rules.ts').ARecordAsRead[]
}

/** A preview with from checks the content Restore would write, under Restore's checks. */
export type AChapterPreviewRequest = { n: number; chapter: ChapterContent; keep?: string } | { n: number; from: 'shipped' | number; keep?: string }

/** A missing source is unknown, not zero bytes. The writer still requires that source at a run start. */
export type ChapterRulesFileSize = { bytes: number; most: number } | { notMeasured: string }

/** POST /api/office-regulations/chapters/preview. It writes nothing and lists problems instead of refusing. */
export interface AChapterPreview {
  problems: string[]
  /** The label, title and conclusion before and after, when the edit changes any of them in either language. */
  ownWords: null | { was: Omit<ChapterContent, 'rules'>; becomes: Omit<ChapterContent, 'rules'> }
  changes: {
    rule: string
    was: { heading: string; text: string; zh: ChapterRuleChinese | null } | null
    becomes: { heading: string; text: string; zh: ChapterRuleChinese | null } | null
  }[]
  rulesFile: ChapterRulesFileSize
}

/** POST /api/office-regulations/chapters and POST /api/office-regulations/chapters/restore answer this. */
export type AChapterWritten = SelectedChapter & { written: boolean;
  /** Chinese halves dropped by Restore: rule ids, or chapter for the chapter itself. Apply always answers an empty list. */
  chineseDropped: string[]
}

/** GET /api/office-regulations/chapters/:n/history?offset= */
export interface AChaptersHistory {
  /** The record whose revisions are shown. keep chooses the write target, never the history source. */
  record: string | null
  versions: {
    seq: number
    at: string
    by: { type: string; id: string }
    because: string
    before: ChapterContent | null
    after: ChapterContent
  }[]
  next: number | null
}
