// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { SETTING_WORDS, NOTICE_WORDS } from '../../config/word-sources.mjs'
import { SURFACES } from '../surfaces.ts'

// The English list's place for wave 14d's new words, in English only (the owner's decision that new words come in English first). Their Chinese is written in
// the translation round before a version, and until then a Chinese page shows the English. joined.ts reads this file.
export const enWave14d = {
  // A SECRETARY'S OWN BROADCASTS. The profile page draws broadcastLines (src/shared/broadcast.ts), and when a secretary
  // has turned its broadcasts off it draws this sentence instead of a next time that will not come.
  'broadcast.says.off': 'Broadcasts are turned off for this secretary. The office sends it no reminder and does not pause it. Its times are kept for when broadcasts are turned on again.',

  // A STEP'S REMINDER BY TOKENS OR BY TIME.
  'settingsWords.MOLE_OFFICE_STEP_REMINDER_TOKENS': SETTING_WORDS.MOLE_OFFICE_STEP_REMINDER_TOKENS,
  'settingsWords.MOLE_OFFICE_STEP_REMINDER_MINUTES': SETTING_WORDS.MOLE_OFFICE_STEP_REMINDER_MINUTES,
  'gates.row.step-reminder-tokens': "How many tokens a run may spend in one step of its flow before the office reminds it of its role, its duties and its current step. The reminder comes at this many tokens or at the minutes in the row for minutes, whichever comes first, and again each time as many more have passed. A run whose runtime gives no count is reminded by time only.",
  'gates.row.step-reminder-minutes': "How many minutes a run may spend in one step of its flow before the office reminds it of its role, its duties and its current step. The reminder comes at this many minutes or at the tokens in the row for tokens, whichever comes first, and again each time as many more have passed.",
  'gates.count.step-reminder-tokens': { one: "Reminded a run of its step when its tokens reached the setting {n} time.", other: "Reminded a run of its step when its tokens reached the setting {n} times." },
  'gates.count.step-reminder-minutes': { one: "Reminded a run of its step when its minutes reached the setting {n} time.", other: "Reminded a run of its step when its minutes reached the setting {n} times." },
  'noticeWords.aStepReminder': NOTICE_WORDS.aStepReminder,
  'record.section.tokensSoFar': 'Tokens so far',
  'record.section.whenTheTokensWereRead': 'When the tokens were read',
  'record.section.howTheTokensWereReadAndCounted': 'How the tokens were read and counted',

  // A RETIRED LOOK, SAID AS IT IS NOW. Coffee, Futuristic, Monochrome and Muted are gone, and a person who saved one is
  // told which look the page is drawn in instead. The older sentence told them to choose Light, Dark or Auto, and there
  // are more looks than those three to choose from now. High contrast is not retired: it is one of the six themes.
  'settingsPanel.look.retiredNow': 'You had chosen {label}, which Mole Office no longer has. The page is drawn in {replacement} until you choose another look.',

  // THE LOOK KEPT IN THE OFFICE (src/web/components/PresetBar.tsx). The office's own sentences are put into these as
  // they are, so each ends in its own full stop.
  'settingsPanel.look.officeDidNotKeep': 'The office did not keep this theme choice: {reason} This page is drawn in it until you reload.',
  'settingsPanel.look.unreadable': 'This version of Mole Office cannot read the look the office keeps for you: {why} The page is drawn in Auto, and nothing is written over what the office keeps. Under Themes you can start again from the look showing now.',
  'settingsPanel.look.ownWaiting': 'One of your own themes, still being read from the office',
  'settingsPanel.look.ownNotHere': 'This browser last showed one of your own themes, and the office does not give your own themes to this page. The page is drawn in Auto until you choose another look.',

  // THE THEMES PANEL (src/web/components/OwnThemesPanel.tsx): the three looks, the six themes and the person's own, the
  // copy, the preview, the readability check and the five groups a theme is changed in.
  get 'settingsPanel.title.ownthemes'(): string { return SURFACES['settings.ownthemes'] },
  'settingsPanel.ownThemes.looks': 'Looks the page draws itself',
  'settingsPanel.ownThemes.shipped': 'Themes Mole Office ships',
  'settingsPanel.ownThemes.own': 'Your own themes',
  'settingsPanel.ownThemes.inUse': 'In use',
  'settingsPanel.ownThemes.use': 'Use',
  'settingsPanel.ownThemes.copy': 'New from a copy',
  'settingsPanel.ownThemes.change': 'Change',
  'settingsPanel.ownThemes.copyName': 'Copy of {name}',
  'settingsPanel.ownThemes.copied': 'Made {name}, a copy of {from}. Change it below. The page keeps the theme in use until you choose this one.',
  'settingsPanel.ownThemes.noneYet': 'You have not made a theme of your own yet. Press New from a copy beside a theme to make one.',
  'settingsPanel.ownThemes.howMany': { one: 'You keep {n} theme of your own, and you may keep {most}.', other: 'You keep {n} themes of your own, and you may keep {most}.' },
  'settingsPanel.ownThemes.looksAreNotCopied': 'Auto, Light and Dark are drawn by the page itself and not from a theme, so they cannot be copied. Copy one of the themes below them instead.',
  'settingsPanel.ownThemes.shippedIsCopyOnly': 'A theme Mole Office ships cannot be changed. Make a copy of it and change the copy.',
  'settingsPanel.ownThemes.changing': 'Changing {name}',
  'settingsPanel.ownThemes.name': 'Name',
  'settingsPanel.ownThemes.rename': 'Rename',
  'settingsPanel.ownThemes.renamed': 'Renamed it {name}.',
  'settingsPanel.ownThemes.delete': 'Delete',
  'settingsPanel.ownThemes.deleteSure': 'Delete {name}? It cannot be brought back.',
  'settingsPanel.ownThemes.deleteYes': 'Delete it',
  'settingsPanel.ownThemes.deleteNo': 'Keep it',
  'settingsPanel.ownThemes.deleted': 'Deleted {name}.',
  'settingsPanel.ownThemes.deletedInUse': 'Deleted {name}. It was the theme in use, so the page is drawn in {from} now, the theme it was copied from.',
  'settingsPanel.ownThemes.save': 'Save the changes',
  'settingsPanel.ownThemes.undo': 'Undo the changes',
  'settingsPanel.ownThemes.saved': 'Saved {name}.',
  'settingsPanel.ownThemes.notSaved': { one: '{n} change is not saved yet.', other: '{n} changes are not saved yet.' },
  'settingsPanel.ownThemes.refused': 'The office did not keep it: {reason}',
  'settingsPanel.ownThemes.preview': 'Preview',
  'settingsPanel.ownThemes.previewSays': 'Drawn with the changes, before they are saved.',
  'settingsPanel.ownThemes.previewHeading': 'A panel heading',
  'settingsPanel.ownThemes.previewBody': 'Body text on a panel. Most of a page is written in this.',
  'settingsPanel.ownThemes.previewQuiet': 'Quieter text, for what matters less.',
  'settingsPanel.ownThemes.previewLink': 'A link',
  'settingsPanel.ownThemes.previewButton': 'A button',
  'settingsPanel.ownThemes.previewChosen': 'A chosen item',
  // Two letters drawn in a theme's colours, on a row of the list and beside a pair in the check.
  'settingsPanel.ownThemes.sample': 'Aa',
  'settingsPanel.ownThemes.check': 'Readability check',
  'settingsPanel.ownThemes.checkPasses': 'Every pair can be read: {all} of {all}.',
  'settingsPanel.ownThemes.checkFails': '{failing} of {all} pairs are too faint to read. The theme cannot be saved until each of them can be read.',
  'settingsPanel.ownThemes.pair': '{what} on {on}',
  'settingsPanel.ownThemes.ratio': '{ratio} to 1. The floor is {floor} to 1.',
  // HOW TO FIX A FAINT PAIR: the way its colour {fg} alone can move, then the way its ground {bg} alone can move, or none
  // when that one alone cannot make the pair readable (howToFixIt in src/shared/readability.ts chooses).
  'settingsPanel.ownThemes.fix.lighter-darker': 'Make {fg} lighter, or make {bg} darker.',
  'settingsPanel.ownThemes.fix.darker-lighter': 'Make {fg} darker, or make {bg} lighter.',
  'settingsPanel.ownThemes.fix.lighter-lighter': 'Make {fg} lighter, or make {bg} lighter.',
  'settingsPanel.ownThemes.fix.darker-darker': 'Make {fg} darker, or make {bg} darker.',
  'settingsPanel.ownThemes.fix.lighter-none': 'Make {fg} lighter. No change to {bg} alone makes this readable.',
  'settingsPanel.ownThemes.fix.darker-none': 'Make {fg} darker. No change to {bg} alone makes this readable.',
  'settingsPanel.ownThemes.fix.none-lighter': 'Make {bg} lighter. No change to {fg} alone makes this readable.',
  'settingsPanel.ownThemes.fix.none-darker': 'Make {bg} darker. No change to {fg} alone makes this readable.',
  'settingsPanel.ownThemes.fix.none-none': 'No change to {fg} alone or to {bg} alone makes this readable. Make one of them lighter and the other darker.',
  'settingsPanel.ownThemes.cannotMeasure': 'The check cannot measure this theme: {reason}',
  'settingsPanel.ownThemes.passingPairs': 'The pairs that can be read',
  'settingsPanel.ownThemes.group.colour': 'Colour',
  'settingsPanel.ownThemes.group.type': 'Type',
  'settingsPanel.ownThemes.group.shape': 'Shape',
  'settingsPanel.ownThemes.group.modules': 'Modules',
  'settingsPanel.ownThemes.group.controls': 'Controls',
  'settingsPanel.ownThemes.groupSays.colour': 'Grounds, text, the accent, borders and the status colours.',
  'settingsPanel.ownThemes.groupSays.type': 'Faces, weights and sizes.',
  'settingsPanel.ownThemes.groupSays.shape': 'Corners, borders, dividers, shadows and density.',
  'settingsPanel.ownThemes.groupSays.modules': "A module's frame, its heading and how a count is drawn.",
  'settingsPanel.ownThemes.groupSays.controls': 'Buttons, the round button and a chosen item.',
  'settingsPanel.ownThemes.valueOf': 'The value of {name}',
  'settingsPanel.ownThemes.colourOf': 'The colour of {name}',
  'settingsPanel.ownThemes.startAgain': 'Start again from the look showing now',
  'settingsPanel.ownThemes.startAgainSays': 'The office keeps a look this version cannot read. Starting again writes the look showing now over it, and the themes in it are gone.',
  'settingsPanel.ownThemes.elsewhere': 'Your own themes are kept in the office, and this page cannot reach them: {because}',
  'settingsPanel.ownThemes.loading': 'Reading your themes from the office.',

  // THE FLAGS PANEL (src/web/components/ChatLabelsPanel.tsx) AND THE FLAG'S MENU. One list holds the two flags the office
  // ships, the person's own and the menu's 'No mark' entry. A thing left empty is put back to its default.
  'settingsPanel.title.chatflags': 'Your flags',
  'settingsPanel.chatFlags.what': 'A flag tells an agent what the message carrying it asks. Each has a name, a description you see in the menu, an instruction the agent is given with the message, a short word beside the flag left of Send, and two colours: the flag\'s own and the words it marks. The two flags Mole Office ships keep their defaults unless you change them, and so does the menu\'s "No mark" entry.',
  'settingsPanel.chatFlags.shipped': 'The flags Mole Office ships',
  'settingsPanel.chatFlags.own': 'Your own flags',
  'settingsPanel.chatFlags.shippedFlag': 'Shipped flag',
  'settingsPanel.chatFlags.ownFlag': 'Your flag',
  'settingsPanel.chatFlags.noMark': 'No mark',
  'settingsPanel.chatFlags.name': 'Name',
  'settingsPanel.chatFlags.description': 'Description (shown in the menu)',
  'settingsPanel.chatFlags.instruction': 'Instruction for the agent',
  'settingsPanel.chatFlags.shortWord': 'Short word beside the flag',
  'settingsPanel.chatFlags.colour': 'Flag colour',
  'settingsPanel.chatFlags.wordsColour': 'Colour of the words it marks',
  'settingsPanel.chatFlags.reset': 'Put this flag back to the office\'s default',
  'settingsPanel.chatFlags.resetNoMark': 'Put the name back',
  'settingsPanel.chatFlags.saved': 'Saved {name}.',
  'settingsPanel.chatFlags.resetDone': 'Put {name} back to the office\'s default.',
  'settingsPanel.chatLabels.savedName': 'Saved the name {word}.',

  // A MESSAGE WITH MARKED PARTS, as every hand-over prints them (DELIVERY_ENVELOPE in src/shared/messages.ts). The
  // person marked a run of the words with a flag, and the rest of the words carry none.
  'chat.markedPart': 'MARKED PART: "{quote}" is marked "{name}".',
  'chat.markedPartAsks': 'MARKED PART: "{quote}" is marked "{name}": {instruction}',
  'chat.wordsWithNoFlag': 'THE WORDS NOT IN A MARKED PART: {quotes} carry no flag ({noMark}).',

  // MARKED WORDS IN THE WRITING BOX AND THE BUBBLE (DB-2). The bubble's foot says how many parts the message has; the
  // box says why a part went when typing touches its words, or when a whole-message flag takes the parts' place.
  'chat.markedPartsCount': { one: '1 marked part', other: '{n} marked parts' },
  'chat.partDroppedMoved': 'The mark "{name}" on "{quote}" was dropped: those words are still in the message, in another place.',
  'chat.partDroppedGone': 'The mark "{name}" on "{quote}" was dropped: those words are no longer in the message.',
  'chat.marksTakenOff': 'The whole message now carries "{name}", so the marks on its words were taken off.',
  'chat.marksNotKeptWithTheDraft': 'This browser could not keep the marks on your words with the draft: {reason} The words are kept.',
} as const
