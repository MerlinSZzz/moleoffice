// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW MANY TEST WORKERS ONE RUN OF THE WHOLE SUITE GETS, SAID ONCE (problem `EQdNjfnfFsXX`).
 *
 * Two things run the suite. A person or an agent runs `npm test`, and vitest.config.ts gives that
 * run `plain.count` workers. The office's merge queue runs it through
 * tools/merge-tool/documents.mjs, which reads the setting MOLE_OFFICE_MERGE_WORKERS; that
 * setting's default in src/config/settings.mjs is `queue.count`. Before this file the two numbers
 * were written in those two places, and nothing failed if one changed and the other did not.
 * This one place was agreed with wave 13j by message on 5 October 2026.
 *
 * WHY JAVASCRIPT. settings.mjs is plain JavaScript read by `node`, and vitest.config.ts can import
 * a `.mjs` file, so one file serves both.
 *
 * THE PLAIN RUN'S NUMBER, AND WHY IT IS NOT THE NUMBER OF PROCESSORS. This was the comment above
 * `maxWorkers` in vitest.config.ts until 5 October 2026, moved here whole:
 *
 * A browser file holds inotify instances, and Linux gives ONE USER 128 of them on the whole
 * machine, counting everything they are running: this owner's desktop, editor and shells were
 * holding 75 of them before the suite started. So the suite's share has to be small enough that
 * the rest of the machine still fits.
 *
 * TWELVE, BECAUSE 12 x 2 = 24. Measured on 31 August 2026 across full runs of all 526 files:
 * with no limit the peak was 128 of 128 and a file died of EMFILE with nothing to say for
 * itself; at twelve the peak was 100. Four full runs in five were red before this, always in a
 * file that passed on its own, which is the shape this fault always has.
 *
 * WHAT IT COSTS: 93 seconds became 133. That is the price of a number a person can believe.
 *
 * WHAT A WORKER HOLDS CHANGED ON 23 SEPTEMBER 2026, AND THIS NUMBER HAS NOT BEEN MEASURED
 * AGAIN. When the measurement above was taken, each of the browser files started a Vite and a
 * Chromium of its OWN. `liveApp` in tests/helpers.ts now serves every one of them a page built
 * once for the run, so no test starts a Vite, and a worker starts ONE Chromium that every file
 * in it shares. The count of instances is therefore per WORKER rather than per FILE, which can
 * only be fewer than what was measured. Twelve is kept because it is the number that was
 * measured and nothing here may claim a number nobody has run.
 *
 * THIS IS THE SUITE'S HALF OF THE FIX, NOT THE MACHINE'S. The other half is the machine's own
 * limit, and raising it is for the person who runs the machine, and needs root:
 *   sudo sysctl -w fs.inotify.max_user_instances=512
 * Nothing here does that, and nothing here should.
 *
 * THE MERGE QUEUE'S NUMBER is smaller because other waves test on the same machine while the queue
 * runs; its reason is in `queue.because`.
 */
export const THE_SUITE_WORKERS = Object.freeze({
  plain: Object.freeze({
    count: 12,
    because:
      'Measured on 31 August 2026 over full runs of all 526 files: with no limit a browser file ran the user out of ' +
      'inotify instances (128 of 128) and died of EMFILE; at 12 the peak was 100.',
  }),
  queue: Object.freeze({
    count: 8,
    because:
      'Measured on 23 and 24 September 2026 (note Hg2oAxAkvvg4): the whole suite took 31 minutes at 4 workers, 17 at 8 ' +
      'and 12 at 12, and every red at 8 and 12 was a browser test waiting on a page under load, which the run-alone ' +
      'step passes. 8 leaves room for the waves that test on the same machine.',
  }),
})
