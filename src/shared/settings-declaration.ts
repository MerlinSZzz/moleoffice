// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { LANGUAGES, type Language, type WordKey } from './i18n.ts'
import type { SurfaceId } from './surfaces.ts'
import { DEFAULT_UPLOAD_POLICY } from './storage/destinations.ts'
import { SHORTCUT_SETTING_WORDS } from './shortcut-setting-words.ts'
import { PRESET_WORDS } from './preset-choice-words.ts'
import { THEMES, themeName } from './themes.ts'
import { CIRCLE_PICTURES } from './circle-pictures.ts'
import { DETAIL_ROWS, RUNGS, FLOORED_KIND, readerFloorApplies, isReaderRung } from './detail.ts'
import { DETAIL_ROW_WORDS, DETAIL_LEVEL_WORDS, DETAIL_PHRASE_WORDS } from './detail-setting-words.ts'
import { LABEL_COLOURS, type LabelColour } from './message-label.ts'

export const CATEGORIES = ['you', 'looks', 'chat', 'keys', 'work', 'tools', 'kept', 'devRuns', 'devMachines'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_TITLES: Readonly<Record<Category, WordKey>> = {
  you: 'settingsCats.cat.you', looks: 'settingsCats.cat.looks', chat: 'settingsCats.cat.chat', keys: 'settingsCats.cat.keys',
  work: 'settingsCats.cat.work', tools: 'settingsCats.cat.tools', kept: 'settingsCats.cat.kept',
  devRuns: 'settingsCats.cat.devRuns', devMachines: 'settingsCats.cat.devMachines',
}
export const UNDER_THE_DEVELOPER_HEADING: Readonly<Partial<Record<Category, WordKey>>> = { devRuns: 'settingsCats.list.devRuns', devMachines: 'settingsCats.list.devMachines' }

/** `literal` is a name that is the same in every language; `literalIn` is a name the data gives in each language, such as a theme's. */
export type SettingsControl = { key: string; wordKey: WordKey; whoMayPress: string; literal?: string; literalIn?: (language: Language) => string; values?: Readonly<Record<string, WordKey>> }
export type SettingsPanelDeclaration = { key: Extract<SurfaceId, `settings.${string}`>; body?: Extract<SurfaceId, `settings.${string}`>; category: Category; title: WordKey; developerOnly: boolean; windowOnly: boolean; controls: readonly SettingsControl[] }

const controls = (whoMayPress: string, ...keys: WordKey[]): SettingsControl[] => keys.map((wordKey) => ({ key: wordKey, wordKey, whoMayPress }))
const person = 'The person whose own setting this is.'
const grant = 'The person, or a secretary where the person’s grant permits this action.'
const browser = 'Anyone using this browser.'
const key = 'The person may act without a reason; a secretary with its own key needs a reason. If the relevant gate is off, an agent with its own key may also act with a reason.'
const key_and_reason = 'The person or a secretary with its own key, with a reason; if the relevant gate is off, an agent with its own key may also act with a reason.'
const settings_door = 'The person or a secretary with its own key. A person-decided value also needs the person’s exact words or a grant that permits that change.'
const exact = 'The person or a secretary with its own key and the person’s exact words for this change.'
const registered = 'Any registered caller.'
const local = 'A caller on this computer; the door records the caller.'
const raised = 'The person or a raised secretary; if the relevant gate is off, a keyed agent may also act.'
const read = 'Anyone who can read this page.'
const owner_only = 'The person only.'
const threshold = 'The person, or a secretary with its own key and exact words or where the grant permits; a raise alone does not suffice.'
const usage_secretary = 'The person or a secretary with its own key and a reason.'
const warrant_or_raise = 'The person, or a secretary acting on the person’s words or a raise.'
const map_motion = 'The person, or a secretary the person has authorized for the time being.'
const grant_or_key = 'The person, or a secretary where the person’s grant permits it; if the relevant gate is off, an agent with its own key may also act.'
const owner_or_secretary = 'The person or a secretary with its own key; this action is local to the computer.'
const holder_read = 'The person, a secretary with its own key on this computer, or a secretary under the person’s grant.'
const restart_office = 'The person, or the exact agent with a live restart grant and its own key.'
const pause_office = 'The person, an agent with a live restart grant and its own key, or a secretary where the person’s grant permits; if the pause gate is off, an agent with its own key may also act.'
const repoint = 'A caller on this computer; if the repository has been scanned, its re-pointing door additionally checks the person’s authority.'
const namedControl = (key: string, wordKey: WordKey, whoMayPress: string): SettingsControl => ({ key, wordKey, whoMayPress })
const detailOptions: SettingsControl[] = DETAIL_ROWS.flatMap((row) => RUNGS.map((rung) => ({
  key: `detail.${row}.${rung}`, wordKey: 'settingsPanel.detail.cellName' as const,
  values: { row: DETAIL_ROW_WORDS[row], level: DETAIL_LEVEL_WORDS[rung], phrase: DETAIL_PHRASE_WORDS[rung] },
  whoMayPress: row !== 'everywhere' && readerFloorApplies(row, FLOORED_KIND) && !isReaderRung(rung) ? 'Nobody: this choice is unavailable for reports.' : browser,
})))
const languageOptions = Object.entries(LANGUAGES).map(([language, literal]) => ({ key: `language.${language}`, wordKey: 'settings.language.choose' as const, literal, whoMayPress: person }))
const pictureOptions = CIRCLE_PICTURES.map((picture) => ({ key: `chat.picture.${picture.name}`, wordKey: picture.word, whoMayPress: person }))
const presetOptions = Object.entries(PRESET_WORDS).flatMap(([axis, choices]) => Object.entries(choices).map(([choice, wordKey]) => ({ key: `preset.${axis}.${choice}`, wordKey, whoMayPress: browser })))
/** The six themes are data with their own names, so each choice carries its name in each language and the theme word beside it. */
const themeOptions = THEMES.map((theme) => ({ key: `preset.theme.${theme.id}`, wordKey: 'settingsPanel.look.theme' as const, literalIn: (language: Language) => themeName(theme, language), whoMayPress: browser }))
/** The name of each colour a person's own label may have, one press each in the labels panel. */
const LABEL_COLOUR_WORDS: Readonly<Record<LabelColour, WordKey>> = {
  grey: 'settingsPanel.chatLabels.colour.grey',
  red: 'settingsPanel.chatLabels.colour.red',
  amber: 'settingsPanel.chatLabels.colour.amber',
  green: 'settingsPanel.chatLabels.colour.green',
  blue: 'settingsPanel.chatLabels.colour.blue',
  purple: 'settingsPanel.chatLabels.colour.purple',
}
const labelColourOptions = LABEL_COLOURS.map((colour) => ({ key: `chatLabels.colour.${colour}`, wordKey: LABEL_COLOUR_WORDS[colour], whoMayPress: person }))
const storagePolicyKeys = Object.keys(DEFAULT_UPLOAD_POLICY).filter((part) => part !== 'core' && part !== 'thresholdMB')
  .map((part) => `storageDestinations.${part}` as WordKey)



export const PANELS = [
  { key: 'settings.restart', category: 'devMachines', title: 'officeRestart.title', developerOnly: true, windowOnly: false, controls: [...controls(read, 'officeRestart.read', 'officeRestart.searchAgent', 'officeRestart.findAgent', 'officeRestart.searchDecision', 'officeRestart.findDecision'), ...controls(restart_office, 'officeRestart.reason', 'officeRestart.press'), ...controls(pause_office, 'officePause.reason', 'officePause.press', 'officePause.resume'), ...controls(exact, 'officeRestart.agent', 'officeRestart.decision', 'officeRestart.grantReason', 'officeRestart.give', 'officeRestart.takeBack')] },
  { key: 'settings.appearance', category: 'you', title: 'settingsPanel.title.appearance', developerOnly: false, windowOnly: false, controls: [...controls(person, 'settingsPanel.profile.changePicture', 'settingsPanel.avatar.labelFor', 'settingsPanel.avatar.fromThisComputer', 'settingsPanel.avatar.backToNoneChosen', 'settingsPanel.profile.editName', 'settingsPanel.profile.editStatus', 'settingsPanel.profile.keep', 'settingsPanel.profile.leave', 'settingsPanel.profile.hereSetting', 'settingsPanel.profile.backToNotChosen')] },
  { key: 'settings.language', category: 'you', title: 'settings.language.title', developerOnly: false, windowOnly: false, controls: [...controls(person, 'settings.language.choose', 'settings.language.followBrowser'), ...languageOptions, ...controls(read, 'settings.language.retry')] },
  { key: 'settings.mode', category: 'you', title: 'settingsPanel.title.mode', developerOnly: false, windowOnly: false, controls: [...controls(browser, 'settingsPanel.mode.normal', 'settingsPanel.mode.developer')] },
  { key: 'settings.notifications', category: 'you', title: 'settingsPanel.title.notifications', developerOnly: false, windowOnly: false, controls: [...controls(warrant_or_raise, 'settingsPanel.notify.allow', 'settingsPanel.notify.test', 'settingsPanel.notify.stop', 'settingsPanel.notify.stopThat')] },
  { key: 'settings.windowshutdown', category: 'you', title: 'settingsPanel.title.windowshutdown', developerOnly: false, windowOnly: true, controls: [...controls(browser, 'shutDown.windowOnly.whole', 'shutDown.windowOnly.window')] },
  { key: 'settings.startatlogin', category: 'you', title: 'startAtLogin.heading', developerOnly: false, windowOnly: false, controls: [...controls(grant, 'startAtLogin.turnOn', 'startAtLogin.rewrite', 'startAtLogin.turnOff')] },
  { key: 'settings.look', category: 'looks', title: 'settingsPanel.title.look', developerOnly: false, windowOnly: false, controls: [...controls(browser, 'settingsPanel.look.theme', 'settingsPanel.look.density', 'settingsPanel.look.corners', 'settingsPanel.look.type', 'settingsPanel.look.size'), ...presetOptions, ...themeOptions] },
  { key: 'settings.ownthemes', category: 'looks', title: 'settingsPanel.title.ownthemes', developerOnly: false, windowOnly: false, controls: [...controls(person, 'settingsPanel.ownThemes.use', 'settingsPanel.ownThemes.copy', 'settingsPanel.ownThemes.change', 'settingsPanel.ownThemes.rename', 'settingsPanel.ownThemes.delete', 'settingsPanel.ownThemes.save', 'settingsPanel.ownThemes.undo', 'settingsPanel.ownThemes.startAgain')] },
  { key: 'settings.detail', category: 'looks', title: 'settingsPanel.title.detail', developerOnly: false, windowOnly: false, controls: [...controls(browser, 'settingsPanel.detail.row.everywhere', 'settingsPanel.detail.row.home', 'settingsPanel.detail.row.review', 'settingsPanel.detail.row.composer', 'settingsPanel.detail.row.recipients', 'settingsPanel.detail.row.messages', 'settingsPanel.detail.row.reportIndex', 'settingsPanel.detail.row.reportContent', 'settingsPanel.detail.row.moduleCards', 'settingsPanel.detail.row.graph', 'settingsPanel.detail.row.tables'), ...detailOptions, ...controls(read, 'settingsPanel.detail.unwrittenAria')] },
  { key: 'settings.chatbutton', category: 'chat', title: 'chatButton.title', developerOnly: false, windowOnly: false, controls: [...controls(person, 'chat.circle.picture', 'chat.circle.number', 'chat.circle.merged', 'chat.circle.two', 'chat.circle.mergedLabel', 'chat.circle.twoLabel', 'chat.circle.back', 'chat.circle.backNumber', 'chat.circle.stays', 'chat.circle.staysUnread', 'chat.circle.staysUnreadSays', 'chat.circle.staysAlways', 'chat.circle.staysAlwaysSays', 'chat.circle.opens', 'chat.circle.opensSplit', 'chat.circle.opensSplitSays', 'chat.circle.opensWindow', 'chat.circle.opensWindowSays', 'chat.circle.backStays', 'chat.circle.backOpens'), ...pictureOptions] },
  { key: 'settings.messagelinks', category: 'chat', title: 'settingsPanel.title.messagelinks', developerOnly: false, windowOnly: false, controls: [...controls(person, 'settingsPanel.links.name', 'settingsPanel.links.place', 'settingsPanel.links.level.label', 'settingsPanel.links.level.title', 'settingsPanel.links.layout.ownLine', 'settingsPanel.links.layout.inline', 'settingsPanel.links.label', 'settingsPanel.links.title2', 'settingsPanel.links.ownLine', 'settingsPanel.links.inline', 'settingsPanel.links.backToNotChosen')] },
  { key: 'settings.chatpictures', category: 'chat', title: 'settingsPanel.title.chatpictures', developerOnly: false, windowOnly: false, controls: [...controls(person, 'settingsPanel.pictures.ask', 'settingsPanel.pictures.word.shown', 'settingsPanel.pictures.word.pressed', 'settingsPanel.pictures.word.path', 'settingsPanel.pictures.markAsk', 'settingsPanel.pictures.mark.always', 'settingsPanel.pictures.mark.never')] },
  { key: 'settings.chattextsize', category: 'chat', title: 'settingsPanel.title.chattextsize', developerOnly: false, windowOnly: false, controls: [...controls(person, 'settingsPanel.chatText.ask', 'settingsPanel.chatText.word.small', 'settingsPanel.chatText.word.normal', 'settingsPanel.chatText.word.large')] },
  { key: 'settings.chatlabels', category: 'chat', title: 'settingsPanel.title.chatflags', developerOnly: false, windowOnly: false, controls: [...controls(person, 'settingsPanel.chatLabels.colour', 'settingsPanel.chatLabels.add', 'settingsPanel.chatLabels.save', 'settingsPanel.chatLabels.remove', 'settingsPanel.chatFlags.name', 'settingsPanel.chatFlags.description', 'settingsPanel.chatFlags.instruction', 'settingsPanel.chatFlags.shortWord', 'settingsPanel.chatFlags.colour', 'settingsPanel.chatFlags.wordsColour', 'settingsPanel.chatFlags.reset', 'settingsPanel.chatFlags.resetNoMark'), ...labelColourOptions] },
  { key: 'settings.mediaload', category: 'chat', title: 'settingsPanel.title.mediaload', developerOnly: false, windowOnly: false, controls: [...controls(person, 'settingsPanel.media.ask', 'settingsPanel.media.word.withPage', 'settingsPanel.media.word.never', 'settingsPanel.media.word.onPress')] },
  { key: 'settings.inject', category: 'chat', title: 'settingsPanel.title.inject', developerOnly: false, windowOnly: false, controls: [...controls(grant_or_key, 'settingsPanel.inject.agentsMayInject', 'settingsPanel.inject.on', 'settingsPanel.inject.off')] },
  { key: 'settings.machinenames', category: 'chat', title: 'settingsPanel.title.machinenames', developerOnly: false, windowOnly: false, controls: [...controls(grant, 'settingsPanel.machineNames.address', 'settingsPanel.machineNames.name', 'settingsPanel.machineNames.add', 'settingsPanel.machineNames.save', 'settingsPanel.machineNames.remove')] },
  { key: 'settings.deadletters', category: 'chat', title: 'settingsPanel.title.deadletters', developerOnly: false, windowOnly: false, controls: [...controls(raised, 'deadLetterSecretary.pick', 'deadLetterSecretary.pickNobody', 'deadLetterSecretary.save'), ...controls(threshold, 'deadLetterThresholds.days', 'deadLetterThresholds.count', 'deadLetterThresholds.reason', 'deadLetterThresholds.searchDecision', 'deadLetterThresholds.findDecision', 'deadLetterThresholds.chosenDecision', 'deadLetterThresholds.save', 'deadLetterThresholds.remove')] },
  { key: 'settings.mergequeueowner', category: 'chat', title: 'settingsPanel.title.mergequeueowner', developerOnly: false, windowOnly: false, controls: [...controls(raised, 'mergeQueueOwner.pick', 'mergeQueueOwner.pickNobody', 'mergeQueueOwner.save')] },
  { key: 'settings.modulereminders', category: 'chat', title: 'settingsPanel.title.modulereminders', developerOnly: false, windowOnly: false, controls: [...controls(key, 'moduleReminders.pick', 'moduleReminders.pickNothingHere', 'moduleReminders.because', 'moduleReminders.save')] },
  { key: 'settings.usagenotices', category: 'chat', title: 'settingsPanel.title.usagenotices', developerOnly: false, windowOnly: false, controls: [...controls(usage_secretary, 'usageNotices.panel.pick', 'usageNotices.panel.pickNobody', 'usageNotices.panel.save'), ...controls(exact, 'usageNotices.panel.words', 'usageNotices.panel.decision', 'usageNotices.panel.clear'), { key: 'usageNotices.decision.save', wordKey: 'usageNotices.panel.save', whoMayPress: exact }] },
  { key: 'settings.messagedoor', category: 'chat', title: 'settingsPanel.title.messagedoor', developerOnly: false, windowOnly: false, controls: [] },
  { key: 'settings.replyreminder', category: 'chat', title: 'settingsPanel.title.replyreminder', developerOnly: false, windowOnly: false, controls: [] },
  { key: 'settings.sendkey', category: 'keys', title: 'settingsPanel.title.sendkey', developerOnly: false, windowOnly: false, controls: [...controls(person, 'sendKey.ask', 'sendKey.word.shiftOrAlt', 'sendKey.word.enter')] },
  { key: 'settings.shortcuts', category: 'keys', title: 'settingsPanel.title.shortcuts', developerOnly: false, windowOnly: false, controls: [...controls(person, 'shortcuts.settings.singleSwitch', ...Object.values(SHORTCUT_SETTING_WORDS)), ...controls(read, 'shortcuts.settings.seeAll')] },
  { key: 'settings.projects', category: 'work', title: 'nav.projects', developerOnly: false, windowOnly: false, controls: [...controls(registered, 'nav.makeProject', 'nav.renameProject', 'nav.whatToCallIt', 'nav.make', 'nav.rename', 'nav.cancel')] },
  { key: 'settings.queueview', category: 'work', title: 'settingsPanel.title.queueview', developerOnly: false, windowOnly: false, controls: [...controls(browser, 'settingsPanel.queue.ask', 'decisions.cards', 'decisions.list')] },
  { key: 'settings.review', category: 'work', title: 'settingsPanel.title.review', developerOnly: false, windowOnly: false, controls: [...controls(browser, 'settingsPanel.marks.local', 'settingsPanel.marks.global', 'settingsPanel.marks.putBothBack', 'review.sentMarks.ask', 'review.sentMarks.show', 'review.sentMarks.hide')] },
  { key: 'settings.reviewlevel', category: 'work', title: 'settingsPanel.title.reviewlevel', developerOnly: false, windowOnly: false, controls: [...controls(registered, 'settingsPanel.review.setting', 'settingsPanel.review.level.none', 'settingsPanel.review.level.light', 'settingsPanel.review.level.full', 'delegation.inspection.on', 'delegation.inspection.off')] },
  { key: 'settings.workswitches', category: 'work', title: 'workSwitches.title', developerOnly: false, windowOnly: false, controls: [...controls(settings_door, 'workSwitches.skip.tags', 'workSwitches.skip.runs', 'workSwitches.held.title', 'workSwitches.pending.clear'), ...controls(key, 'workSwitches.checks.title'),
    ...['tags', 'runs'].flatMap((part) => [namedControl(`workSwitches.${part}.reason`, 'gates.reason', settings_door), namedControl(`workSwitches.${part}.save`, 'gates.save', settings_door)]),
    namedControl('workSwitches.checks.bounds', 'gates.bounds', key), namedControl('workSwitches.checks.reason', 'gates.reason', key), namedControl('workSwitches.checks.save', 'gates.save', key), namedControl('workSwitches.checks.putBack', 'gates.putBack', key),
    namedControl('workSwitches.pending.reason', 'gates.reason', settings_door),
    namedControl('workSwitches.held.position', 'gates.position', settings_door),
    ...(['edit', 'reason', 'until', 'on', 'off', 'save', 'putBack', 'stopEditing'] as const).map((part) => namedControl(`workSwitches.held.${part}`, part === 'edit' ? 'pagesFromSettings.edit' : part === 'stopEditing' ? 'pagesFromSettings.stopEditing' : `gates.${part}` as WordKey, settings_door)),
    ...controls(read, 'gates.readAgain')] },
  { key: 'settings.mailtool', category: 'tools', title: 'settingsPanel.title.mailtool', developerOnly: false, windowOnly: false, controls: [...controls(grant, 'settingsPanel.mailtool.install', 'settingsPanel.mailtool.disable', 'settingsPanel.mailtool.key.takeBack'), ...controls(owner_only, 'settingsPanel.mailtool.addresses.label', 'settingsPanel.mailtool.addresses.save', 'settingsPanel.mailtool.from.choice', 'settingsPanel.mailtool.from.pick', 'settingsPanel.mailtool.test.send')] },
  { key: 'settings.providerkeys', category: 'tools', title: 'providerSetup.title', developerOnly: false, windowOnly: false, controls: controls(owner_only, 'providerSetup.provider', 'providerSetup.name', 'providerSetup.prefix', 'providerSetup.minimum', 'providerSetup.key', 'providerSetup.replace', 'providerSetup.save', 'providerSetup.test') },
  { key: 'settings.sandboxmemory', category: 'tools', title: 'settingsPanel.title.sandboxmemory', developerOnly: false, windowOnly: false, controls: [...controls(grant, 'sandboxCap.turnOn', 'sandboxCap.turnOff')] },
  { key: 'settings.gpuwatcher', category: 'tools', title: 'settingsPanel.title.gpuwatcher', developerOnly: false, windowOnly: false, controls: [...controls(key, 'gpuWatcher.pick', 'gpuWatcher.pickNobody', 'gpuWatcher.save')] },
  { key: 'settings.plugins', category: 'tools', title: 'settingsPanel.title.plugins', developerOnly: false, windowOnly: false, controls: [...controls(raised, 'settingsPanel.plugins.on', 'settingsPanel.plugins.off'), ...controls(map_motion, 'settingsPanel.plugins.officeMap.motion')] },
  { key: 'settings.quickinputs', category: 'tools', title: 'settingsPanel.title.quickinputs', developerOnly: false, windowOnly: false, controls: [...controls(grant_or_key, 'quickInputs.boxLabel', 'quickInputs.save', 'quickInputs.clear'), ...controls(read, 'quickInputs.keepIt')] },
  { key: 'settings.terminalholder', category: 'tools', title: 'settingsPanel.title.terminalholder', developerOnly: false, windowOnly: false, controls: [...controls(holder_read, 'terminalHolder.restart'), ...controls(grant, 'terminalHolder.confirm', 'terminalHolder.confirmNone', 'terminals.holder.start'), ...controls(read, 'terminalHolder.cancel')] },
  { key: 'settings.storage', category: 'kept', title: 'storageDestinations.title', developerOnly: false, windowOnly: false, controls: [...controls('Nobody: this choice is always on.', 'storageDestinations.core'), ...controls(owner_or_secretary, 'storageDestinations.folder', 'storageDestinations.s3', 'storageDestinations.ssh', 'storageDestinations.add', 'storageDestinations.name', 'storageDestinations.kind', 'storageDestinations.path', 'storageDestinations.endpoint', 'storageDestinations.bucket', 'storageDestinations.region', 'storageDestinations.prefix', 'storageDestinations.host', 'storageDestinations.user', 'storageDestinations.port', 'storageDestinations.enabled', 'storageDestinations.thresholdMB', 'storageDestinations.limitMB', 'storageDestinations.credentialAction', 'storageDestinations.retain', 'storageDestinations.replace', 'storageDestinations.remove', 'storageDestinations.accessKeyId', 'storageDestinations.secretAccessKey', 'storageDestinations.sessionToken', 'storageDestinations.password', 'storageDestinations.privateKey', 'storageDestinations.passphrase', 'storageDestinations.save', ...storagePolicyKeys)] },
  { key: 'settings.whatiskept', category: 'kept', title: 'settingsPanel.title.whatiskept', developerOnly: false, windowOnly: false, controls: [...controls(grant_or_key, 'settingsPanel.kept.label.keepBackups', 'settingsPanel.kept.label.untracedRequestDays', 'settingsPanel.kept.label.tracedRequestDays', 'settingsPanel.kept.keep')] },
  { key: 'settings.datafolder', category: 'kept', title: 'settingsPanel.title.datafolder', developerOnly: false, windowOnly: false, controls: [...controls(read, 'dataFolder.check'), ...controls(grant, 'dataFolder.move', 'dataFolder.move.sure', 'dataFolder.confirm'), ...controls(browser, 'dataFolder.move.cancel')] },
  { key: 'settings.writer', category: 'devRuns', title: 'settingsPanel.title.writer', developerOnly: true, windowOnly: false, controls: [...controls(browser, 'nav.writerChoice')] },
  { key: 'settings.words', category: 'looks', title: 'settings.words.title', developerOnly: false, windowOnly: false, controls: [...controls(read, 'wordTable.find', 'wordTable.history', 'wordTable.previous', 'wordTable.more', 'wordTable.newerChoices', 'wordTable.olderChoices', 'wordTable.shippedLines'), ...controls(key_and_reason, 'wordTable.english', 'wordTable.chinese', 'wordTable.confirm', 'wordTable.reason', 'wordTable.notUsedReason', 'wordTable.save', 'wordTable.shipped', 'wordTable.restore', 'wordTable.removeNotUsed')] },
  { key: 'settings.arrangesidebar', category: 'looks', title: 'settingsPanel.title.arrangesidebar', developerOnly: false, windowOnly: false, controls: [...controls(read, 'settingsPanel.title.arrangesidebar')] },
  { key: 'settings.prices', category: 'devRuns', title: 'settingsPanel.title.prices', developerOnly: true, windowOnly: false, controls: [...controls(grant_or_key, 'settingsPanel.prices.currency', 'settingsPanel.prices.model', 'settingsPanel.prices.input', 'settingsPanel.prices.output', 'settingsPanel.prices.cachedInput', 'settingsPanel.prices.save', 'settingsPanel.prices.remove')] },
  { key: 'settings.keys', category: 'devRuns', title: 'settingsPanel.title.keys', developerOnly: true, windowOnly: false, controls: [...controls(warrant_or_raise, 'settingsPanel.keys.key', 'settingsPanel.keys.keyLabel', 'settingsPanel.keys.set', 'settingsPanel.keys.test', 'settingsPanel.logins.login', 'settingsPanel.logins.loginLabel', 'settingsPanel.logins.set', 'settingsPanel.logins.clear'), ...controls(owner_only, 'privateLogin.add', 'privateLogin.open', 'privateLogin.code', 'privateLogin.submit', 'privateLogin.done', 'privateLogin.cancel', 'settingsPanel.goSlots.name', 'settingsPanel.goSlots.key', 'settingsPanel.goSlots.add', 'settingsPanel.goSlots.remove')] },
  { key: 'settings.runmodels', category: 'devRuns', title: 'settingsPanel.title.runmodels', developerOnly: true, windowOnly: false, controls: [...controls(grant_or_key, 'settingsPanel.runModels.runtime', 'settingsPanel.runModels.model', 'settingsPanel.runModels.effort', 'settingsPanel.runModels.save', 'settingsPanel.runModels.clear', 'settingsPanel.runModels.undo')] },
  { key: 'settings.entry', category: 'devRuns', title: 'settingsPanel.title.entry', developerOnly: true, windowOnly: false, controls: [...controls(grant_or_key, 'settingsPanel.entry.put')] },
  { key: 'settings.repositories', category: 'devMachines', title: 'settingsPanel.title.repositories', developerOnly: true, windowOnly: false, controls: [...controls(local, 'settingsPanel.repos.scanNow', 'settingsPanel.repos.forget', 'settingsPanel.repos.name', 'settingsPanel.repos.folder', 'settingsPanel.repos.holds', 'settingsPanel.repos.register', 'settingsPanel.repos.add', 'settingsPanel.repos.cancel'), ...controls(repoint, 'settingsPanel.repos.repoint', 'settingsPanel.repos.pointThere')] },
  { key: 'settings.previewroots', category: 'devMachines', title: 'settingsPanel.title.previewroots', developerOnly: true, windowOnly: false, controls: [...controls(local, 'settingsPanel.roots.add', 'settingsPanel.roots.folder', 'settingsPanel.roots.why', 'settingsPanel.roots.addIt', 'settingsPanel.roots.leave')] },
  { key: 'settings.thiscomputer', category: 'devMachines', title: 'settingsPanel.title.thiscomputer', developerOnly: true, windowOnly: false, controls: [...controls(read, 'settingsPanel.computer.more')] },
  { key: 'settings.access', category: 'devMachines', title: 'settingsPanel.title.access', developerOnly: true, windowOnly: false, controls: controls(grant_or_key, 'settingsPanel.addressForBrowsers.field', 'settingsPanel.addressForBrowsers.save', 'settingsPanel.addressForBrowsers.takeAway', 'settingsPanel.addressForBrowsers.takeAwayToNone') },
  { key: 'settings.trusted', category: 'devMachines', title: 'settingsPanel.title.trusted', developerOnly: true, windowOnly: false, controls: [...controls(read, 'settingsPanel.trusted.setOn')] },
  { key: 'settings.headeronly', category: 'devMachines', title: 'settingsPanel.title.headeronly', developerOnly: true, windowOnly: false, controls: [...controls(grant, 'settingsPanel.window.press', 'settingsPanel.window.cancel')] },
  { key: 'settings.visitorceiling', category: 'devMachines', title: 'settingsPanel.title.visitorceiling', developerOnly: true, windowOnly: false, controls: [] },
] as const satisfies readonly SettingsPanelDeclaration[]

/** The page and the read door name a control from the same declaration. */
export function settingsControlWord(panel: SettingsPanelDeclaration['key'], key: string): WordKey {
  const declared = (PANELS as readonly SettingsPanelDeclaration[]).find((one) => one.key === panel)?.controls.find((one) => one.key === key)
  if (declared === undefined) throw new Error(`No Settings control ${key} in ${panel}.`)
  return declared.wordKey
}
