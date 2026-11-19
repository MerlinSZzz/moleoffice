// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A DIRECTORY A PREVIEW MAY READ CAME FROM, AS A VALUE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A VALUE AND NOT A SENTENCE BUILT AT THE END
 * ---------------------------------------------------------------------------------------
 *
 * The roots in force are derived: the setting, the checkout, the directory agents write into, the
 * root of every registered repository of a project, every directory a work area names, and
 * whatever somebody added by hand. A reader of the Settings page has to be able to tell one from
 * another, and the honest way to say so is to carry WHERE each directory came from beside it all
 * the way from the code that derived it.
 *
 * A sentence assembled at the end from the list cannot do that. It would be a second place that
 * must know every kind of source, and the day a kind is added the sentence would quietly describe
 * the list wrong. So the kind travels as this closed union and the words are built from it at the
 * one place a person reads them.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS SHARED BECAUSE THE SERVER DERIVES IT AND THE PAGE DRAWS IT
 * ---------------------------------------------------------------------------------------
 *
 * `previewRoots()` in src/server/api/files.ts answers this shape. The Settings page's panel draws
 * it. Both sides import the type from here, so the page cannot invent a kind the server never
 * sends and the server cannot add one the page draws as nothing.
 */

/** Every way a directory can become one a preview may read. */
export type PreviewRootSource =
  /** A directory somebody named in MOLE_OFFICE_PREVIEW_ROOTS. */
  | { kind: 'env' }
  /** The Mole Office checkout this server is part of. */
  | { kind: 'checkout' }
  /** ~/.cache/mole-office, where this product's own agents put what they make. */
  | { kind: 'agents' }
  /** One folder beside the database that an upload door stores files in, when the checkout does not hold it. */
  | { kind: 'store'; store: string }
  /** The root of one repository registered in this project. */
  | { kind: 'repository'; repositoryId: string; repositoryName: string }
  /** One directory a registered work area of this project names, resolved under a repository root. */
  | { kind: 'workarea'; repositoryId: string; repositoryName: string; workArea: string }
  /** A directory somebody added by hand, with who and when. */
  | { kind: 'added'; addedBy: string; addedAt: string; why: string }

/** One directory a preview may read, as the door answers and the page draws it. */
export interface PreviewRootReading {
  /** The directory as it is used, after resolving. */
  path: string
  /** The same directory with every symlink on the way resolved. What containment is judged on. */
  canonical: string
  /** Where this directory came from. */
  source: PreviewRootSource
}

/**
 * WHICH READING OF A SOURCE A PERSON IS GIVEN, AND THE NAMES THAT GO INTO IT.
 *
 * This is the one place that decides it. The English below and the Settings panel, which says it
 * in the page's language, both build their words from this value. The names are content: they are
 * what somebody wrote, and no page language changes them.
 *
 * A directory added by hand is read with its reason when a reason was given, and without one when
 * the reason is empty or only spaces.
 */
export type HowARootCameFrom =
  | { reading: 'env' }
  | { reading: 'checkout' }
  | { reading: 'agents' }
  | { reading: 'store'; store: string }
  | { reading: 'repository'; name: string }
  | { reading: 'workarea'; area: string; name: string }
  | { reading: 'added'; at: string; by: string }
  | { reading: 'addedWhy'; at: string; by: string; why: string }

export function howARootCameFrom(source: PreviewRootSource): HowARootCameFrom {
  switch (source.kind) {
    case 'env':
    case 'checkout':
    case 'agents':
      return { reading: source.kind }
    case 'store':
      return { reading: 'store', store: source.store }
    case 'repository':
      return { reading: 'repository', name: source.repositoryName }
    case 'workarea':
      return { reading: 'workarea', area: source.workArea, name: source.repositoryName }
    case 'added':
      return source.why.trim() === ''
        ? { reading: 'added', at: source.addedAt, by: source.addedBy }
        : { reading: 'addedWhy', at: source.addedAt, by: source.addedBy, why: source.why }
  }
}

/**
 * What a person reads for one source, in plain English.
 *
 * It says where the directory came from rather than naming the mechanism that put it in the list.
 * A work area is named with the repository it was resolved against, because the same relative path
 * under two repositories is two different directories and the reader has to be able to tell which
 * one this is.
 */
export function whereARootCameFrom(source: PreviewRootSource): string {
  const how = howARootCameFrom(source)
  switch (how.reading) {
    case 'env':
      return 'Named in the preview-roots setting'
    case 'checkout':
      return 'This checkout of Mole Office'
    case 'agents':
      return 'Where this product’s agents put what they make'
    case 'store':
      return `The “${how.store}” folder beside the database`
    case 'repository':
      return `The root of repository “${how.name}”`
    case 'workarea':
      return `Work area “${how.area}” of repository “${how.name}”`
    case 'added':
      return `Added by hand on ${how.at} by ${how.by}`
    case 'addedWhy':
      return `Added by hand on ${how.at} by ${how.by} — ${how.why}`
  }
}
