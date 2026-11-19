# Round reading evidence

`tools/sandbox.mjs` calls `prepareRoundChapters` once in `commandRound`, after choosing the preceding run and its checkout, before constructing any runtime command. After filing the run, `saveRoundChapters` reads its existing extra data and patches `extra.roundChapters` and the existing `territory` path list, before `startThroughTheHelper`. It uses the launcher's safe office request helper. A refused save prevents model start. No change to the next-round door or sandbox-start helper is needed.

## Declaration

For `/sandbox/briefs/task.md`, write `/sandbox/briefs/task.md.round.json`:

```json
{"kind":"development","territory":["src/web/components","tests"]}
```

The sidecar remains supported, but is not required. Without its kind the start reads an unambiguous kind from the brief: a `Round kind:` line, a `# code round` or named-kind round heading, or an affirmative instruction to change a named source file or make a code commit. Fenced examples, quotations, historical sections and negated code instructions do not declare the round. Conflicting or missing evidence leaves the work kind unknown; an unrecognized kind stays unrecognized. For an unknown kind, CODE.md and LINE-common.md are whole. The sandbox's own TERRITORIES section and the fallback paragraph are selected independently when each is unambiguous; otherwise the full file is given. A narrowed selection with no kind uses the reserved policy label `unclassified` and an explicit notice that this is not an inferred work kind; the existing office reader can acknowledge that selection. A fully delivered fallback keeps the absent kind. Omitted territory inherits the preceding run's string[] path list; an explicit empty array selects no territory additions. Kind describes this round's work; it is separate from record kind `session` and submission classification. The current round launcher supplies no delegation to this reader; the office's packaged-task delegation describes outside-work suitability, not a round kind.

## A line's backlog

A declaration may also name the line whose backlog the round works from, and the items it works on:

```json
{"kind":"development","territory":["src/shared"],"line":"a-line","items":["4","7b"]}
```

Before `prepareRoundChapters`, `commandRound` calls `readTheRoundsBacklog` (`backlog.ts`), which asks `GET /api/backlog?line=<line>` through the launcher's ask that waits while the office restarts. A declaration with no line asks nothing, and its brief is delivered byte for byte as before. The round is then given the line's items in the line's order, in place of `briefs/REQUIREMENTS.md`:

- a declaration that names items gets those items whole, and every other item of the line as one line with its number, state and record id;
- a declaration that names no items gets every item that is not done or dropped whole, and the others in one line each.

An office with no backlog door (a 404 naming the missing door) or with no items for the line is said in one sentence that points to `briefs/REQUIREMENTS.md`, and the round starts; a sandbox with no such file stops the start. Any other answer stops the start by name: another status, nothing answering, an answer not in the door's shape, an item twice, or a named item the line does not hold. The reading is saved as `backlog` in the manifest and delivered between the task brief and the rules. `tools/file-backlog-items.mjs` files a line's requirement file as one backlog item per item, with each item's words whole.

## Standing stages

A flow's stage may be marked `standing: true`. Such a stage is a standing rule: it is given to every round and every worker the flow applies to, whatever the brief says. `readTheStandingStages` (`standing.ts`) reads them as the start begins, through the launcher's ask that waits while the office restarts. It reads the agent's role from `GET /api/participants/agent/<handle>`, then every flow `GET /api/flows?role=<role>` lists, the project's own and the general ones, then each of those flows in its own project. Each marked stage is given in the words it holds then, with its flow's title, id and the revision read, so a later change to a stage reaches the next start.

`commandRound` saves the reading as `standing` in the manifest, and delivers its text between the task brief and the backlog. `commandWorker`, and `commandExec` with `--agent` and `--brief`, put the text before the brief instead, because a worker's brief ends with its own last step. That brief is written to `out/round-chapters` as a new file, and the brief given is left as it was. A Codex or OpenCode command takes the brief's text as its last word, so that word is given the new text; a last word that is not the brief's text stops the start.

One line says what was read: how many stages from which flow at which revision, or that no flow for the role marks a stage, or why nothing was read. A round's line is in its chapter list. A worker's line is kept in its launch details, and is said aloud as well only when a read was not answered, so a start that went well still prints one line. A refusal, no answer, or an answer this cannot read leaves the start to go on with no stage given, and the line says why. An office that does not know the mark answers stages without it, which is no stage marked. Only a marked stage that cannot be read stops the start: a mark that is not `true` or `false`, a marked stage with no number or no words, or a flow with marked stages and no title or revision.

## Policy

