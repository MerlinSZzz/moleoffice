// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE IMPLEMENTATION MAP'S VOCABULARY: NINE SOURCES, THREE TIERS, AND ONE FUNCTION THAT JOINS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS IN HERE
 * ---------------------------------------------------------------------------------------
 *
 * Three closed lists and one rule:
 *
 *   RELATIONS      what a relationship SAYS: implements, tests, configures
 *   PROVENANCE     where it CAME FROM: the owner's own nine sources, in the owner's order
 *   AUTHORITY      what a reader has to DECIDE FROM: stated, computed, guessed
 *   authorityOf()  the one statement of how the third is worked out from the second
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE NINE ARE THE OWNER'S NINE AND NOT A TIDIER SET
 * ---------------------------------------------------------------------------------------
 *
 * `design/ROUND-TEN-ADDENDUM.md` A.4 lists nine sources an implementation relationship may come
 * from and then gives the rule in one line: *"Do not flatten these into equal truth."* The nine
 * below are that list, word for word off it, and nothing was merged to make the table shorter.
 *
 * SIX OF THEM HAVE NO PRODUCER IN THIS BUILD AND ARE DECLARED ANYWAY, which is the part that looks
 * like speculative abstraction and is not. An empty list and an unasked question look identical on
 * a screen: a Module page showing no build-graph relationships is either saying *this module has
 * none* or *nothing has ever looked*. With the six declared, the page can say the second in three
 * words, and an agent receives them by name in `notLookedFor`. Nothing else is built for them —
 * no resolver, no interface, no configuration, no flag file. Nine words in a frozen list.
 *
 * `structure` is the one that is refused rather than merely unbuilt, and `PROVENANCE` says so on
 * the row: inferring a module from a directory name is A.3's *"Do NOT assume: Module = directory"*.
 *
 * ---------------------------------------------------------------------------------------
 * AUTHORITY IS COMPUTED AND IS NEVER A COLUMN
 * ---------------------------------------------------------------------------------------
 *
 * Storing both provenance and authority would be one fact worked out in two places, which
 * `CLAUDE.md` names as this repository's own recurring defect. There is no `authority` column in
 * `implementation_map` or in `implementation_findings`, and `authorityOf` is the only place the
 * three tiers are decided.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE OPENS A DATABASE OR IMPORTS ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared` is the layer both the browser and the server reach, so the word a normal reader
 * sees beside a guessed relationship is worked out from the same table the server writes rows
 * from, rather than from a second copy in the web bundle.
 */

// ============================================================================ what a row says

/**
 * The three relation words, and each has a measured instance in this checkout.
 *
 * `implements` — this code is where the meaning lives. Every module's claims today.
 * `tests`      — this code checks it. 5 of the 12 patterns on module T_FNIYu56FnA are `tests/*`.
 * `configures` — this code sets it up or builds it. drizzle.config.ts, vite.config.ts.
 *
 * WHY THREE AND NOT MORE. A.1 lists nine kinds of implementation resource, and most of them are
 * answered by the PATH rather than by a relation word: a deploy manifest is a file, and saying
 * `configures` about it is the whole of what Mole Office needs to know.
 *
 * `depends_on` IS DELIBERATELY ABSENT. A record's dependency on code it does not own is C.2's
 * *"Dependencies"*, and it is resolved THROUGH this map plus the import graph at read time rather
 * than stored again here. Storing it would be the same fact in two places.
 */
export const RELATIONS = ['implements', 'tests', 'configures'] as const
export type Relation = (typeof RELATIONS)[number]

/** Whether a string is one of the three relation words. */
export function isRelation(value: unknown): value is Relation {
  return typeof value === 'string' && (RELATIONS as readonly string[]).includes(value)
}

// ============================================================================ where it came from

/**
 * What a reader has to decide from, which is not the same as where the row came from.
 *
 * - `stated`   — somebody said it. It counts as ownership.
 * - `computed` — a resolver read the repository and worked it out. True about the code, silent
 *                about intent. Shown, counted separately, and never ownership.
 * - `guessed`  — a machine inferred it from something that is not the code. Shown as a proposal,
 *                counted separately, and it changes no number until somebody accepts it.
 */
export const AUTHORITIES = ['stated', 'computed', 'guessed'] as const
export type Authority = (typeof AUTHORITIES)[number]

