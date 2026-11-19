// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13y, pages and speed. The browser's doors to the work page. Wave 13y's round 68 moved them here out
// of the one `api` object in src/web/api.ts; a line adds its new doors to its own part, and src/web/api-parts/join.ts
// joins every part into `api`.
import { request } from '../api.ts'
import type { WorkListReply, WorkPageReply } from '../../server/lib/worklist.ts'

export const workDoors = {

  // -------------------------------------------------------------------------- what you have to do

  /**
   * EVERY PIECE OF WORK IN EVERY PROJECT, one row each, with what it is part of and its hours.
   *
   * This is the supply for the cross-project work list, for the pane beside the writing box, and for
   * the picker that points a plan line at work that already exists. There is no filter, no search and
   * no way to name one project: it answers about all of them, and every row says which project owns
   * it. Narrowing is the reader's, in the browser, over rows it already has.
   *
   * THE WHOLE REPLY, not the rows. `counted`, `returned` and `leftOut` are how a page knows whether
   * it is showing all of the work or the first two thousand pieces of it, and `note` says which in
   * words. A wrapper that handed back `rows` alone would leave the screen unable to say that the list
   * was cut, which is the failure this file's header is about.
   *
   * `estimateHours` ON A ROW IS NULL WHEN NOBODY HAS SIZED THAT WORK. It is never zero for unknown,
   * and a cell that draws null as 0 is a claim nobody made. `hoursGiven` is a list of periods and not
   * a total: hours at a month, a week and a day are three answers to three questions and are never
   * added together.
   *
   * `shape: 'home'` asks for the fields the home page's standing count draws only — each row's
   * state, its project and whether it has hours, and the count the cap left out. The unshaped call
   * is the whole list and is unchanged; `#/plan` and `#/plans/<id>` still use it. See `homeWorkList` in
   * src/server/lib/worklist.ts for the measurement.
   */
  work: (opts: { shape?: 'home' } = {}) =>
    request<WorkListReply>(opts.shape === 'home' ? '/api/work?shape=home' : '/api/work'),
  /**
   * The list as the Work to do page draws it: every row without its title, its one line and `within`,
   * which that page does not draw. See `workPageList` in src/server/lib/worklist.ts.
   */
  workPage: () => request<WorkPageReply>('/api/work?shape=page'),
}
