// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STARTUP JOURNALS THE CLOUD BOX KEEPS (tools/cloud-suite.criteria.md, criterion 22).
 *
 * A test file whose startup hook fails copies its journal of startup stages to
 * `<clone>/.logs/setup-waits-<sha256>-<pid>.jsonl` (tests/a-start-keeps-its-waits.ts). The page and API builds for
 * the tests name the process that holds their lock in `dist/web-for-tests-lock/who.txt`,
 * `dist/web-build-lock/who.txt` and `dist/server-for-tests-lock/who.txt`. A lock's who.txt is still there only when
 * its holder ended without letting it go; who took each lock, let it go, waited for it and removed it is in the
 * startup journals. The door
 * tools/cloud-suite.mjs removes the clone after the run, so the box copies these first, bounded, into the folder beside
 * the suite log, and the door masks them as a printed line before it puts them in place.
 */
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { maskedAsAPrintedLine } from '../src/config/inspection-ending.mjs'

/** The most of one file the box keeps, in bytes. */
export const ONE_JOURNAL_KEEPS_AT_MOST = 64 * 1024
/** The most of all the files together the box keeps, in bytes. */
export const THE_JOURNALS_KEEP_AT_MOST = 1024 * 1024
/** What the box looks for, by its path in the clone. */
export const THE_JOURNALS_LOOKED_FOR = ['.logs/setup-waits-*.jsonl', 'dist/server-for-tests-lock/who.txt', 'dist/web-for-tests-lock/who.txt', 'dist/web-build-lock/who.txt']
const THE_INDEX = 'index.json'

/** The folder beside the suite log, named after it: `suite.log` keeps its journals in `suite-startup-journals`. */
export const theJournalsBeside = (log) => join(dirname(log), `${basename(log).replace(/\.log$/, '')}-startup-journals`)

/**
 * RUNS ON THE BOX, after npm test and any runs alone, given node:fs. Keep this function self-contained: the door
 * writes its source into the remote script. A file over its bound keeps its whole lines within it and ends with a JSON
 * line saying it was cut. Once the bound of all cuts a file, no later file is copied.
 */
export function keepTheStartupJournals(fs, clone, folder, oneAtMost, allAtMost, lookedFor) {
  const found = []
  let names = []
  try { names = fs.readdirSync(`${clone}/.logs`) } catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const name of names.filter((one) => /^setup-waits-[0-9a-f]{64}-[0-9]+\.jsonl$/.test(one)).sort()) found.push({ from: `.logs/${name}`, file: name })
  for (const lock of ['server-for-tests-lock', 'web-for-tests-lock', 'web-build-lock']) {
    const from = `dist/${lock}/who.txt`
    if (fs.existsSync(`${clone}/${from}`)) found.push({ from, file: `${lock}-who.txt` })
  }
  fs.mkdirSync(folder)
  const allWords = `the bound of ${allAtMost} bytes for all the journals was reached`
  let left = allAtMost
  let spent = false
  const files = found.map(({ from, file }) => {
    const path = `${clone}/${from}`
    const stat = fs.lstatSync(path)
    if (!stat.isFile()) throw new Error(`${from} is not a regular file`)
    const bytes = stat.size
    if (spent) return { from, bytes, notKept: allWords }
    const byAll = left < oneAtMost
    const window = Math.min(bytes, oneAtMost, left)
    const read = Buffer.alloc(window)
    const fd = fs.openSync(path, 'r')
    try { for (let at = 0; at < window;) { const got = fs.readSync(fd, read, at, window - at, at); if (got === 0) throw new Error(`${from} ended before its size`); at += got } } finally { fs.closeSync(fd) }
    if (bytes <= window) {
      fs.writeFileSync(`${folder}/${file}`, read)
      left -= bytes
      return { from, file, bytes, keptBytes: bytes }
    }
    if (byAll) spent = true
    const bound = byAll ? `the bound of ${allAtMost} bytes for all the journals` : `the bound of ${oneAtMost} bytes for one file`
    const end = read.lastIndexOf(10) + 1
    if (end === 0) return { from, bytes, notKept: byAll ? allWords : `no whole line of it fits in ${bound}` }
    const cut = `the cloud box kept the first ${end} of ${bytes} bytes of this file, its whole lines within ${bound}`
    fs.writeFileSync(`${folder}/${file}`, Buffer.concat([read.subarray(0, end), Buffer.from(`${JSON.stringify({ cut })}\n`)]))
    left -= end
    return { from, file, bytes, keptBytes: end, cut }
  })
  fs.writeFileSync(`${folder}/index.json`, JSON.stringify({ oneAtMost, allAtMost, lookedFor, files }))
}

/** Every copied file, masked as a printed line. The index holds only the box's own words, sizes and file names. */
export function maskTheJournals(folder) {
  for (const name of readdirSync(folder)) {
    if (name === THE_INDEX) continue
    const path = join(folder, name)
    writeFileSync(path, maskedAsAPrintedLine(readFileSync(path, 'utf8')))
  }
}

/**
 * THE JOURNALS THE BOX RETURNED, counted from their index: how many files were kept, how many cut and how many not
 * kept. An index that does not name exactly the files in the folder, or names bounds other than these, is refused.
 */
export function theJournalsKept(folder) {
  const wrong = () => { throw new Error('the cloud box returned startup journals that do not match their index') }
  let index
  try { index = JSON.parse(readFileSync(join(folder, THE_INDEX), 'utf8')) } catch { wrong() }
  if (index === null || typeof index !== 'object' || index.oneAtMost !== ONE_JOURNAL_KEEPS_AT_MOST || index.allAtMost !== THE_JOURNALS_KEEP_AT_MOST ||
      JSON.stringify(index.lookedFor) !== JSON.stringify(THE_JOURNALS_LOOKED_FOR) || !Array.isArray(index.files)) wrong()
  const kept = []
  let cut = 0, notKept = 0
  for (const one of index.files) {
    if (one === null || typeof one !== 'object' || typeof one.from !== 'string' || !Number.isSafeInteger(one.bytes)) wrong()
    if (typeof one.notKept === 'string' && one.file === undefined && one.keptBytes === undefined && one.cut === undefined) { notKept += 1; continue }
    if (typeof one.file !== 'string' || one.file === THE_INDEX || one.file !== basename(one.file) || !Number.isSafeInteger(one.keptBytes) ||
        one.keptBytes > one.bytes || (one.keptBytes < one.bytes) !== (typeof one.cut === 'string') || one.notKept !== undefined) wrong()
    if (one.cut !== undefined) cut += 1
    kept.push(one.file)
  }
  const there = readdirSync(folder).filter((name) => name !== THE_INDEX)
  if (new Set(kept).size !== kept.length || there.length !== kept.length || kept.some((name) => !there.includes(name) || !lstatSync(join(folder, name)).isFile())) wrong()
  return { folder, files: kept.length, cut, notKept }
}
