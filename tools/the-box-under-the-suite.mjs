// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BOX UNDER THE SUITE (tools/cloud-suite.criteria.md, criterion 21). Hooks of the queue's suite on the cloud box
 * ran out of time, and no kept log said how busy the box was while they waited. While npm test runs, the door's remote
 * script reads the box's 1-minute load and its available memory every BOX_SAMPLED_EVERY_SEC seconds and writes one line
 * each time. `theBoxUnderTheSuite` works out what those lines say. The remote script carries its source, as it carries
 * aPassedFile, so it must use nothing outside itself. tools/merge-tool/cloud-suite-door.mjs reads the door's answer
 * with `aBoxLoad` and writes it on the suite's line.
 */

/** How often the box is read while the suite runs, in seconds. */
export const BOX_SAMPLED_EVERY_SEC = 15

/**
 * THE BOX'S CPUS (criterion 24). Pair suites ran at 20 workers with a 1-minute load near 33, and nobody had recorded
 * how many CPUs the box has. So the door's remote script counts them with nproc, on the host, before it makes anything,
 * and runs the suite at the runner file's worker count or at the CPUs, whichever is fewer. The answer gives `cpus`,
 * `workers`, the count used, and `runnerWorkers`, the count the runner file names. A box that cannot count its CPUs
 * runs nothing, and the door says so in these words.
 */
export const THE_CPUS_NOT_COUNTED = 'the cloud box could not count its CPUs'

/**
 * WHAT THE SAMPLER'S LINES SAY. Each line is the 1-minute load, a space and the available memory in kB; a line that is
 * not two such numbers is a time the sampler could not read them. Answers `{everySec, samples, notRead, load,
 * availableMemoryMb}`. `load` and `availableMemoryMb` are `{median, worst}`, the worst being the highest load and the
 * least memory, or null when nothing was read. A median of an even count is the mean of the two middle samples. The
 * load is given to two decimals and the memory to the whole MB.
 */
export function theBoxUnderTheSuite(text, everySec) {
  const lines = text.split('\n').filter((line) => line !== '')
  const read = lines.map((line) => /^(\d+(?:\.\d+)?) (\d+)$/u.exec(line)).filter((found) => found !== null)
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b)
    const half = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2
  }
  const measure = (values, worst, round) => (values.length === 0 ? null : { median: round(median(values)), worst: round(worst(...values)) })
  return {
    everySec,
    samples: read.length,
    notRead: lines.length - read.length,
    load: measure(read.map((found) => Number(found[1])), Math.max, (value) => Math.round(value * 100) / 100),
    availableMemoryMb: measure(read.map((found) => Number(found[2]) / 1024), Math.min, Math.round),
  }
}

/** Whether a door's `boxLoad` has the shape `theBoxUnderTheSuite` answers. */
export function aBoxLoad(value) {
  const count = (one) => Number.isInteger(one) && one >= 0
  const measure = (one) => one !== null && typeof one === 'object' && Number.isFinite(one.median) && Number.isFinite(one.worst)
  if (value === null || typeof value !== 'object' || !(Number.isFinite(value.everySec) && value.everySec > 0) || !count(value.samples) || !count(value.notRead)) return false
  return value.samples === 0 ? value.load === null && value.availableMemoryMb === null : measure(value.load) && measure(value.availableMemoryMb)
}