The shipped `policy.json` provides conservative CODE choices for development, tests, documents, words and one-plugin. LINE-common remains whole; a full-file TERRITORIES choice is narrowed to the sandbox's own section and fallback when both can be identified safely. A complete sandbox-specific override goes in that sandbox's `briefs/round-chapters.policy.json`. If an explicit selection conflicts with the identified line and fallback, the start gives all three files whole and says why. With no heading naming the sandbox, an explicit selection is kept as the policy names it, since no round-start pack replaces it. Nothing searches another sandbox or a repository copy of those brief files.

```json
{
  "version": 1,
  "kinds": {
    "tests": {
      "CODE.md": [{"chapter": 5, "descendants": true}],
      "LINE-common.md": [{"path": ["Common", "Verification"]}],
      "TERRITORIES.md": []
    }
  },
  "territories": {
    "tests": {"TERRITORIES.md": [{"path": ["Territories", "Tests"]}]}
  }
}
```

`path` is the complete, case-sensitive heading ancestry, including any document heading. The selected heading includes its complete direct body. Children are included only when separately selected or when `descendants:true` explicitly selects the subtree. CODE uses chapter-number selectors with descendants required. `"*"` means the complete original file, including preamble. `[]` explicitly selects nothing. Every known kind must name all three sources. Territory entries may name fewer sources; each matching exact path or prefix ending at `/` adds its selections to the kind's selections. Multiple matching entries accumulate; `"*"` absorbs other selectors. Output follows source order, without duplicate sections. A missing or ambiguous selected heading names the source and selector and fails the start. Invalid policy fails even for an unknown kind.

## Saved evidence and checking

`extra.roundChapters` holds `{version:1,kind,territory,fallback,notice,policy,brief,sources,chapters}`, and `backlog` when the declaration names a line: `{line,named,from,items,text,bytes}`, each item with its record id, number, state when one is recorded, and whether it was given whole. `standing` is the reading of the standing stages: `{role,flows,text,bytes}`, each flow with its id, title, revision and marked stages, or `{flows:[],text:'',bytes:0,says}` with the sentence that says why none were given. Policy evidence has its path and SHA-256. Brief evidence has its original path, SHA-256, exact text and UTF-8 byte count. Each of the three source entries has its name, resolved local path, original SHA-256 and byte count, full-file flag, exact selected heading paths/titles/text/byte counts, and delivered text/byte count. CODE chapter entries hold the chapter number, actual supplied ladder level (`outline`, positions 1–4 in the current export), exact text and byte count. They never claim unwritten digest/full rungs.

Derived Markdown and JSON evidence are content-addressed under the sandbox's `out/round-chapters`, outside the worktree. The original task brief remains unchanged and precedes the rules. A clear sentence says the saved list controls chapter obligations even when that original brief names a broader list. The printed source/section list and delivered rule text are rendered from this same snapshot.

`theChaptersARunsAgentMustRead` passes the optional saved selection through `theChaptersLineFor` and uses its list for the pre-seal reminder too. `assembleTheInspectorsPrompt` renders the saved CODE and local sections, and does not load today's chapter list, precedents or card obligations for these runs. `releaseOrRefuse` bounds structured chapter claims and citations to the snapshot, without raising the inspector's actual reported levels. Existing non-rule checks and invariants remain. The inspector tool already takes prompt `chaptersAt`; it needs no separate wiring.

Old runs without this extra entry keep their existing office-record/card path, including absence/recovery notices. Existing partial writers may omit the three nullable declaration keys when their value is null; the reader normalizes only those known keys. A present invalid snapshot fails rather than substituting today's content. The save then reads the existing GET /api/checks/<run> reply. Its chapters.says must acknowledge version 1 and a canonical SHA-256 of the complete normalized manifest, and its mustRead list must match the saved chapter numbers and levels. Canonical serialization sorts object keys while preserving array order, so old dataPatch null removal cannot alter identity. A successful record PATCH alone does not prove support. An older reply without acknowledgement permits only all three files delivered in full, with an explicit legacy-office notice; narrowed delivery refuses until the office is upgraded. A wrong acknowledgement or list also refuses. Full-file legacy compatibility requires a readable existing chapters object: named, valid mustRead chapter/ladder entries, from and says. A missing or malformed 200 reading refuses by name. Existing territory writer permissions still apply. An old sandbox helper that cannot file a run on the host cannot guarantee a pre-start save and is refused with an upgrade instruction. Codex/OpenCode keep their existing 128 KiB single-argument guard: a large full-file fallback refuses visibly before filing instead of truncating. Claude and dsh receive the same derived file text through their existing paths.
