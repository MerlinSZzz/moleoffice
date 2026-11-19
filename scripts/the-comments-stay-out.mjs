// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * OUR COMMENTS STAY OUT OF A BUNDLE (wave 13v round 35). Measured on the bundle of that round: esbuild drops a comment
 * that stands as a statement, and keeps one that sits inside an expression, such as a comment between the items of an
 * array, the fields of an object or the arguments of a call. Those kept comments were most of what the bundle carried
 * of the person's own messages. A comment is written for the people who develop the office and never for a tester, so none of
 * ours goes in.
 *
 * HOW. An esbuild plugin reads each of the checkout's own source files before esbuild does, finds its comments with
 * the parser Vite builds the page with (oxc, through rolldown), and writes a space over every character of each
 * comment except a line break. Every line and column stays where it was, so a line number in an error still points
 * at the source, and a line break inside a block comment still ends a line where JavaScript reads one. A package
 * under node_modules/ is read as it is: its comments are its authors', and its licence comments go to the end of the
 * bundle as esbuild puts them.
 *
 * A file the parser cannot read stops the bundle, naming the file and the parser's words. Nothing is guessed.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The parser of the rolldown that Vite itself depends on, so it is the one the page is built with. */
const { parseSync } = /** @type {{ parseSync: (file: string, text: string) => { comments: { start: number, end: number }[], errors: { message: string }[] } }} */ (
  await import(pathToFileURL(createRequire(import.meta.resolve('vite')).resolve('rolldown/utils')).href)
)

/** The source files the plugin reads: ours, in the languages esbuild compiles. */
const OUR_SOURCES = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

/** The loader esbuild uses for each. @param {string} file */
const theLoaderFor = (file) => (/\.(?:tsx)$/.test(file) ? 'tsx' : /\.(?:ts|mts|cts)$/.test(file) ? 'ts' : /\.jsx$/.test(file) ? 'jsx' : 'js')

/**
 * The text with every comment written over with spaces, line breaks kept. Throws when the parser cannot read it.
 * @param {string} file its path, whose ending says the language
 * @param {string} text
 */
export function withoutTheComments(file, text) {
  const parsed = parseSync(file, text)
  if (parsed.errors.length > 0) {
    throw new Error(`${file} could not be read to take its comments out: ${parsed.errors.map((one) => one.message).join('; ')}`)
  }
  let out = ''
  let at = 0
  for (const comment of parsed.comments) {
    out += text.slice(at, comment.start) + text.slice(comment.start, comment.end).replace(/[^\n\r\u2028\u2029]/g, ' ')
    at = comment.end
  }
  return out + text.slice(at)
}

/** @type {import('esbuild').Plugin} */
export const theCommentsStayOut = {
  name: 'the-comments-stay-out',
  setup(build) {
    build.onLoad({ filter: OUR_SOURCES }, (args) => {
      if (/[\\/]node_modules[\\/]/.test(args.path)) return undefined
      return { contents: withoutTheComments(args.path, readFileSync(args.path, 'utf8')), loader: theLoaderFor(args.path), resolveDir: dirname(args.path) }
    })
  },
}
