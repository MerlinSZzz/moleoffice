// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CALLER IS TOLD WHEN THEY WRITE A KEY NO KIND DECLARES: the wrong keys this schema names,
 * the width words refused rather than guessed at, the keys that left `data` altogether, and the
 * guess by spelling that finds a declared key.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. `AMBIGUOUS_WIDTH_KEYS`, `chooseShareOrMeasure`,
 * `normaliseKey` and `MOVED_OUT_OF_DATA` gained the `export` word, because the part of the checker
 * that stays in kinds.ts reads them.
 *
 * THIS FILE IMPORTS NOTHING. Everything it needs is declared here, and it reads no table of
 * ../kinds.ts, so it makes no runtime cycle through it.
 */

// ---------------------------------------------------------------------- did you mean

/** Levenshtein distance. Small strings only; this runs once per unrecognised key. */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  let prev = Array.from({ length: cols }, (_, j) => j)
  for (let i = 1; i < rows; i++) {
    const curr = new Array<number>(cols)
    curr[0] = i
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)
    }
    prev = curr
  }
  return prev[cols - 1] ?? 0
}

/**
 * The wrong keys this schema itself names, and the field each one is really asking for.
 *
 * Edit distance is a guess about MISTYPING, and it is the wrong tool for a key that was chosen
 * on purpose. `charts` is a correctly spelt English word two edits from `parts`, so the distance
 * guess answered `{"charts": [...]}` with "did you mean parts?" — sending an author who wrote a
 * chart towards the progress checklist, while the field they wanted, `summaryBlocks`, names
 * `charts` as a wrong key in its own description. A schema that warns about a key and then
 * misdirects the person who used it is worse than one that says nothing.
 *
 * Every entry here is a key some field's `description` already calls out; adding one to that
 * prose means adding it here. `summary_blocks` and `summaryblocks` are deliberately absent: the
 * exact match below already resolves them, because they differ from the real key only in case
 * and punctuation.
 *
 * A wrong key can mean different fields on different kinds — `blocks` is `summaryBlocks` on a
 * module and `steps` on a pipeline — so the value is candidates in order, and the first one the
 * kind actually has wins. Keys are written normalised, the same way `suggestKey` normalises.
 */
const NAMED_WRONG_KEYS: Record<string, readonly string[]> = {
  // `blocks` on a MODULE means a summary block. On a pipeline it is the word the design notes have
  // always used for a step, and the pipeline's own key is `blockIds` — so somebody writing `blocks`
  // there wanted the order, and gets sent to it. On a REPORT `blocks` is the real key and this line
  // is never reached, because an exact match is tried before this table.
  blocks: ['summaryBlocks', 'blockIds'],
  // THE TWO ORDERS HAVE DIFFERENT NAMES AND EACH SENDS THE AUTHOR TO THE OTHER. A `blockIds` on a
  // trajectory would be intentions entering the one door a composition has; a `plannedStateIds` on
  // a pipeline would be the reverse. An exact match is tried before this table, so neither entry
  // fires on a kind that really has the key, and neither fires on a kind that has neither.
  blockids: ['plannedStateIds'],
  plannedstateids: ['blockIds'],
  // A chart goes in a module's `summaryBlocks` or a report's `blocks`. The first entry the kind
  // actually has wins, so a module's author is sent to one and a report's author to the other.
  charts: ['summaryBlocks', 'blocks'],
  // THE SAME KEY, THE OTHER WAY ROUND. An agent that learnt Mole Office on modules writes
  // `summaryBlocks` on a report, and the two spellings are eight edits apart, so the distance guess
  // below finds nothing and the refusal would send a whole report into `extra`. Written normalised,
  // like every key in this table.
  summaryblocks: ['blocks'],
  // THE KEY THAT MOVED. A pipeline stored `data.steps` for the whole of this product's life, and
  // every agent that learnt Mole Office before today will send it. Without this line the refusal is an
  // accurate list of field names with the answer left for the reader to spot.
  steps: ['blockIds'],
  // THE KEY WINDOW B RENAMED. A session stored `data.agent` for the whole of this product's life and
  // 92 records held it the morning the window ran; every agent that learnt Mole Office before it will
  // send that word. It maps onto a RIGHT KEY rather than into `MOVED_OUT_OF_DATA`, because the fact
  // did not leave `data` — it is `runtime`, on the same kind, holding the same word. The first entry
  // the kind actually has wins, so a session's author and an agent record's author are both sent to
  // `runtime` and nobody else is sent anywhere.
  agent: ['runtime'],
  // THE WORDS AN AGENT REACHES FOR WHEN IT MEANS A PROPORTION BETWEEN SIBLINGS. Every one of them
  // is proportion vocabulary and none of them is a width, so none is ambiguous between the two
  // concepts: a weight, a ratio, a flex grow factor, a percentage and a grid fraction are all
  // statements about a part BESIDE ITS SIBLINGS, which is exactly what `share` is. They are sent
  // there rather than refused.
  //
  // `px` USED TO BE IN THIS LIST AND IS NOW REFUSED. `px: 600` says a number of pixels and says
  // nothing about which box it is about, so sending it to `share` was the same wrong guess `width`
  // was making. It is in `AMBIGUOUS_WIDTH_KEYS` below.
  //
  // The first entry the shape actually has wins. `share` is on `BesidePart` and nowhere else, so
  // these fire only on a part.
  weights: ['share'],
  ratio: ['share'],
  ratios: ['share'],
  flex: ['share'],
  percent: ['share'],
  fr: ['share'],
  // THESE TWO ARE ABOUT THE WRITING INSIDE A PART rather than about the part, so they go to the
  // other key. Each of them names the writing outright, so neither is a guess: `measurePx` says
  // measure and `lineLength` says line. `width` and `maxWidth` used to be here and are now in
  // `AMBIGUOUS_WIDTH_KEYS` below, which refuses them instead.
  measurepx: ['measure'],
  linelength: ['measure'],
}

