// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS A CHINESE READER SEES IN THE RIGHT-CLICK BOX AND ON THE FILE PAGE HAVE CHINESE, AND SO DO THE WORDS THAT
 * WAITED FOR CHINESE SINCE 16 NOVEMBER (wave 13y round 175, the translation round).
 *
 * A page in Chinese draws a key that has no Chinese in its English. So a Chinese reader who right-clicks a few words
 * met a box half in English: Copy, Contact, Note, the notes list and the contacts' reasons. This file reads the joined
 * lists the pages read, with no browser and no office, and asks for each key whether the Chinese list holds it.
 * `createI18n('zh').t` would answer the English for a key with no Chinese, so each case reads `WORD_LISTS.zh` itself.
 *
 *   1. Every `talk.` key has Chinese, and so does every other key the box reads. Each of those keys is named with the
 *      file it is read in, and the case checks that the file still writes it, so a list that no longer says where a key
 *      is read fails instead of passing on keys the box stopped reading. TalkBox.tsx and context.ts are the box's own
 *      files and are named whole. The other files are named for the parts the box draws from them: the press Btn
 *      draws when it is off with no reason (ui.tsx), the list of agents to follow (FollowFromHere in Leading.tsx, and
 *      its sentence in messages.ts), and the press that starts a new agent (StartANewAgent.tsx). Four families of keys
 *      the box makes from a template are named by their start, and every key that starts so must have Chinese.
 *      Left out: the refusal sentence a press draws for a coded refusal of the office (`server.` and the code, in
 *      ui.tsx), because every press on every page draws it. Those refusals are not the box's words.
 *   2. The four words of the file page have Chinese: what the page says when it does not draw a file as its words,
 *      what it says when the file door answered with something else, the page's name, and how the box names a file.
 *   3. Every key the three lists of waiting words name, and that has English today, has Chinese. A key a list names
 *      that was taken out of the English since is named below with the change that took it out, and the case checks
 *      that it has no English, so a key that comes back is asked for its Chinese again.
 *
 * Before the round's Chinese is written, cases 1, 2 and 3 fail: 27 `talk.` keys and 9 other keys the box reads, the
 * four file-page keys and 109 keys of the lists have English and no Chinese.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WORD_LISTS } from '../src/shared/i18n.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const EN = WORD_LISTS.en as Readonly<Record<string, unknown>>
const ZH = WORD_LISTS.zh as Readonly<Record<string, unknown>>

/** The keys among these that have English and no Chinese. */
function withNoChinese(keys: readonly string[]): string[] {
  return keys.filter((key) => EN[key] !== undefined && ZH[key] === undefined)
}

/** The keys among these that have no English at all. */
function withNoEnglish(keys: readonly string[]): string[] {
  return keys.filter((key) => EN[key] === undefined)
}

/** Whether a file of the repository writes this key, in any of the three quotes. */
function writes(file: string, key: string): boolean {
  const text = readFileSync(`${REPO}${file}`, 'utf8')
  return ["'", '"', '`'].some((quote) => text.includes(`${quote}${key}${quote}`))
}

/** THE KEYS THE BOX READS, other than the `talk.` keys, by the file each is read in. */
const THE_BOX_READS: readonly { file: string; keys: readonly string[] }[] = [
  {
    file: 'src/web/components/agent/TalkBox.tsx',
    keys: [
      'agentWords.twoSentences', 'chat.contact.filterLabel', 'chat.contact.filterPlaceholder',
      'chatEnglish.list.between', 'chatEnglish.list.two', 'chatEnglish.partCovers.allGone.many',
      'chatEnglish.partCovers.allGone.one', 'chatEnglish.partCovers.nothing', 'chatEnglish.partCovers.someGone.many',
      'chatEnglish.partCovers.someGone.one', 'chatEnglish.standsFor.allGone.many', 'chatEnglish.standsFor.allGone.one',
      'chatEnglish.standsFor.parts', 'chatEnglish.standsFor.someGone.many', 'chatEnglish.standsFor.someGone.one',
      'chatEnglish.standsFor.whole', 'chatEnglish.wrote.at', 'chatEnglish.wrote.by',
      'chatEnglish.wrote.byAndAt', 'chatPoint.partOfAMessage', 'chatPoint.wordsOfAFile',
      'chatPoint.wordsOfAFilePage', 'chatTriage.theWholeRecord', 'quickNote.untitled',
      'quickNote.untitledInSentence', 'r20recipient.rankingFailed', 'sheet.button.waitsForTheLastAnswer',
    ],
  },
  {
    file: 'src/web/components/agent/context.ts',
    keys: [
      'agentWords.intent.ask', 'agentWords.intent.ask.what', 'agentWords.intent.change',
      'agentWords.intent.change.what', 'agentWords.intent.discuss', 'agentWords.intent.discuss.what',
      'agentWords.intent.review', 'agentWords.intent.review.what', 'agentWords.intent.start',
      'agentWords.intent.start.what', 'chatEnglish.part.inside', 'chatEnglish.part.nth.nd',
      'chatEnglish.part.nth.rd', 'chatEnglish.part.nth.st', 'chatEnglish.part.nth.th',
      'chatEnglish.part.withWords', 'pointWord.partOfARecord', 'pointWords.linksReadAs',
      'pointWords.partOfTheReport', 'pointWords.section', 'review.pane.place.body',
      'review.pane.place.part', 'review.pane.place.whole',
    ],
  },
  { file: 'src/web/components/ui.tsx', keys: ['sheet.button.offWithNoReason'] },
  { file: 'src/web/components/Leading.tsx', keys: ['messagePages.moreAgents'] },
  { file: 'src/shared/messages.ts', keys: ['chatEnglish.lead.followWith'] },
  {
    file: 'src/web/components/StartANewAgent.tsx',
    keys: ['newAgentKeys.checking', 'newAgentKeys.held', 'newAgentKeys.madeAs', 'newAgentKeys.nothingToCarry', 'newAgentKeys.readingFailed', 'newAgentKeys.whyHeld'],
  },
]

