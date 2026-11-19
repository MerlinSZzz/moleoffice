// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE COMMAND WORDS OF THE MERGE TOOL'S COMMAND LINE, IN ONE PLACE.
 *
 * The command line, its test and its manual all read the three commands and their options here. Each option
 * carries its word, the placeholder its value is written with in a usage line, and whether the command needs
 * it. A flag takes no value, and its placeholder is null.
 *
 * Two functions read this list: `theUsageLine` writes one command's line exactly as a person types it, and
 * `theWordsOf` builds the words of one real call in the same order. The builder refuses a missing needed
 * option and an option the command does not take, so a caller cannot invent a call the parser would refuse.
 */

import './a-library-is-not-a-program.mjs'

/** The program path, as a person types it from the repository root. */
export const THE_PROGRAM = 'tools/merge-tool/cli.mjs'

/**
 * The three commands and their options, in the order the manual gives them.
 * @type {readonly { name: string, options: readonly { name: string, word: string, value: string | null, required: boolean }[] }[]}
 */
export const THE_COMMANDS = Object.freeze([
  Object.freeze({
    name: 'submit',
    options: Object.freeze([
      Object.freeze({ name: 'config', word: '--config', value: '<file>', required: true }),
      Object.freeze({ name: 'branch', word: '--branch', value: '<branch>', required: true }),
      Object.freeze({ name: 'title', word: '--title', value: '<text>', required: false }),
      Object.freeze({ name: 'id', word: '--id', value: '<id>', required: false }),
    ]),
  }),
  Object.freeze({
    name: 'list',
    options: Object.freeze([
      Object.freeze({ name: 'config', word: '--config', value: '<file>', required: true }),
      Object.freeze({ name: 'json', word: '--json', value: null, required: false }),
    ]),
  }),
  Object.freeze({
    name: 'run',
    options: Object.freeze([
      Object.freeze({ name: 'config', word: '--config', value: '<file>', required: true }),
      Object.freeze({ name: 'entry', word: '--entry', value: '<id>', required: false }),
    ]),
  }),
])

/** Every option word, across the three commands, so a parser can tell an unknown word from one a command does not take. */
export const THE_OPTION_WORDS = Object.freeze([
  ...new Set(THE_COMMANDS.flatMap((command) => command.options.map((option) => option.word))),
])

/**
 * One command by name, or the sentence for a command this command line does not know.
 * @param {unknown} name
 */
export function theCommandNamed(name) {
  const found = THE_COMMANDS.find((command) => command.name === name)
  if (found === undefined) {
    throw new Error(
      `The command line does not know the command ${JSON.stringify(String(name))}; it takes one of ${THE_COMMANDS.map((command) => command.name).join(', ')}.`,
    )
  }
  return found
}

/**
 * One command's usage line, exactly as a person types it, with each optional part in brackets.
 * @param {string} name
 */
export function theUsageLine(name) {
  const command = theCommandNamed(name)
  const parts = command.options.map((option) => {
    const written = option.value === null ? option.word : `${option.word} ${option.value}`
    return option.required ? written : `[${written}]`
  })
  return `node ${THE_PROGRAM} ${command.name} ${parts.join(' ')}`
}

/**
 * The words of one real call, in the order above. Throws one plain sentence for a needed option that is
 * missing and for an option the command does not take.
 * @param {string} name
 * @param {Record<string, string | boolean>} [given]
 */
export function theWordsOf(name, given = {}) {
  const command = theCommandNamed(name)
  const known = new Map(command.options.map((option) => [option.name, option]))
  for (const key of Object.keys(given)) {
    if (known.has(key)) continue
    const word = `--${key}`
    if (THE_OPTION_WORDS.includes(word)) {
      throw new Error(`The command "${command.name}" does not take the option "${word}".`)
    }
    throw new Error(`The command line does not know the option "${word}".`)
  }
  const words = [command.name]
  for (const option of command.options) {
    const value = given[option.name]
    if (value === undefined || value === false) {
      if (option.required) throw new Error(`The command "${command.name}" needs the option "${option.word}" and its value.`)
      continue
    }
    words.push(option.word)
    if (option.value !== null) words.push(String(value))
  }
  return words
}