/**
 * THE KEYS THAT NAME A WIDTH WITHOUT SAYING WHOSE, AND ARE REFUSED RATHER THAN GUESSED AT.
 *
 * An ambiguous input such as width: 600 must not silently become either concept. Either the
 * interpretation is made explicit, or the agent has to tell share from measure before the
 * value is stored.
 *
 * THERE ARE TWO CONCEPTS AND EIGHT WORDS THAT COULD MEAN EITHER. `share` says how wide a region is
 * beside its siblings. `measure` says how wide the writing inside a prose region reads. Each of the
 * words below names a horizontal extent and says nothing about which of the two boxes it is about,
 * so a table sending it to one of them is a guess, and a wrong guess sends the author to the wrong
 * layer and stores a key that cannot do what they wanted.
 *
 * MEASURED AT COMMIT fd3cb00, WHICH IS WHY THIS EXISTS. `POST /api/records` with `width: 600` on a
 * part of a composition answered *unknown key "width" — did you mean "measure"?*. An agent that
 * meant the column then wrote `measure: 600`, which is refused a second time for being a width, and
 * an agent that took the advice narrowed its text and left its column exactly as it was.
 *
 * `columns` AND `span` ARE HERE AND ARE STILL REAL KEYS ELSEWHERE. A comparison block's own key is
 * `columns` and an exact match is tried before this table, so a comparison is never refused for
 * writing it. This fires only where the shape has no such field and has a `share` or a `measure`
 * to be confused about, which is the guard below.
 */
export const AMBIGUOUS_WIDTH_KEYS: readonly string[] = [
  'width',
  'maxwidth',
  'minwidth',
  'size',
  'span',
  'colspan',
  'columns',
  'px',
]

/**
 * WHAT AN AUTHOR WHO WROTE ONE OF THOSE IS TOLD: both concepts, and the question.
 *
 * It names the key they wrote, says what each of the two words does in one clause each, and ends
 * with the question rather than a suggestion. `where` is what the two concepts are written on, so
 * an author on a block that has no `share` is still told where a share is written — on the parts of
 * a `beside` composition — rather than being left to think this shape has no such idea.
 */