/** THE KEYS THE BOX MAKES FROM A TEMPLATE, by the start the template writes and the file that writes it. */
const THE_BOX_MAKES: readonly { file: string; start: string }[] = [
  { file: 'src/web/components/agent/TalkBox.tsx', start: 'pointWords.length.' },
  { file: 'src/web/components/agent/context.ts', start: 'pointWord.role.' },
  { file: 'src/web/components/agent/context.ts', start: 'review.pane.subject.' },
  { file: 'src/web/components/agent/context.ts', start: 'settingsPanel.detail.phrase.' },
]

/** THE FOUR WORDS OF THE FILE PAGE. */
const THE_FILE_PAGE = ['sb.file.notShownAsWords', 'chatPoint.wordsOfAFile', 'sb.file.answerNotWords', 'filePage.title'] as const

// THE THREE LISTS OF WAITING WORDS, key by key, as they name them.
/** The list of 16 November, from line 13y. */
const THE_LIST_OF_16_NOVEMBER = [
  'server.queuedAgentIds', 'newAgentKeys.waitingHeading', 'newAgentKeys.waitingCount',
  'newAgentKeys.checking', 'newAgentKeys.nothingToCarry', 'chat.notDelivered',
  'quickNote.resizeBox', 'quickNote.zoomOut', 'quickNote.resetZoom',
  'quickNote.zoomIn', 'quickNote.moveSheet', 'messagePages.moreOffers',
  'messagePages.moreAgents', 'messagePages.olderMessages', 'record.field.quotePositions',
  'agent.quote.from', 'agent.quote.fromField', 'agent.quote.empty',
  'agent.quote.end', 'server.messageQuotePositionsInvalid', 'server.quotePositions.needsQuotes',
  'server.quotePositions.withTarget', 'server.quotePositions.list', 'server.quotePositions.count',
  'server.quotePositions.range', 'server.quotePositions.order', 'server.quotePositions.character',
  'record.section.label',
] as const
/** The list of 18 November: what round 169 added, the one key whose English it changed, and what it took out. */
const ROUND_169_ADDED = [
  'delegation.inspection.setting', 'delegation.inspection.settingSays', 'delegation.inspection.on',
  'delegation.inspection.off', 'delegation.inspection.points', 'delegation.inspection.notLookedAt',
  'delegation.inspection.rulesKept', 'delegation.inspection.rulesNotKept', 'delegation.inspection.outcome.done',
  'delegation.inspection.outcome.part', 'delegation.inspection.outcome.not', 'delegation.inspection.workspaceDoor',
  'delegation.inspection.unreadablePoints', 'delegation.inspection.sentence.done', 'delegation.inspection.sentence.off_target',
  'delegation.inspection.sentence.narrower', 'delegation.inspection.sentence.more_than_asked', 'delegation.inspection.sentence.unfinished',
  'delegation.inspection.judged.done', 'delegation.inspection.judged.off_target', 'delegation.inspection.judged.narrower',
  'delegation.inspection.judged.more_than_asked', 'delegation.inspection.judged.unfinished', 'delegation.inspection.judged.part',
  'delegation.inspection.judged.not', 'delegation.inspection.claimsCannotHold', 'delegation.inspection.verdictClaimsCannotHold',
  'module.requirementsPart', 'server.moduleRequirementsDoor', 'server.carryableAgentIds',
  'agentTags.noProjects', 'agentTags.heading', 'agentTags.change',
  'agentTags.loading', 'agentTags.name', 'agentTags.colour',
  'agentTags.create', 'agentTags.nameRequired', 'agentTags.colourRefused',
  'server.agentTagsUnreadable', 'server.agentTagsNeedPerson', 'server.agentTagsNeedList',
  'server.agentTagsBadTag', 'server.agentTagsBadName', 'server.agentTagsDuplicateName',
  'server.agentTagsBadColour', 'server.agentTagsUnknownAgent', 'chat.moreAgentConversations',
  'server.agentConversationsCursorInvalid', 'server.agentConversationsCursorProject', 'server.agentConversationsAllProjects',
  'chat.layout.single', 'chat.layout.sideBySide', 'quickNotes.popOut',
  'quickNote.returnFailed', 'talk.sendTo', 'talk.sendTo.contact',
  'talk.sendTo.note', 'talk.note.new', 'talk.notes',
  'talk.note.left', 'talk.note.choose', 'talk.note.chooseFirst',
  'talk.note.lastNotRead', 'talk.notes.notRead', 'talk.note.nothingAdded',
  'talk.contacts.submittedThisRecord', 'talk.contacts.thisProjectsSecretary', 'talk.contacts.secretariesNotRead',
] as const
const ROUND_169_CHANGED = ['quickNotes.windowWasBlocked'] as const
const ROUND_169_TOOK_OUT = [
  'newAgentKeys.waitingHeading', 'newAgentKeys.waitingCount', 'chat.attachment.anyFile',
  'talk.newQuickNote', 'quickNotes.close', 'talk.addToNote',
  'talk.addToANewNote', 'talk.addToNote.into', 'talk.addToNote.noNote',
  'talk.addToNote.notRead', 'talk.addToNote.failed',
] as const
/** The list of 18 November, round 170. */
const ROUND_170_ADDED = [
  'sendPlan.line.agentInAnotherProject', 'sendPlan.line.runInAnotherProject', 'sb.file.show',
  'sb.file.frame', 'sb.file.tooLargeToShow', 'sb.word.notAWord',
  'sb.word.multiDisk', 'sb.word.zip64', 'sb.word.tooManyParts',
  'sb.word.encrypted', 'sb.word.unfitPart', 'sb.word.tooMuchText',
  'sb.word.definitionRefused', 'sb.word.picturesLeftOut', 'sb.word.nothingToShow',
  'sb.word.notText',
] as const
/** The list of 18 November, round 171. */
const ROUND_171_ADDED = ['frameFiles.reread.anotherProject', 'frameFiles.reread.anotherProjectKept'] as const

