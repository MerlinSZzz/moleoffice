// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOST JOB MASK HIDES A KEY IN BASE64 WHOLE, AND STILL SHOWS THE PATHS AND NAMES A JOB PRINTS.
 *
 * What a host job hands back is masked before it is filed (`maskedForAHostJob` in src/config/host-tools.mjs), since
 * agents read the record and send it to their model providers. The printed-line mask stops a run of characters at a
 * `/`, and at a `-` and a `_`, so it showed the parts of a key in base64 on either side of one: in round 60's
 * measurement, 666 of 957 made-up keys holding a `/` had 8 characters or more of them left shown. A run of the
 * characters of base64 and of base64url, of a key's length, is now taken as one key, unless its words make it a path or
 * a name. A key the rule does not take is masked as the printed-line mask masks it, as before.
 *
 * ROUND 62 HID THE KEYS ROUND 60 STILL SHOWED IN PART. One of the 957 read as a name, so 10 of its characters were
 * shown, and 9 of it in base64url. Three of 500 keys of 16 bytes read as a path or a name, and were shown whole. Two
 * rules take them. A run that ends in the `=` that pads base64, at a length that is a multiple of four, is a key
 * whatever its words, since no path or name ends so. And a run read as a name that joins its parts with `+`, `/`, `_`
 * or `-` is a key when the printed-line mask would hide a part of it, since a name's parts are words and a part that
 * looks generated is a key's.
 *
 * The keys here are made up: each is the sha256 of a fixed seed, so a run can be had again, and none is a key anywhere.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Each of 957 made-up keys of 32 bytes in base64 holding a `/` is hidden whole in a sentence, as a quoted value
 *      and on a line of its own, where the text is what it was with the marker in the key's place; and after
 *      `API_KEY=` and as the value of `"key"`, where the field's value is hidden as on any printed line. The mask says
 *      it masked.
 *   2. The same 957 keys in base64url, 300 holding a `+` and no `/`, and 500 keys of 16 bytes holding a `/` or a `+`
 *      are each hidden whole in the same five places.
 *   3. A key in hex is masked as the printed-line mask masks it, and no 8 characters of it are shown.
 *   4. The paths and names a job prints are left as they are, and the mask says nothing was masked: this checkout's
 *      files and folders, as they are and under /srv/build/, with 132 made-up notes named in capitals among them;
 *      paths holding the office's ids and generated names; the
 *      names of the toolchain's logs, which hold a moment and random hex characters; and the camelCase names of this
 *      checkout's code in a path and in a line of a stack, where the printed-line mask leaves them as they are.
 *   5. A path's first folders that are words stay shown before a generated name, and a key that begins with `/` is
 *      hidden from that `/`.
 *   6. No 8 characters together of any key of the four sets are shown in any of the five places.
 *   7. A camelCase name of this checkout's code that the printed-line mask hides, standing in a sentence with no `+`,
 *      `/`, `_` or `-` beside it, is masked as that mask masks it, and not said to be a key in base64.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the hand-back of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - theKeyIn finding no key: cases 1, 2 and 5 go red;
 *   - the share of words taken out of theKeyIn, so a path is read by its shape alone: case 4 goes red;
 *   - pieces in capitals not counted as words: case 4 goes red;
 *   - one piece in capitals counted as a word, where two are asked: case 2 goes red;
 *   - the share of a name's words taken out of theKeyIn: case 4 goes red;
 *   - the short words taken out of the words of a name: case 4 goes red;
 *   - every run of lower-case letters counted as a name's word, with no vowel asked: cases 1, 2 and 5 go red;
 *   - one capital enough for a key, where two are asked: case 4 goes red;
 *   - a path's first folders that are words no longer kept: case 5 goes red;
 *   - the `=` that pads a key left out of the run: cases 1, 2 and 5 go red;
 *   - the printed-line mask run on the whole text before the keys are found: cases 1, 2, 3 and 5 go red;
 *   - the printed-line mask run on the text between the keys, each piece alone: cases 1 and 2 go red (a field's quote
 *     is read as its value).
 *
 * Round 62's, each after a control run:
 *
 *   - the padded run no longer taken whatever its words: cases 2 and 6 go red. Case 1 stays green, since each of its
 *     keys holds a `/`, and the second rule takes it;
 *   - a name joined with `+`, `/`, `_` or `-` kept as a name when the printed-line mask would hide a part of it: cases
 *     2 and 6 go red;
 *   - any name the printed-line mask would hide taken as a key, joined or not: case 7 goes red.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { A_KEY_IN_BASE64, A_KEYS_LENGTH, maskedForAHostJob } from '../src/config/host-tools.mjs'