export function chooseShareOrMeasure(key: string, hasShare: boolean, hasMeasure: boolean): string {
  const share = hasShare
    ? '"share" sets how wide this region is next to its siblings'
    : '"share" sets how wide a region is next to its siblings, and is written on the parts of a "beside" composition'
  const measure = hasMeasure
    ? '"measure" sets how wide the writing inside a prose region reads'
    : '"measure" sets how wide the writing inside a prose region reads, and is written on a block that holds writing'
  return (
    `unknown key "${key}" — that names a width, and a report has two different widths, so Mole Office will not ` +
    `guess which one you meant. ${share}. ${measure}. WHICH DID YOU MEAN? Write that key instead. A share is a ` +
    `proportion and never a size: 3 on each part, "60%" on each part, or "proportions": "60/40" on the row. A ` +
    `measure is a preset name or a ratio of the column. Neither of them takes pixels.`
  )
}

/** Case and punctuation folded away, so `summary_blocks` and `summaryBlocks` are one key. */
export const normaliseKey = (s: string): string => s.toLowerCase().replace(/[_\-\s]/g, '')

/**
 * Keys that left `data` ALTOGETHER, and where each one went instead.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE CANNOT BE HANDLED BY `NAMED_WRONG_KEYS` ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * That table maps a wrong key onto a RIGHT KEY. These two have no right key: what a block waits on
 * and which modules carry it both became LINKS when a pipeline step became a record, so there is no
 * field on any kind to send the author to. `suggestKey` can only answer with a field name, and the
 * honest answer here is a route.
 *
 * ---------------------------------------------------------------------------------------
 * THE 201 THIS EXISTS TO STOP, MEASURED 2026-08-10
 * ---------------------------------------------------------------------------------------
 *
 * Without these sentences the refusal for `needs` on a block was accurate and ended:
 *
 *   "Anything this kind has no field for goes inside "extra", where it is stored and shown but
 *    nothing reads it."
 *
 * That is true of every other unknown key and it is exactly wrong for these two. An agent that
 * learnt Mole Office before the migration sends `needs`, is refused, follows the advice, and
 * `{"state":"todo","extra":{"needs":[…]}}` is answered **201** — a dependency graph stored as text
 * that no page reads, no link holds and no query can find, on a pipeline that draws with the edge
 * simply missing. The old shape stopped being STORED and went on being reachable, one refusal
 * later, by the schema's own instruction.
 *
 * So the refusal for one of these names the link to write and says outright that `extra` is not the
 * answer. `extra` still accepts anything — it is the declared bag and that is deliberate — and this
 * is the difference between a bag somebody chooses and a bag they were sent to.
 */
