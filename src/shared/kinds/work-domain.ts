// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `work_domain`, one stretch of top-level work.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, `ACKNOWLEDGE_STANCES`, `COULD_NOT_DO`, `DIFF_ROWS`, `ENTRY_SHAPES` AND
 * `RESPONSE_OUTCOMES` FROM ../workdomain.ts, AND `AUTHORITIES` AND `PROVENANCES` FROM
 * ../implementation.ts. IT IMPORTS NOTHING FROM THE CENTRAL FILE.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { ACKNOWLEDGE_STANCES, COULD_NOT_DO, DIFF_ROWS, ENTRY_SHAPES, RESPONSE_OUTCOMES } from '../workdomain.ts'
import { AUTHORITIES, PROVENANCES } from '../implementation.ts'

export const workDomainKind: KindSpec = {
    kind: 'work_domain',
    purpose:
      'ONE STRETCH OF TOP-LEVEL WORK: what an agent said it would do BEFORE Mole Office told it anything, what the ' +
      'machine then resolved, what the agent said about each difference, and what was accepted. Two agents ' +
      'working on the same files are told about each other from these.',
    whenToRecord:
      'At the START of a stretch of work, before asking Mole Office what it knows. The ordering is the point: an ' +
      'agent that reads the answer first is agreeing with a machine rather than being criticised by one. File ' +
      'the hypothesis, then POST /api/work-domains/<id>/resolve, then answer the differences and accept. One ' +
      'session may file several over its life; each is a separate stretch of work.',
    humanOnly: false,
    fields: [
      {
        key: 'objective',
        type: 'string',
        required: true,
        description: 'What this work is FOR, in one or two plain sentences. Not a list of files — that is `writes`.',
        example: 'Replace the placeholder intrinsics with a measured fit and prove the projection error on real frames.',
      },
      {
        key: 'agent',
        type: 'string',
        required: true,
        description:
          'THE ID OF THE `agent` RECORD THIS WORK BELONGS TO — the durable identity, not the run. It is who an ' +
          'overlap is told to, and a process that has died is still addressable through it.',
        example: 'xLdPU5wH5xvY',
      },
      {
        key: 'session',
        type: 'string',
        required: true,
        description:
          'THE ID OF THE `session` RECORD THAT FILED IT. Whose writes are attributed to this domain. Refused ' +
          'when that session already says it ran as a DIFFERENT agent in this project: two statements of who is ' +
          'doing this work, free to disagree, is this repository\'s own named defect.',
        example: 'f5BLz9ndVUsu',
      },
      {
        key: 'writes',
        type: 'string[]',
        required: false,
        description:
          'PATHS OR DIRECTORIES YOU EXPECT TO MODIFY, EXACTLY AS YOU WRITE THEM. Nothing is trimmed, expanded or ' +
          'normalised: every one of those is an interpretation, and interpretation lands in `resolved`, where it ' +
          'is attributed to the resolver and dated, beside what you wrote.',
        example: ['perception/calibration/closeup.py', 'config/closeup_intrinsics.yaml'],
      },
      {
        key: 'creates',
        type: 'string[]',
        required: false,
        description: 'Paths you expect to CREATE, exactly as written. Same rule as `writes`.',
        example: ['perception/calibration/tests/test_closeup_fit.py'],
      },
      {
        key: 'dependsOn',
        type: 'string[]',
        required: false,
        description:
          'Paths you RELY ON and do not intend to modify, exactly as written. Changing one of these later is ' +
          'reported as drift, in its own words rather than as an ordinary change.',
        example: ['perception/transforms.py'],
      },
      {
        key: 'repository',
        type: 'string',
        required: false,
        description:
          'WHICH REPOSITORY UNQUALIFIED PATHS ARE RELATIVE TO. An opaque key Mole Office never resolves; it is ' +
          'compared for equality against another domain\'s. Required when the project indexes more than one ' +
          'repository — otherwise an unprefixed path resolves to `unresolved` and says which repositories there ' +
          'are, rather than picking one.',
        example: 'mole-office',
      },
      {
        key: 'resolved',
        type: 'Resolution',
        required: false,
        description:
          'WRITTEN ONLY BY POST /api/work-domains/<id>/resolve. What the machine made of your paths, with the ' +
          'resolver version, the index it read and what it could not do. An ordinary PATCH that sends this is ' +
          'refused: an agent that can write its own resolver finding is not being criticised by one.',
        example: { at: '2026-08-26 09:12', resolver: 'wd-1', couldNotDo: { checked: true, items: [] } },
      },
      {
        key: 'responses',
        type: 'WorkDomainResponse[]',
        required: false,
        description: 'WRITTEN ONLY BY the accept route. What you said about each difference, one entry per key or row.',
        example: [{ key: 'extra_semantic:37jKRBaZWcdR', outcome: 'accept' }],
      },
      {
        key: 'accepted',
        type: 'AcceptedDomain',
        required: false,
        description:
          'WRITTEN ONLY BY the accept route. The accepted domain, stated by you rather than assembled by Mole Office ' +
          'out of outcome words, and frozen: every later overlap and every drift read compares against it.',
        example: { at: '2026-08-26 09:20', writes: ['perception/calibration/closeup.py'] },
      },
      {
        key: 'acknowledged',
        type: 'Acknowledgement[]',
        required: false,
        description:
          'WRITTEN ONLY BY the acknowledge route. What you decided about one overlap: carrying on, waiting, or ' +
          'having narrowed because of it. It is a statement, never a lock — nothing here refuses anybody\'s write.',
        example: [{ key: 'wdA|wdB|src/shared/time.ts', stance: 'continuing' }],
      },
      {
        key: 'closedAt',
        type: 'date',
        required: false,
        description:
          'WHEN THE WORK STOPPED. Absent means it has not, and nothing closes one for you: a domain silent for ' +
          'eleven days is drawn as silent for eleven days, not as finished.',
        example: '2026-08-26',
      },
      ...commonFields('work_domain'),
    ],
    rules: [
      '`agent` names a live record of kind `agent` in this project, and `session` a live record of kind ' +
        '`session`. Neither is a link: `part_of` is single-parent containment, and spending a domain\'s one ' +
        'parent on its session would refuse it a parent anywhere else.',
      'when that session already says it ran as a different agent in this project, the write is refused naming ' +
        'both and saying which to change.',
      '`resolved`, `responses`, `accepted` and `acknowledged` are written by their routes and are refused ' +
        'through the ordinary PATCH door. Without that, an agent writes its own resolver finding and the whole ' +
        'mechanism collapses into one field it controls.',
      'after acceptance, `objective`, `writes`, `creates` and `dependsOn` are frozen to the agent. Before it, ' +
        'editing them is the point. Accept again with a different `accepted` — that writes a new revision and ' +
        'keeps both readings.',
    ],
    example: {
      objective: 'Replace the placeholder intrinsics with a measured fit and prove the projection error on real frames.',
      agent: 'xLdPU5wH5xvY',
      session: 'f5BLz9ndVUsu',
      writes: ['perception/calibration/closeup.py', 'config/closeup_intrinsics.yaml'],
      creates: ['perception/calibration/tests/test_closeup_fit.py'],
      dependsOn: ['perception/transforms.py'],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const WORK_DOMAIN_SHAPES: Record<string, ShapeSpec> = {
  // ------------------------------------------------- what a work domain stores
  //
  // THE FIVE SHAPES BELOW ARE WHAT THE ROUTES OF A WORK DOMAIN WRITE, and they are declared here
  // for the same reason every other stored shape is: this is the checker that runs on every write
  // and the documentation an agent reads over HTTP. Their vocabularies — the codes, the entry
  // shapes, the outcome words, the stances — are in @shared/workdomain.ts, which is where the
  // browser and the server both read them, and nothing here restates one.
  //
  // A FACT MOLE OFFICE DOES NOT HAVE IS AN ABSENT KEY, NEVER A NULL. None of these five shapes
  // declares `| null`, because here a stored null would be a third answer beside *absent* and
  // *known*, which is exactly the confusion these fields exist to remove.

  ResolvedEntry: {
    name: 'ResolvedEntry',
    description:
      'ONE PATH THE AGENT WROTE, AND WHAT THE MACHINE MADE OF IT. Both, side by side: `asWritten` is the agent\'s ' +
      'own string and nothing ever rewrites it, and everything else is the resolver\'s reading. A reading that ' +
      'could not be made leaves its key out and says why in `note`.',
    fields: [
      { key: 'asWritten', type: 'string', required: true, description: 'Exactly what the agent wrote. Never trimmed, expanded or normalised.', example: 'src/shared/time.ts' },
      { key: 'repository', type: 'string', required: false, description: 'Which repository it is relative to, as an opaque key. Absent when nobody could say.', example: 'mole-office' },
      { key: 'path', type: 'string', required: false, description: 'The repository-relative path it resolved to. Absent when it did not resolve.', example: 'src/shared/time.ts' },
      { key: 'shape', type: unionOf(ENTRY_SHAPES), required: true, description: 'How it was read. `unindexed` is a path the index does not hold; `unresolved` is one nothing could place at all.', example: 'file' },
      { key: 'files', type: 'number', required: false, description: 'How many indexed files it covers. Absent when nobody could count, which is not zero.', example: 1 },
      { key: 'modules', type: 'string[]', required: false, description: 'RECORD IDS ONLY. A title is read when the entry is read; a stored title is the old title for ever.', example: ['37jKRBaZWcdR'] },
      { key: 'provenance', type: unionOf(PROVENANCES), required: false, description: 'How the strongest module row was reached. The Implementation Map\'s vocabulary, not a second one.', example: 'declared' },
      { key: 'authority', type: unionOf(AUTHORITIES), required: false, description: 'What that provenance is worth. A `guessed` row never holds an accept open.', example: 'stated' },
      { key: 'note', type: unionOf(COULD_NOT_DO), required: false, description: 'Why it could not be resolved, as a CODE. The sentence is composed at read by `sayCouldNotDo`.', example: 'not_indexed' },
    ],
  },

  CouldNotDoReport: {
    name: 'CouldNotDoReport',
    description:
      'WHAT THE RESOLVER COULD NOT DO. `checked: true` means it finished and `items` is the complete list, possibly ' +
      'empty. `checked: false` means it did not, and `because` says why. AN EMPTY LIST IS NEVER AN ANSWER ON ITS ' +
      'OWN, which is the whole reason this is two keys rather than an array.',
    fields: [
      { key: 'checked', type: 'boolean', required: true, description: 'Whether the resolver finished.', example: true },
      { key: 'items', type: 'CouldNotDoItem[]', required: false, description: 'Present when `checked` is true. May be empty, and an empty one means the resolver looked and found nothing to report.', example: [{ code: 'not_indexed', inputs: { path: 'config/clamp.yaml' } }] },
      { key: 'because', type: unionOf(COULD_NOT_DO), required: false, description: 'Present when `checked` is false: the one thing that stopped it, and the ONLY key that says the resolver did not finish. An absent `items` beside `checked: true` reads as an empty list; an absent `because` beside `checked: false` would be a report that says nothing, and the resolve route refuses to build one.', example: 'no_file_index' },
    ],
  },

  CouldNotDoItem: {
    name: 'CouldNotDoItem',
    description: 'One thing the resolver could not do, as a code and the values its sentence needs.',
    fields: [
      { key: 'code', type: unionOf(COULD_NOT_DO), required: true, description: 'Which limit this is.', example: 'imports_unresolved' },
      { key: 'inputs', type: 'Record<string, string>', required: false, description: 'The values the sentence for this code names. Read by `sayCouldNotDo`, never drawn raw.', example: { path: 'src/shared/time.ts' } },
    ],
  },

  Resolution: {
    name: 'Resolution',
    description:
      'WHAT ONE RUN OF THE RESOLVER CONCLUDED. Written only by POST /api/work-domains/<id>/resolve, as its own ' +
      'revision, so the history holds what the agent believed and what the machine answered as two separate ' +
      'moments rather than one merged state.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When it was resolved.', example: '2026-08-26 09:12' },
      { key: 'resolver', type: 'string', required: true, description: 'THE RESOLVER VERSION. Bumped when the rules change, so a stored conclusion says what made it and an old one can be told from a new one.', example: 'wd-1' },
      { key: 'index', type: 'ResolvedAgainstIndex', required: false, description: 'The file index this was resolved against. Absent when there was none, which is a real answer and not a failure.', example: { builtAt: '2026-08-26 08:00', root: '/srv/mole-office-fixtures/mole-office', fileCount: 1155 } },
      { key: 'map', type: 'ResolvedAgainstMap', required: false, description: 'When the Implementation Map answered. Absent until it does.', example: { readAt: '2026-08-26 09:12' } },
      { key: 'writes', type: 'ResolvedEntry[]', required: false, description: 'The `writes` entries, resolved.', example: [{ asWritten: 'src/shared/time.ts', shape: 'file' }] },
      { key: 'creates', type: 'ResolvedEntry[]', required: false, description: 'The `creates` entries, resolved.', example: [{ asWritten: 'src/shared/new.ts', shape: 'unindexed' }] },
      { key: 'dependsOn', type: 'ResolvedEntry[]', required: false, description: 'The `dependsOn` entries, resolved.', example: [{ asWritten: 'src/shared/time.ts', shape: 'file' }] },
      { key: 'semantic', type: 'ResolvedSemantic', required: false, description: 'The records the agent named, and the ones the resolver found beside them.', example: { declared: ['37jKRBaZWcdR'] } },
      { key: 'couldNotDo', type: 'CouldNotDoReport', required: true, description: 'NEVER OMITTED. A resolution that quietly answers a smaller question than it was asked is the failure this field exists to stop.', example: { checked: true, items: [] } },
    ],
  },

  ResolvedAgainstIndex: {
    name: 'ResolvedAgainstIndex',
    description: 'The file index a resolution or an acceptance was made against. Its build stamp is where a drift window begins.',
    fields: [
      { key: 'builtAt', type: 'date', required: true, description: 'When that index was built.', example: '2026-08-26 08:00' },
      { key: 'root', type: 'string', required: true, description: 'The root that was scanned.', example: '/srv/mole-office-fixtures/mole-office' },
      { key: 'fileCount', type: 'number', required: false, description: 'How many files it held.', example: 1155 },
      {
        key: 'scanId',
        type: 'string',
        required: false,
        description:
          'THE SCAN THAT BUILT IT, BY ITS ID AND NOT BY ITS STAMP. A build stamp is local wall clock to the second, ' +
          'so two rebuilds inside one second share one — and a drift window whose floor was a stamp would either ' +
          'count the accepting scan`s own observations as change, or drop a real change that landed in the same ' +
          'second. The id settles it exactly. Absent when that scan saw nothing to record.',
        example: 'aZ4kQm2xTb90',
      },
    ],
  },

  ResolvedAgainstMap: {
    name: 'ResolvedAgainstMap',
    description: 'When the Implementation Map answered this resolution.',
    fields: [{ key: 'readAt', type: 'date', required: true, description: 'The stamp of the read.', example: '2026-08-26 09:12' }],
  },

  ResolvedSemantic: {
    name: 'ResolvedSemantic',
    description: 'The records this work is about: the ones the agent declared, and the ones the resolver found from its paths.',
    fields: [
      { key: 'declared', type: 'string[]', required: false, description: 'The `about` links, as record ids and nothing else.', example: ['37jKRBaZWcdR'] },
      { key: 'discovered', type: 'DiscoveredRecord[]', required: false, description: 'Records the resolver reached from the paths, which the agent did not name.', example: [{ recordId: '37jKRBaZWcdR', provenance: 'declared', from: 'src/shared/time.ts' }] },
    ],
  },

  DiscoveredRecord: {
    name: 'DiscoveredRecord',
    description: 'One record the resolver reached from a path, with how it got there.',
    fields: [
      // `recordId` AND NOT `id`. A shape whose `id` is a required string is declaring its OWN
      // identity, and `idsUsedTwice` holds every such shape to a duplicate check. This object has no
      // identity of its own — it is a pointer at a record — so naming the key `id` would publish an
      // identity nothing refuses a duplicate of, which is the exact fault
      // tests/an-id-names-one-thing.test.ts exists to catch.
      { key: 'recordId', type: 'string', required: true, description: 'The record it reached.', example: '37jKRBaZWcdR' },
      { key: 'provenance', type: unionOf(PROVENANCES), required: true, description: 'How it was reached. A derivation is never drawn as a declaration.', example: 'declared' },
      { key: 'from', type: 'string', required: true, description: 'The path it was reached from.', example: 'src/shared/time.ts' },
    ],
  },

  WorkDomainResponse: {
    name: 'WorkDomainResponse',
    description:
      'WHAT THE AGENT SAID ABOUT ONE DIFFERENCE, or about a whole row of them. Written only by the accept route. ' +
      'All eight outcomes are here because something happens because of each one; an outcome that changed nothing ' +
      'would be a form field.',
    fields: [
      { key: 'key', type: 'string', required: false, description: 'The exact difference this answers, as the diff gave it. One of `key` and `row`.', example: 'shared_file:mole-office/src/shared/time.ts' },
      { key: 'row', type: unionOf(DIFF_ROWS), required: false, description: 'A whole row, answering every difference of it that has no explicit key. Forty discovered modules then cost one line rather than forty.', example: 'extra_semantic' },
      { key: 'outcome', type: unionOf(RESPONSE_OUTCOMES), required: true, description: 'What the agent decided. `keep` marks an entry kept without machine evidence everywhere it is drawn; `map_wrong` and `resolver_limit` are reported against the map and the resolver version.', example: 'keep' },
      { key: 'because', type: 'string', required: false, description: 'The agent\'s own sentence. Required in practice for `keep`, `map_wrong` and `resolver_limit`, which are disagreements with the machine.', example: 'the release detector reads this at runtime through a launch file' },
      { key: 'at', type: 'date', required: false, description: 'When it was answered.', example: '2026-08-26 09:20' },
    ],
  },

  AcceptedDomain: {
    name: 'AcceptedDomain',
    description:
      'THE ACCEPTED DOMAIN: what every later comparison reads. Written only by the accept route, STATED BY THE ' +
      'AGENT rather than assembled by Mole Office out of outcome words — a rule that built it from eight words would be ' +
      'Mole Office deciding what the agent meant, in the one field every later comparison reads.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When it was accepted.', example: '2026-08-26 09:20' },
      { key: 'index', type: 'ResolvedAgainstIndex', required: false, description: 'THE FILE INDEX IT WAS ACCEPTED AGAINST. Its build stamp is where every drift window begins; without it a window has no beginning.', example: { builtAt: '2026-08-26 08:00', root: '/srv/mole-office-fixtures/mole-office' } },
      { key: 'fromResolution', type: 'date', required: false, description: 'The `at` of the resolution this answered, so an accepted set names what it was answering.', example: '2026-08-26 09:12' },
      { key: 'writes', type: 'string[]', required: false, description: 'As the agent stated them.', example: ['src/shared/time.ts'] },
      { key: 'creates', type: 'string[]', required: false, description: 'As the agent stated them.', example: ['src/shared/new.ts'] },
      { key: 'dependsOn', type: 'string[]', required: false, description: 'As the agent stated them.', example: ['src/shared/detail.ts'] },
      { key: 'entries', type: 'ResolvedEntry[]', required: false, description: 'THE THREE LISTS RESOLVED ONCE, AT ACCEPTANCE, AND FROZEN. Overlap compares these, so two agents are told the same thing about one pair whenever either of them looks.', example: [{ asWritten: 'src/shared/time.ts', shape: 'file' }] },
    ],
  },

  Acknowledgement: {
    name: 'Acknowledgement',
    description:
      'WHAT THE AGENT DECIDED ABOUT ONE OVERLAP. Written only by the acknowledge route. It is a statement and never ' +
      'a lock: nothing anywhere refuses a write because one of these exists or does not.',
    fields: [
      { key: 'key', type: 'string', required: true, description: 'The overlap key — the two domain ids sorted, then the shared subject. The class is NOT in it, so re-scoping moves the class and leaves the agreement findable.', example: 'wdAAAAAAAAAA|wdBBBBBBBBBB|src/shared/time.ts' },
      { key: 'stance', type: unionOf(ACKNOWLEDGE_STANCES), required: true, description: 'Carrying on, waiting for the other session, or having narrowed because of this.', example: 'continuing' },
      { key: 'note', type: 'string', required: false, description: 'One sentence in the agent\'s own words.', example: 'I will not touch the signature until the other session answers.' },
      { key: 'at', type: 'date', required: false, description: 'When it was acknowledged.', example: '2026-08-26 09:30' },
    ],
  },

}
