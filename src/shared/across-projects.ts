// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PAGE ASKS A DOOR TO READ ACROSS PROJECTS, as decided on 29 September 2026.
 *
 * Goals, Counters, Context bundles and All records stand under All projects and read across
 * projects. Each door they read keeps the reading it has always had, narrowed by the request's
 * `x-mole-office-workspace` header, for the pages and tools that still use it. The reading across
 * projects is asked for beside it, with one query word, so the old reading answers exactly what it
 * answered before:
 *
 *   ?projects=all          every project the reader may read, each row naming its project
 *   ?projects=<project id> that one project, chosen on the page rather than taken from the header
 *   (no `projects` word)   the old reading, narrowed by the header, unchanged
 *
 * The server and the pages read these two names from here, so the word cannot drift between them.
 */
export const PROJECTS_QUERY = 'projects'

/** The value of `?projects=` that means every project the reader may read. */
export const EVERY_PROJECT = 'all'

/** What a page has chosen: every project, or one project by its id. */
export type ProjectChoice = typeof EVERY_PROJECT | (string & {})

/** The query string a page adds to a door to read what it has chosen. */
export function projectsQuery(choice: ProjectChoice): string {
  return `${PROJECTS_QUERY}=${encodeURIComponent(choice)}`
}
