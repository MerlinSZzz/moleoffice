// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSED PLUGIN'S REASON, IN THE PLAIN WORDS THE SETTINGS PANEL AND THE PLUGIN'S OWN PAGE DRAW (see
 * 2ofDpr3_ED-D).
 *
 * Normal mode says why a plugin was refused in sentences a person reads, in the page's language, from the words table
 * (`settingsPanel.plugins.why.*`). The office's reader's own English — "version: Invalid input: expected string,
 * received undefined" — is never one of them: that raw text belongs in Developer mode, as the folder name does.
 *
 * ONE PLACE TURNS THE READING'S DATA INTO SENTENCES. Both draw what `pluginReasonInPlainWords` answers for a refused
 * plugin, one sentence to a line: the Settings panel (PluginSwitches.tsx) in `.plgs-reason`, and a plugin's own page
 * (PluginPage.tsx) in `.plgp-reason`. In Developer mode each asks `theRawTextSaysMore` whether to draw the reader's
 * own text under the sentences, in `.plgs-raw` and `.plgp-raw`. This file names no sentence of its own: every word
 * comes from src/shared/words/en.ts and zh.ts.
 */
import { t, type WordKey } from '@shared/i18n.ts'
import { A_THING_WORD, PLUGIN_REFUSAL_CAUSES, type AManifestFieldProblem, type PluginReading } from '@shared/plugins.ts'

type AProblemWord = Readonly<Partial<Record<AManifestFieldProblem['problem'], WordKey>>>

/**
 * The words table's sentence for each way a manifest field can be wrong, by where the fault is: the field itself, a
 * key inside it, a key inside one entry of a list, or one entry of a list itself. An entry with no key inside is only
 * ever not usable, because a key that is missing or not known is a key inside it; any other pair says it cannot say.
 */
const A_PROBLEM_WORD: { field: AProblemWord; inside: AProblemWord; insideAnEntry: AProblemWord; anEntry: AProblemWord } = {
  field: {
    missing: 'settingsPanel.plugins.why.missing',
    'not-known': 'settingsPanel.plugins.why.notKnown',
    'not-usable': 'settingsPanel.plugins.why.notUsable',
  },
  inside: {
    missing: 'settingsPanel.plugins.why.missingInside',
    'not-known': 'settingsPanel.plugins.why.notKnownInside',
    'not-usable': 'settingsPanel.plugins.why.notUsableInside',
  },
  insideAnEntry: {
    missing: 'settingsPanel.plugins.why.missingInAnEntry',
    'not-known': 'settingsPanel.plugins.why.notKnownInAnEntry',
    'not-usable': 'settingsPanel.plugins.why.notUsableInAnEntry',
  },
  anEntry: { 'not-usable': 'settingsPanel.plugins.why.anEntryNotUsable' },
}

/** The sentence for one fault in a manifest, naming where it is: the field, the entry and the key inside. */
function theSentenceFor(one: AManifestFieldProblem): string {
  if (one.field === '') return t('settingsPanel.plugins.why.cannotSay')
  const where =
    one.entry === undefined
      ? one.inside === undefined ? A_PROBLEM_WORD.field : A_PROBLEM_WORD.inside
      : one.inside === undefined ? A_PROBLEM_WORD.anEntry : A_PROBLEM_WORD.insideAnEntry
  const key = where[one.problem]
  if (key === undefined) return t('settingsPanel.plugins.why.cannotSay')
  return t(key, { field: one.field, ...(one.entry === undefined ? {} : { entry: one.entry }), ...(one.inside === undefined ? {} : { inside: one.inside }) })
}

/**
 * WHY THE PLUGIN WAS REFUSED, IN THE PAGE'S LANGUAGE, one sentence to a line. A reading with no reason as data, a
 * cause this build does not know, and a manifest issue about no nameable field each say the cannot-say sentence
 * instead of guessing, and the reader's own `refusal` is never one of the sentences.
 */
export function pluginReasonInPlainWords(reading: PluginReading): string[] {
  const because = reading.refusedBecause
  if (because === null) return [t('settingsPanel.plugins.why.cannotSay')]
  switch (because.cause) {
    case 'folder-leads-nowhere':
      return [t('settingsPanel.plugins.why.folderLeadsNowhere', { id: reading.id })]
    case 'folder-is-a-link':
      return [t('settingsPanel.plugins.why.folderIsALink', { id: reading.id })]
    case 'folder-cannot-be-opened':
      return [t('settingsPanel.plugins.why.folderCannotBeOpened', { id: reading.id })]
    case 'manifest-is-a-link':
      return [t('settingsPanel.plugins.why.manifestIsALink', { id: reading.id })]
    case 'manifest-is-a-folder':
      return [t('settingsPanel.plugins.why.manifestIsAFolder', { id: reading.id })]
    case 'manifest-cannot-be-read':
      return [t('settingsPanel.plugins.why.manifestCannotBeRead', { id: reading.id })]
    case 'manifest-is-not-a-file':
      return [t('settingsPanel.plugins.why.manifestIsNotAFile', { id: reading.id, what: t(A_THING_WORD[because.what]) })]
    case 'no-manifest':
      return [t('settingsPanel.plugins.why.noManifest')]
    case 'manifest-is-not-json':
      return [t('settingsPanel.plugins.why.manifestIsNotJson', { id: reading.id })]
    case 'id-differs':
      return [t('settingsPanel.plugins.why.idDiffers', { said: because.said, id: reading.id })]
    case 'manifest-fields': {
      // EACH SENTENCE ONCE, IN THE ORDER THE FIELDS CAME: several issues about no nameable field all say the
      // cannot-say sentence, and a person should read it once.
      const sentences: string[] = []
      for (const one of because.fields) {
        const sentence = theSentenceFor(one)
        if (!sentences.includes(sentence)) sentences.push(sentence)
      }
      return sentences
    }
    default:
      // A CAUSE THIS BUILD DOES NOT KNOW says so rather than guessing, and never the reader's raw text.
      return [t('settingsPanel.plugins.why.cannotSay')]
  }
}

/**
 * WHETHER DEVELOPER MODE ALSO DRAWS THE READER'S OWN TEXT under the plain words. It does where that text says more
 * than the words table can: a plugin.json that is not JSON (the parser's message), a manifest with fields this office
 * will not accept (the schema's message for each), and a reason this build cannot turn into words at all. Every other
 * cause's raw text is the English of the sentence above it, so it is not drawn twice.
 */
export function theRawTextSaysMore(reading: PluginReading): boolean {
  const because = reading.refusedBecause
  if (because === null) return true
  return because.cause === 'manifest-is-not-json' || because.cause === 'manifest-fields' || !PLUGIN_REFUSAL_CAUSES.includes(because.cause)
}
