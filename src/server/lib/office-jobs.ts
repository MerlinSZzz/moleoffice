// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Registered office jobs are requested by counters; the server starts no process.
 * A runner answers through POST /api/counters/<id>/firings/<seq>/answer.
 * The review timing runner uses its dedicated sandbox and timer. The periodic
 * main-suite runner polls for its registered job. The login reading runner starts
 * one short Claude round in its own sandbox and answers as soon as it has started.
 * No runner is started here.
 * Tests may register stand-in jobs to prove the same firing and answer path.
 */

/** One job the office knows how to want: its name, and what running it does, in one sentence. */
export interface OfficeJob {
  name: string
  what: string
}

/**
 * THE JOBS REGISTERED IN THIS PROCESS. Empty until something registers one.
 *
 * Module state, so it is per process and a test that opens a fresh database gets a fresh list. That
 * matches how the rest of the suite works: `freshDb()` resets the modules.
 */
const REGISTERED = new Map<string, OfficeJob>()

// Round 25's brief and agreement 80lYjOukId-X registered the review timing job.
// The periodic main-suite job is a request name for tools/periodic-main-suite.mjs;
// the separate counter and timer activation is outside this module.
import { MAIN_SUITE_JOB } from '../../config/main-suite-job.mjs'
import { TIMING_JOB } from '../../config/timing-job.mjs'
registerAnOfficeJob({ name: TIMING_JOB, what: 'Checks review press times on a quiet machine in the timing sandbox.' })
registerAnOfficeJob({ name: MAIN_SUITE_JOB, what: 'Runs the whole suite on main when its periodic counter requests it.' })
// Step 6 of problem LeL0ssxi2jje registered the login reading job, on decisions cG8h9dqwwwJ8 and WkJf0ZUspgnr;
// tools/run-the-login-reading.mjs answers it, and its timer is set up outside the repository.
import { LOGIN_READING_JOB } from '../../config/login-reading-job.mjs'
registerAnOfficeJob({ name: LOGIN_READING_JOB, what: 'Takes one short Claude round an hour in the login-reading sandbox, whose rate-limit event the office reads.' })
// Wave 13n round C registered the test catches job; tools/run-the-test-catches-job.mjs answers it each day.
import { TEST_CATCHES_JOB } from '../../config/test-catches-job.mjs'
registerAnOfficeJob({ name: TEST_CATCHES_JOB, what: 'Reads the merge queue each day, and once a week files one report of what each test file caught in the queue and on the lines, and how long it ran.' })

/** Every job the office knows of, in the order they were registered. */
export function theOfficeJobs(): OfficeJob[] {
  return [...REGISTERED.values()]
}

/** The job with this name, or null because the list does not hold it. */
export function theOfficeJobNamed(name: string): OfficeJob | null {
  return REGISTERED.get(name.trim()) ?? null
}

/**
 * REGISTER ONE JOB. The seam, and the only way a name gets onto the list.
 *
 * A second registration under one name replaces the first, so a test that registers its job in
 * `beforeEach` does not grow the list run after run.
 */
export function registerAnOfficeJob(job: OfficeJob): void {
  REGISTERED.set(job.name.trim(), { name: job.name.trim(), what: job.what })
}

/** Take a job off the list. A test that registered one puts the list back as it found it. */
export function forgetAnOfficeJob(name: string): void {
  REGISTERED.delete(name.trim())
}

/** The refusal for a counter naming a job nobody has registered. One sentence a person can act on. */
export function whyThatJobIsNotOnTheList(name: string): string {
  const jobs = theOfficeJobs()
  const known =
    jobs.length === 0
      ? 'The office has no registered jobs. Register the job with registerAnOfficeJob before a counter can ask for it.'
      : `The jobs the office knows are: ${jobs.map((job) => job.name).join(', ')}.`
  return `There is no office job called "${name}". ${known} Nothing was written.`
}