export const MOVED_OUT_OF_DATA: Readonly<Record<string, string>> = {
  needs:
    'what a block waits on is not a field of any record any more. It is a `blocks` link from the block that ' +
    'has to move first to this one, carrying the gate: POST /api/links {"fromId":"<the block that must ' +
    'finish>","toId":"<this block>","type":"blocks","gate":{"kind":"hard"}}. DO NOT PUT IT IN "extra" — ' +
    'nothing reads "extra", so the dependency would exist as text only, the pipeline would draw with that ' +
    'edge missing, and you would be answered 201.',
  // A TASK'S `blocked_by` LEFT `data`; AN OBLIGATION'S DID NOT, and the same table serves both
  // correctly because `checkUnknownKeys` asks this only for a kind that has no field of that name.
  // An obligation declares `blocked_by`, so the key is accepted there and this sentence is never
  // reached; a task does not, so this is what a task's author is told. The two kinds really do
  // differ — see the note where the field used to be declared on `task`.
  // Written NORMALISED — no underscore — because that is how the lookup below asks for it, the
  // same way `NAMED_WRONG_KEYS` is written. A key spelled `blocked_by` here is a table entry
  // nothing ever finds, which is a check that quietly does nothing.
  blockedby:
    'this kind does not store what is blocking it as prose naming another record — an `obligation` still does, and ' +
    'nothing else. The dependency is a `blocks` link from the record that has to move first to this one: ' +
    'POST /api/links {"fromId":"<the blocker>","toId":"<this record>","type":"blocks","gate":{"kind":"hard"}}. ' +
    'That link is what the gate rule, the attention rule, `unmetDependencies`, the record page and the graph all ' +
    'read; the field they never read is gone. On a `task`, anything you are waiting on that is NOT a record yet ' +
    'goes in "also_waiting_on", which is the prose field that kind already had. DO NOT PUT IT IN "extra" — nothing ' +
    'reads "extra", so the dependency would exist as text only and you would be answered 201.',
  // WHAT A RECORD IS ABOUT HAS ALWAYS BEEN A LINK, and it became worth saying here when the
  // `report` kind arrived: a report is defined by being about something, so an author writing one
  // reaches for this key, and no kind declares it. The generic refusal would name the fields the
  // kind has and then offer `extra`, which would store the subject as text no page joins to
  // anything — the same 201 the two entries above exist to stop.
  about:
    'what a record is about is not a field of any kind. It is an `about` link from this record to the one it is ' +
    'about: POST /api/links {"fromId":"<this record>","toId":"<what it is about>","type":"about"}, which reads back ' +
    'from the other end as "subject of", so both pages show the pair. DO NOT PUT IT IN "extra" — nothing reads ' +
    '"extra", so the subject would exist as text only, neither page would show the other, and you would be answered ' +
    '201.',
  // WINDOW B EMPTIED `module.data.claims` INTO `implementation_map` AND DELETED THE DECLARATION IN
  // THE SAME COMMIT. Without this entry the refusal would list the module's fields and then offer
  // `extra`, which stores the responsibility as text no coverage read joins to anything — a 201 for
  // a claim that never resolves.
  claims:
    'the code a module is responsible for is not a field of any record any more. It is a ROW in the ' +
    'implementation map: POST /api/implementation {"recordId": "<this module>", "repositoryId": "<which ' +
    'repository>", "pattern": "src/server/lib", "relation": "implements"}, and GET ' +
    '/api/implementation/record/<id> reads it back. The row says three things this field could not: one file ' +
    'may serve several records, WHICH repository a pattern is relative to, and WHO said so — a person stating ' +
    'a fact, an agent stating one and an agent guessing are three different rows and were one indistinguishable ' +
    'string. DO NOT PUT IT IN "extra" — nothing reads "extra", so the responsibility would exist as text only, ' +
    'GET /api/source/coverage would go on saying nobody has taken that file, and you would be answered 201.',
  modules:
    'which modules carry a block is not a field of any record any more. It is an `implements` link from the ' +
    'module to the block: POST /api/links {"fromId":"<the module>","toId":"<this block>","type":"implements"}. ' +
    'A step used to store these as TITLES beside the same fact stored as links, and one accepted rename broke ' +
    'ten of them behind a 200, which is why there is one statement of it now and it is the link. DO NOT PUT IT ' +
    'IN "extra" — nothing reads "extra", so the mapping would exist as text only and you would be answered 201.',
}

/**
 * The declared key an unrecognised one was probably meant to be, or null.
 *
 * Three answers are tried in order of how much they know. Case and underscores are ignored
 * first, so `summary_blocks` and `summaryblocks` both find `summaryBlocks` — the two spellings
 * an agent reaches for when it has not been told which one this project uses. Then the wrong
 * keys the schema names outright, which are facts about this project rather than guesses, so
 * they beat the arithmetic. Only then is it edit distance, with a limit that grows with the
 * length of the key so that short keys cannot be matched to anything by accident.
 */
export function suggestKey(unknownKey: string, validKeys: readonly string[]): string | null {
  const target = normaliseKey(unknownKey)
  const exact = validKeys.find((k) => normaliseKey(k) === target)
  if (exact !== undefined) return exact

  // Falls through to distance when this kind has no such field: `charts` on a claim is not a
  // misspelt `summaryBlocks`, because a claim has no summary blocks to write it into.
  const named = NAMED_WRONG_KEYS[target]?.find((k) => validKeys.includes(k))
  if (named !== undefined) return named

  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const key of validKeys) {
    const d = editDistance(target, normaliseKey(key))
    if (d < bestDistance) {
      bestDistance = d
      best = key
    }
  }
  const limit = target.length <= 4 ? 1 : target.length <= 8 ? 2 : 3
  return best !== null && bestDistance <= Math.min(limit, Math.floor(target.length / 2)) ? best : null
}