/** One of A.4's nine sources, with everything the product needs to say about it. */
export interface ProvenanceEntry {
  /** The owner's own phrase for this source, from ROUND-TEN-ADDENDUM.md A.4, quoted. */
  readonly phrase: string
  /**
   * WHAT A PERSON READS INSTEAD OF THE STORED WORD. Required, so a tenth source cannot be declared
   * without one: the field is on the interface and `satisfies` checks every row against it, which
   * is the same charge `words.ts` puts on a new record kind.
   *
   * It is NOT `phrase`. The phrase is the owner's wording from A.4 and it is quoted so a reader can
   * find the row in the addendum — "explicit human/Agent declaration" is a specification's words,
   * with a slash in the middle of it, and it is the wrong length and the wrong voice for a mark
   * beside a path. `provenanceWord` in `src/shared/words.ts` is what a surface calls, and this is
   * the table it reads.
   */
  readonly reading: string
  /** Which of the two relation tables a row of this provenance lives in. */
  readonly table: 'map' | 'findings'
  /** The tier a row of this provenance carries before anybody accepts it. */
  readonly tier: Authority
  /**
   * What produces rows of this provenance in THIS build, or null because nothing does.
   *
   * `null` is what every surface reads to say *nobody has looked*, and it is the reason the six
   * unbuilt values are declared rather than left out. It is not a flag somebody flips by hand: a
   * resolver arriving fills this in, in the same commit, and `notLookedFor()` shortens by one.
   */
  readonly producer: string | null
  /** Why there is no producer, when there is none and the reason is a refusal rather than a gap. */
  readonly refused: string | null
}

/**
 * A.4's nine, in A.4's order.
 *
 * The `phrase` column is the owner's wording and is quoted rather than paraphrased, so that a
 * reader of this table can find each row in `design/ROUND-TEN-ADDENDUM.md` and check it.
 */
export const PROVENANCE = {
  declared: {
    phrase: 'explicit human/Agent declaration',
    reading: 'somebody said so',
    table: 'map',
    tier: 'stated',
    producer: 'a person or an agent, through POST /api/implementation',
    refused: null,
  },
  structure: {
    phrase: 'repository/directory structure',
    reading: 'the shape of the directories',
    table: 'findings',
    tier: 'computed',
    producer: null,
    refused:
      'A structure resolver would say: this module is called Perception, this directory is called ' +
      'perception/, therefore the module owns the directory. A.3 opens "Do NOT assume:" followed by ' +
      '"Module = directory", and L names "reduce Module to directory" as a failure mode. The value is ' +
      'declared and no producer is built. What reopens it: a repository whose directory names really ' +
      'are its module names, where the same statement is being typed dozens of times.',
  },
  manifest: {
    phrase: 'package manifests',
    reading: 'a package manifest',
    table: 'findings',
    tier: 'computed',
    producer: null,
    refused: null,
  },
  imports: {
    phrase: 'import/include graphs',
    reading: 'what this code imports',
    table: 'findings',
    tier: 'computed',
    producer: 'the import resolver, over source_files.imports',
    refused: null,
  },
  build_graph: {
    phrase: 'build graph',
    reading: 'the build graph',
    table: 'findings',
    tier: 'computed',
    producer: null,
    refused: null,
  },
  launch_config: {
    phrase: 'launch/config relationships',
    reading: 'a launch or configuration file',
    table: 'findings',
    tier: 'computed',
    producer: null,
    refused: null,
  },
  observed_write: {
    phrase: 'observed historical modifications',
    reading: 'files seen changing',
    table: 'map',
    tier: 'guessed',
    producer: null,
    refused:
      'Mole Office does not run git, and a test keeps it that way. What replaces it is exact for the ' +
      'question that matters — comparing two builds of source_file_hashes gives exactly which files ' +
      'changed — but observing a write does not produce a relationship on its own: "these files ' +
      'changed while an agent said it was doing Perception" is a correlation. A producer would also ' +
      'fill an authored, exported, change-logged table with machine rows, which is the flooding the ' +
      'file index is kept out of `records` to avoid.',
  },
  analysis: {
    phrase: 'deterministic dependency analysis',
    reading: 'dependency analysis',
    table: 'findings',
    tier: 'computed',
    producer: null,
    refused: null,
  },
  llm: {
    phrase: 'LLM inference',
    reading: 'a language model read it',
    table: 'map',
    tier: 'guessed',
    producer: 'an agent, through POST /api/implementation with "proposing": true',
    refused: null,
  },
} as const satisfies Record<string, ProvenanceEntry>

/** The nine names, in A.4's order. */
export const PROVENANCES = Object.keys(PROVENANCE) as readonly Provenance[]
export type Provenance = keyof typeof PROVENANCE

/** Whether a string is one of the nine. */
export function isProvenance(value: unknown): value is Provenance {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVENANCE, value)
}

/** The provenance values a row of `implementation_map` may carry. */
export const MAP_PROVENANCES: readonly Provenance[] = PROVENANCES.filter((p) => PROVENANCE[p].table === 'map')

/** The provenance values a row of `implementation_findings` may carry. */
export const FINDING_PROVENANCES: readonly Provenance[] = PROVENANCES.filter(
  (p) => PROVENANCE[p].table === 'findings',
)