import { maskedAsAPrintedLine } from '../src/config/inspection-ending.mjs'
import { fileNameStamp } from '../src/shared/time.ts'

/** As many bytes as asked, from the sha256 of a seed and a counter. */
function madeUpBytes(seed: string, count: number): Buffer {
  let bytes = Buffer.alloc(0)
  for (let at = 0; bytes.length < count; at++) bytes = Buffer.concat([bytes, createHash('sha256').update(`${seed}/${String(at)}`).digest()])
  return bytes.subarray(0, count)
}

/** Made-up keys of 32 bytes in base64, from seeds counted up from 0, as many as asked of those that `keep` keeps. */
function madeUpKeys(seed: string, count: number, keep: (key: string) => boolean): string[] {
  const keys: string[] = []
  for (let at = 0; keys.length < count; at++) {
    const key = madeUpBytes(`${seed}-${String(at)}`, 32).toString('base64')
    if (keep(key)) keys.push(key)
  }
  return keys
}

/** An id of the office's shape: base64url characters, as many as asked. */
function aMadeUpId(seed: string, length = 12): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  return [...madeUpBytes(seed, length)].map((byte) => characters[byte & 63]).join('')
}

const WITH_A_SLASH = madeUpKeys('r60-key', 957, (key) => key.includes('/'))
const IN_BASE64URL = WITH_A_SLASH.map((key) => key.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''))
const WITH_A_PLUS = madeUpKeys('r60-plus', 300, (key) => key.includes('+') && !key.includes('/'))
const OF_16_BYTES: string[] = []
for (let at = 0; OF_16_BYTES.length < 500; at++) {
  const key = madeUpBytes(`r60-16-${String(at)}`, 16).toString('base64')
  if (/[/+]/.test(key)) OF_16_BYTES.push(key)
}

/**
 * The five places a key is printed in. Where the key is the value of a field the printed-line mask hides, it reads as
 * that mask reads the field with any value; elsewhere it reads with the marker in the key's place.
 */
const PLACES: { printed: (shown: string) => string; hidden: string }[] = [
  { printed: (shown) => `the key is ${shown} here`, hidden: `the key is ${A_KEY_IN_BASE64} here` },
  { printed: (shown) => `{"id": 7, "value": "${shown}"}`, hidden: `{"id": 7, "value": "${A_KEY_IN_BASE64}"}` },
  { printed: (shown) => `${shown}\n`, hidden: `${A_KEY_IN_BASE64}\n` },
  { printed: (shown) => `API_KEY=${shown}`, hidden: maskedAsAPrintedLine('API_KEY=x') },
  { printed: (shown) => `{"key": "${shown}", "n": 1}`, hidden: maskedAsAPrintedLine('{"key": "x", "n": 1}') },
]

/** The keys that are not hidden whole in one of the places. */
function notHiddenWhole(keys: string[]): string[] {
  return keys.filter((key) =>
    PLACES.some((place) => {
      const done = maskedForAHostJob(place.printed(key))
      return done.text !== place.hidden || !done.masked
    }),
  )
}

/** The keys of which 8 characters together or more are shown in one of the places, each with what that place read. */
function shownInPart(keys: string[]): string[] {
  return keys.flatMap((key) =>
    PLACES.flatMap((place) => {
      const text = maskedForAHostJob(place.printed(key)).text
      for (let from = 0; from + 8 <= key.length; from++) if (text.includes(key.slice(from, from + 8))) return [`${key} read as ${text}`]
      return []
    }),
  )
}