/** THE KEYS THE LISTS NAME THAT HAVE NO ENGLISH TODAY, each with the change that took it out of the English. */
const TAKEN_OUT_SINCE: Readonly<Record<string, string>> = {
  ...Object.fromEntries(ROUND_169_TOOK_OUT.map((key) => [key, 'round 169 took it out, as its list says'])),
  'delegation.inspection.settingSays': 'taken out on 20 November, when the review level panel came to draw the levels by name',
  'delegation.inspection.notLookedAt': "taken out on 20 November, when a package's panels came to draw state words and not sentences",
  'frameFiles.reread.anotherProjectKept': 'taken out on 20 November, when the strip after a project switch came to name the project and stop',
  'quickNotes.windowWasBlocked': 'taken out on 20 November, when the quick note came to name where it is kept only once it is kept',
}

describe('the words a Chinese reader sees have Chinese', () => {
  it('has Chinese for every talk. key, and for every other key the box reads, each named with its file', () => {
    const talk = Object.keys(EN).filter((key) => key.startsWith('talk.'))
    expect(talk.length, 'the English list holds the talk. keys').toBeGreaterThan(0)
    expect(withNoChinese(talk), 'talk. keys with no Chinese').toEqual([])
    for (const { file, keys } of THE_BOX_READS) {
      expect(keys.filter((key) => !writes(file, key)), `keys ${file} no longer writes`).toEqual([])
      expect(withNoEnglish(keys), `keys read in ${file} with no English`).toEqual([])
      expect(withNoChinese(keys), `keys read in ${file} with no Chinese`).toEqual([])
    }
    for (const { file, start } of THE_BOX_MAKES) {
      expect(readFileSync(`${REPO}${file}`, 'utf8'), `${file} makes keys that start ${start}`).toContain(start + '${')
      const made = Object.keys(EN).filter((key) => key.startsWith(start))
      expect(made.length, `the English list holds keys that start ${start}`).toBeGreaterThan(0)
      expect(withNoChinese(made), `keys that start ${start}, made in ${file}, with no Chinese`).toEqual([])
    }
  })

  it('has Chinese for the four words of the file page', () => {
    expect(withNoEnglish(THE_FILE_PAGE), 'file-page keys with no English').toEqual([])
    expect(withNoChinese(THE_FILE_PAGE), 'file-page keys with no Chinese').toEqual([])
  })

  it('has Chinese for every key the three lists of waiting words name that has English, and no English for the keys taken out', () => {
    const named: string[] = [
      ...new Set<string>([...THE_LIST_OF_16_NOVEMBER, ...ROUND_169_ADDED, ...ROUND_169_CHANGED, ...ROUND_169_TOOK_OUT, ...ROUND_170_ADDED, ...ROUND_171_ADDED]),
    ]
    const kept = named.filter((key) => TAKEN_OUT_SINCE[key] === undefined)
    expect(withNoEnglish(kept), 'keys the lists name, not named as taken out, with no English').toEqual([])
    expect(withNoChinese(kept), 'keys the lists name with English and no Chinese').toEqual([])
    const out = Object.keys(TAKEN_OUT_SINCE)
    expect(out.filter((key) => !named.includes(key)), 'keys named as taken out that no list names').toEqual([])
    expect(out.filter((key) => EN[key] !== undefined), 'keys named as taken out that have English again').toEqual([])
  })
})