/**
 * The provenance values nothing in this build produces.
 *
 * THIS IS THE FIFTH INVARIANT ON THE WIRE. Every read of the map carries it, so that neither a
 * person nor an agent can read an absent build-graph relationship as *there is none*. It is
 * computed from the table above rather than typed, so a resolver landing shortens it in the same
 * commit that adds the producer, and there is no second list to forget.
 */
export function notLookedFor(): Provenance[] {
  return PROVENANCES.filter((p) => PROVENANCE[p].producer === null)
}

// ============================================================================ the one rule

/**
 * What a stored row means to a reader: `stated`, `computed` or `guessed`.
 *
 * A GUESS BECOMES OWNERSHIP ONLY WHEN A PERSON ACCEPTED IT. `POST /api/implementation/:id/accept`
 * refuses a non-human, so in a corpus this server wrote, `accepted_by` beginning `human:` is the
 * only value that can be there.
 *
 * WHY THIS READS THE STORED STRING AS WELL AS THE WRITE GATE CHECKING THE ACTOR, when this
 * codebase's rule is that a permission lives in one place. IT IS NOT A SECOND COPY OF THE
 * PERMISSION. The gate answers *may this request accept*; this answers *what does a stored row
 * mean*. The reason it is needed is the one `humanLinked` in `api/needs-you.ts` already gives for
 * reading the change log after the settle-fork gate was added: rows arriving through an archive
 * were written on a machine where that gate may not have been standing. `implementation_map` is
 * exported and imported, so for this table it is not hypothetical. A row whose `accepted_by` is
 * `agent:something` reads as `guessed` here, whoever wrote it and wherever it came from.
 *
 * `acceptedAt` AND `acceptedBy` ARE BOTH REQUIRED, because half an acceptance is not one: a row
 * with a date and no name cannot say who owns the decision, and a row with a name and no date
 * cannot say when the corpus changed meaning.
 */
export function authorityOf(
  provenance: Provenance,
  acceptedAt: string | null,
  acceptedBy: string | null,
): Authority {
  if (provenance === 'declared') return 'stated'
  if (acceptedAt !== null && acceptedBy !== null && acceptedBy.startsWith('human:')) return 'stated'
  return PROVENANCE[provenance].tier
}

/**
 * WHAT A NORMAL READER IS TOLD, AND IT IS TOLD WITHOUT BEING ASKED.
 *
 * A.4: *"An LLM guess must not silently become canonical ownership."* The word `silently` is the
 * one this table answers. `projections.md` audit row 9 used to give the membership to a normal
 * reader and the derivation to a developer; under A.4 that is wrong, because the membership itself
 * may be a guess. So the row splits: THAT a machine worked it out or guessed it is normal-mode
 * content; WHICH resolver, WHICH evidence and WHICH build stay in Developer mode.
 *
 * A WORD AND A GLYPH, NO HUE. Colour alone would carry the whole distinction for a reader who
 * cannot see it, and `tokens.css` has no colour for this and is not gaining one.
 *
 * THIS TABLE IS THE ENGLISH, and the word lists read it: `g2b.impl.says.<authority>.word` and
 * `.meaning` in src/shared/words/en.ts are this table's entries, so the record page's `t()` and the
 * server say the same words. It stays the source because the word lists import this file, through
 * src/shared/words.ts, and a file the word lists import cannot import them back without failing to
 * load (problem qdtawpOHQh-B). The `refused` paragraphs of `PROVENANCE` are read the same way, as
 * `g2b.impl.refused.<provenance>`.
 */
export const AUTHORITY_SAYS: Record<Authority, { word: string; glyph: string; meaning: string }> = {
  stated: {
    word: 'stated',
    glyph: '',
    meaning: 'somebody said this on purpose. It counts as ownership.',
  },
  computed: {
    word: 'worked out by Mole Office',
    glyph: '=',
    meaning:
      'a resolver read the repository and worked this out. It is true about the code and says nothing ' +
      'about what anybody intended, so it never becomes ownership.',
  },
  guessed: {
    word: 'guessed by a machine',
    glyph: '?',
    meaning:
      'a machine inferred this from something that is not the code. It is a proposal, and it changes ' +
      'no count until a person accepts it.',
  },
}

/**
 * The sentence a developer reads about one finding, composed from the two stored facts.
 *
 * THE SENTENCE IS NOT STORED AND THIS IS WHY. The owner's rule is *"Do not store explanatory prose
 * when you can store the fact that generated the explanation."* One column holding
 * `src/web/pages/HomePage.tsx imports ./RecordPage.tsx` costs three things: nothing can group
 * findings by importing file, nothing can answer which specifier produced one, and the work-domain
 * thread's forward read from an observed path needs a join to `evidence_path` that a sentence
 * cannot offer.
 */
export function evidenceSentence(evidencePath: string, provenance: Provenance, evidenceDetail: string): string {
  if (provenance === 'imports') return `${evidencePath} imports ${evidenceDetail}`
  return `${evidencePath}: ${evidenceDetail}`
}