/** The camelCase names of this checkout's code, of 12 characters or more, made of words, capitals and numbers. */
function theCodesCamelCaseNames(): string[] {
  const code = execFileSync('git', ['ls-files', 'src/*.ts', 'src/*.tsx', 'src/*.mjs', 'tools/*.mjs'], { encoding: 'utf8' }).split('\n').filter((file) => file !== '')
  return [...new Set(code.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/\b[a-z][A-Za-z0-9]{11,}\b/g)].map((name) => name[0])))]
    .filter((name) => /^[a-z]{2,}(?:[A-Z][a-z]+|[A-Z]{2,5}(?![a-z])|[0-9]+)+$/.test(name))
}

/** The texts the mask changes, or says it masked, for the failure message. */
function changed(texts: string[]): string[] {
  return texts.flatMap((text) => {
    const done = maskedForAHostJob(text)
    return done.text === text && !done.masked ? [] : [`${text} read as ${done.text}`]
  })
}

describe('a key in base64 is hidden whole', () => {
  it('1: each of 957 made-up keys holding a "/" is hidden whole in a sentence, as a quoted value, on a line of its own and as the value of a key\'s field', () => {
    expect(WITH_A_SLASH).toHaveLength(957)
    for (const place of PLACES.slice(3)) expect(place.hidden, 'a field the printed-line mask hides').not.toContain('x')
    expect(notHiddenWhole(WITH_A_SLASH)).toEqual([])
  })

  it('2: the same keys in base64url, keys holding a "+" and no "/", and keys of 16 bytes are hidden whole in the same places', () => {
    expect(IN_BASE64URL.every((key) => /^[A-Za-z0-9_-]+$/.test(key))).toBe(true)
    expect(notHiddenWhole(IN_BASE64URL)).toEqual([])
    expect(WITH_A_PLUS).toHaveLength(300)
    expect(notHiddenWhole(WITH_A_PLUS)).toEqual([])
    expect(OF_16_BYTES).toHaveLength(500)
    expect(notHiddenWhole(OF_16_BYTES)).toEqual([])
  })

  it('3: a key in hex is masked as the printed-line mask masks it, and no 8 characters of it are shown', () => {
    for (let at = 0; at < 300; at++) {
      const key = madeUpBytes(`r60-hex-${String(at)}`, 32).toString('hex')
      const text = `the key is ${key} here`
      const done = maskedForAHostJob(text)
      expect(done.text, `hex key ${String(at)}`).toBe(maskedAsAPrintedLine(text))
      expect(done.masked, `hex key ${String(at)}`).toBe(true)
      for (let from = 0; from + 8 <= key.length; from++) expect(done.text, `hex key ${String(at)}`).not.toContain(key.slice(from, from + 8))
    }
  })

  it('6: no 8 characters together of any key of the four sets are shown in any of the five places', () => {
    expect(shownInPart([...WITH_A_SLASH, ...IN_BASE64URL, ...WITH_A_PLUS, ...OF_16_BYTES])).toEqual([])
  })
})

