// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Reserve a separate durable folder for each suite attempt, including after a tool restart. */
import './a-library-is-not-a-program.mjs'
import { mkdtempSync } from 'node:fs'
import { basename, join } from 'node:path'
import { aSuiteOnTheBoxOrHere } from './cloud-suite-door.mjs'

export function suiteAttempt(workdir, label) {
  const folder = mkdtempSync(join(workdir, `${label}-`))
  return join(basename(folder), label)
}

/** Run the production door with one reserved set of retained paths for this attempt. */
export async function runRetainedSuite({ workdir, label, written, keepTheReport, here, run, ...doorOptions }) {
  const attempt = suiteAttempt(workdir, label)
  const ran = await aSuiteOnTheBoxOrHere({
    ...doorOptions, label,
    here: async () => {
      const result = await here()
      return { ...result, outFile: keepTheReport(result.outFile, `${attempt}.log`) }
    },
    run: async (...args) => {
      const result = await run(...args)
      return { ...result, outFile: keepTheReport(result.outFile, `${attempt}-door.log`) }
    },
    keepTheLog: (file) => keepTheReport(file, `${attempt}.log`),
    keepTheBoxReport: (file) => keepTheReport(file, `${attempt}.on-the-box.json`),
  })
  return { ran, kept: keepTheReport(written, `${attempt}.json`) }
}