describe('what a job prints is still shown', () => {
  it("4: this checkout's paths, paths holding ids and generated names, the toolchain's log names and camelCase names are left as they are", () => {
    const listed = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter((file) => file !== '')
    expect(listed.length).toBeGreaterThan(1000)
    // MADE-UP NOTES NAMED IN CAPITALS, as design/ROUND-TEN-FAILURE-MATRIX.md is. Capitals are more than three quarters
    // of their letters, so only the rule that counts two pieces in capitals as words keeps them shown. A copy of the
    // checkout without its notes, as the repository export makes, holds two paths named in capitals, so the case makes
    // its own. They come first, so a failure shows them.
    const words = ['ROUND', 'PLAN', 'MASK', 'AUDIT', 'CLOCK', 'LABEL', 'CORRECTION', 'BROWSER', 'HEALTH', 'NATIVE', 'WIDTH', 'ORACLE']
    const inCapitals = words.flatMap((first) => words.filter((second) => second !== first).map((second) => `design/${first}-${second}-METHOD-REVIEW.md`))
    const files = [...inCapitals, ...listed]
    const folders = [...new Set(files.flatMap((file) => file.split('/').slice(1).map((_, at) => file.split('/').slice(0, at + 1).join('/'))))]
    expect(files.filter((file) => /[A-Z]{3,}[-_][A-Z]{3,}/.test(file)).length, 'files named in capitals').toBeGreaterThan(100)
    expect(changed([...files, ...folders])).toEqual([])
    expect(changed([...files, ...folders].map((path) => `/srv/build/${path}`))).toEqual([])

    const withIds: string[] = []
    for (let at = 0; at < 300; at++) {
      const id = (what: string, length?: number): string => aMadeUpId(`${what}${String(at)}`, length)
      withIds.push(
        `/tmp/mole-office-${id('t', 6)}/home/out/run.log`,
        `refs/heads/wave-13q-supervisor-${id('e')}`,
        `/api/records/${id('a')}/links/${id('b')}`,
        `/api/records/${id('c')}/${id('d')}`,
        `dist/web/assets/chunk-${id('f', 8)}-${id('g', 8)}.js`,
        `node_modules/@types/node/v22-${id('h', 8)}`,
        `/srv/build/x86_64-linux-gnu/lib${id('k', 6)}.so`,
        `out/r60/${id('m')}/report-${id('n')}.json`,
      )
    }
    expect(changed(withIds)).toEqual([])

    // THE NAMES tools/q.mjs AND tools/settle-owed-runs.mjs GIVE THEIR FILES: a moment, then random hex characters or a
    // UUID. A moment holds one capital, its T. The logs are in a made-up checkout's .logs/, since a test names no fixed
    // path inside this one's.
    const logNames: string[] = []
    for (let at = 0; at < 300; at++) {
      const moment = fileNameStamp(new Date(Date.UTC(2026, at % 12, 1 + (at % 28), at % 24, at % 60, (at * 7) % 60, at)))
      const hex = madeUpBytes(`r60-log-${String(at)}`, 16).toString('hex')
      logNames.push(`/srv/build/.logs/tsc-${moment}-${hex.slice(0, 8)}.log`, `/srv/build/.logs/npm-run-build-${moment}-${hex.slice(8, 16)}.log`, `${moment}-${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}.json`)
    }
    expect(changed(logNames)).toEqual([])

    // THE CAMELCASE NAMES OF THIS CHECKOUT'S CODE, in a path and in a line of a stack. Only the texts the printed-line
    // mask leaves as they are count, since what it masks the host job mask masks too.
    const names = theCodesCamelCaseNames()
    const inForms = names.flatMap((name) => [`out/${name}`, `src/lib/${name}.ts`, `tests/${name}.test.ts`, `at ${name} (src/${name}.ts:1:2)`]).filter((text) => maskedAsAPrintedLine(text) === text)
    expect(names.filter((name) => name.length >= A_KEYS_LENGTH).length, 'names of a key\'s length').toBeGreaterThan(1000)
    expect(changed(inForms)).toEqual([])
  })

  it('7: a camelCase name of the code that the printed-line mask hides, with no "+", "/", "_" or "-" beside it, is masked as that mask masks it', () => {
    const hidden = theCodesCamelCaseNames().map((name) => `it calls ${name} here`).filter((text) => maskedAsAPrintedLine(text) !== text)
    expect(hidden.length, 'names the printed-line mask hides').toBeGreaterThan(20)
    expect(hidden.filter((text) => maskedForAHostJob(text).text !== maskedAsAPrintedLine(text))).toEqual([])
  })
})

describe('where a key in a path begins', () => {
  it("5: a path's first folders that are words stay shown before a generated name, and a key that begins with \"/\" is hidden from that \"/\"", () => {
    const generated = WITH_A_SLASH.slice(0, 50)
    for (const key of generated) {
      expect(maskedForAHostJob(`listening on /tmp/${key}.run/control.sock`).text).toBe(`listening on /tmp/${A_KEY_IN_BASE64}.run/control.sock`)
      expect(maskedForAHostJob(`/var/lib/${key}`).text).toBe(`/var/lib/${A_KEY_IN_BASE64}`)
    }
    const beginningWithASlash = madeUpKeys('r60-key', 20, (key) => key.startsWith('/'))
    for (const key of beginningWithASlash) expect(maskedForAHostJob(`the key is ${key} here`).text).toBe(`the key is ${A_KEY_IN_BASE64} here`)
  })
})
