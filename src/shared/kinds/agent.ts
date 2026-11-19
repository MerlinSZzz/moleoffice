// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `agent`, the identity that outlives any one process.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, AGENT_STATES and AgentState from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, `AGENT_RUNTIMES`, `LANGUAGES` AND `THE_RUNTIMES_THE_OFFICE_DISPATCHES` FROM
 * ../participants.ts, `theRuntimesTheWorkerGives` FROM ../what-a-runtime-passes-on.ts, `RUNGS`
 * FROM ../detail.ts AND `HOW_A_CARD_WAS_CHOSEN` FROM ../roles.ts. `AGENT_STATES`,
 * `AgentState` AND THE PASSED_AN_EFFORT LINES MOVED HERE WITH THE KIND, because its `state` and
 * `variant` fields read them and a file that imported them from kinds.ts would make the central
 * file and this one load each other. `AGENT_SHAPES` holds the agent kind's shapes as they move
 * out of ../kinds.ts, with their comments and text unchanged.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { AGENT_RUNTIMES, LANGUAGES, THE_RUNTIMES_THE_OFFICE_DISPATCHES } from '../participants.ts'
import { theRuntimesTheWorkerGives } from '../what-a-runtime-passes-on.ts'
import { RUNGS } from '../detail.ts'
// THE THREE WORDS FOR WHO CHOSE A CARD. Criterion P75; ../roles.ts is the only place they live, and
// this declaration reads them rather than repeating them.
import { HOW_A_CARD_WAS_CHOSEN } from '../roles.ts'

/** The runtimes passed a reasoning effort, said once for the `agent` kind's `variant` field. */
const PASSED_AN_EFFORT = theRuntimesTheWorkerGives(THE_RUNTIMES_THE_OFFICE_DISPATCHES).aVariantTo
const WHO_IS_PASSED_AN_EFFORT = PASSED_AN_EFFORT.length === 0
  ? 'No runtime is passed one, so it is refused for every runtime.'
  : `Only ${PASSED_AN_EFFORT.join(' and ')} ${PASSED_AN_EFFORT.length === 1 ? 'is' : 'are'} passed one, so it is refused for any other runtime.`

/**
 * WHETHER A DURABLE AGENT IS STILL BEING GIVEN NEW WORK. Two words, and both are reversible.
 *
 * `retired` takes an agent off the recipient picker for NEW messages. It changes nothing about the
 * inbox, refuses nothing, and a retired agent still resolves and still receives what was already
 * addressed to it. The alternative — deleting the record — strands whatever is waiting for it, and
 * `assertMayRemoveAnAgent` in lib/records/decision-core.ts refuses that by name.
 *
 * Both words are already in `STATE_MEANING` in shared/work.ts, from `MODULE_STATES`, and they mean
 * there what they mean here. No new state word is invented by this kind.
 */
export const AGENT_STATES = ['active', 'retired'] as const
export type AgentState = (typeof AGENT_STATES)[number]

export const agentKind: KindSpec = {
    kind: 'agent',
    purpose:
      'A DURABLE AGENT: the identity that outlives any one process, with a short handle a person types to address ' +
      'it and an inbox that survives the run that was serving it.',
    whenToRecord:
      'Once per agent, when somebody first wants to be able to address it by name. NOT once per run — a run is a ' +
      'session, and several sessions work as one agent. Before this kind existed the only way to address an agent ' +
      'was to name one of its past runs, so a comment written on Tuesday to the agent that wrote a report could ' +
      'not be delivered on Wednesday: the run was gone and the words had nowhere to go.',
    humanOnly: false,
    fields: [
      {
        key: 'handle',
        type: 'string',
        required: true,
        description:
          'THE SHORT NAME A PERSON TYPES TO ADDRESS IT. Lowercase letters, digits and dashes, 2 to 40 characters. ' +
          'It must not be one any agent in this project already has, or has ever had — a handle that stopped ' +
          'resolving would strand whatever was addressed to it, so renaming is allowed and the old name goes on ' +
          'working. The record\'s own title is the human name; this is the address.',
        example: 'round-ten',
      },
      {
        key: 'runtime',
        type: unionOf(AGENT_RUNTIMES),
        required: false,
        description:
          'WHICH RUNTIME SERVES IT, and it is one of the three this product has an adapter for. Absent is a real ' +
          'answer and means nothing has said, which is drawn as "Runtime not set" rather than guessed at. A worker ' +
          'asking for one runtime is shown these agents in their own group instead of silently skipping them. ' +
          'Records written before this became a checked list carry other words, "codex-cli" among them. Those are ' +
          'left exactly as they were written, and the registry says nothing about which runtime serves them.',
        refusal:
          'a runtime word is one this product has an adapter for, and the worker picks the adapter from this ' +
          'field. A word nobody declared would pick none',
        example: 'claude-code',
      },
      {
        key: 'model',
        type: 'string',
        required: false,
        description:
          'THE MODEL THIS AGENT\'S RUNS GET, on the runtime named above. It wins over the Settings ' +
          'page\'s place and role defaults and over .env, for a run on that runtime. Absent means none is set, and ' +
          'the run takes the next layer. The person sets it on the agent\'s profile, through ' +
          'POST /api/office/run-models/agent/:agent.',
        example: 'claude-opus-5-5',
      },
      {
        key: 'variant',
        type: 'string',
        required: false,
        description:
          `THE REASONING EFFORT THIS AGENT'S RUNS GET, beside \`model\`. ${WHO_IS_PASSED_AN_EFFORT} Absent means none is set.`,
        example: 'high',
      },
      {
        key: 'language',
        type: unionOf(Object.keys(LANGUAGES)),
        required: false,
        description:
          'THE LANGUAGE THIS AGENT READS, and so the one its card\'s handbook is sent in. ' +
          'POST /api/agents/started writes it when the starter names one. Absent means nobody said, and the ' +
          'handbook is then sent in every language it is written in, with a sentence saying why.',
        refusal: 'a language is one the office has texts in, and a word nobody declared names no text to send',
        example: 'zh',
      },
      {
        key: 'startedBy',
        type: 'ParticipantRef',
        required: false,
        description:
          'WHO STARTED THIS AGENT — the person or the agent that brought it into being, and the one that answers ' +
          "for it: whoever starts an agent manages it and answers for it. Leave it out for an agent a " +
          'person registered by hand and for one nobody recorded a starter for. Absent means nobody said, and it ' +
          'is never read as "the person started it". A started agent reports to whoever is named here, and the ' +
          'refusal an unregistered writer gets names that agent so it knows where to report.',
        example: { kind: 'agent', id: 'secretary-1' },
      },
      {
        key: 'branchedFrom',
        type: 'BranchedFrom',
        required: false,
        description:
          'WHICH AGENT THIS ONE WAS BRANCHED FROM, as facts: written by the Start a new agent press, on the new ' +
          'agent only, when the old one could not be reached. A page draws the sentence from it in the reader\'s ' +
          'language. Absent means this agent was not made by that press, or was made before 4 October 2026.',
        example: { agent: 'hkLnSG9FYPQ5', handle: 'a-builder' },
      },
      {
        key: 'role',
        type: 'string',
        required: false,
        description:
          'WHAT THIS AGENT MAY DO: one word from the role cards in src/config/roles.json. The words are ' +
          'not listed here because that file is the only place they live — it is a file rather than code so that ' +
          'a person can add a role without a code change. A REGISTRATION ALWAYS WRITES ONE from 8 September ' +
          '2026: naming no card registers a worker, and `cardChosenBy` says the rule chose it. ' +
          'Absent means nobody set one, which is what every agent registered before then holds; such a row is ' +
          'read as a worker, and a screen says "no role set" rather than drawing a word nobody chose. A word no ' +
          'card holds is refused, naming every word there is.',
        refusal:
          'a role is one of the words the role cards declare, and a word no card holds is a permission nothing ' +
          'can enforce',
        example: 'worker',
      },
      {
        key: 'cardChosenBy',
        type: 'WhoChoseTheCard',
        required: false,
        description:
          'WHO CHOSE THE CARD ABOVE. A registration that names no card gets the worker card by default. ' +
          '`how` is one of three words. `the-rule` — nobody named a card at registration, so the rule wrote the ' +
          'worker card, and `who` is null because nobody chose it. `a-starter` — whoever registered this agent ' +
          'named the card, and `who` is them. `a-credential` — the agent asked for this card in its credential ' +
          'and the owner gave it when they confirmed at the Embassy, and `who` is the confirmer. ABSENT MEANS ' +
          'NOBODY RECORDED IT, which is every row written before 8 September 2026, and it is never read as "the ' +
          'rule chose it": the word on such a row may have been a starter\'s choice or may be the word the row ' +
          'was read as, and there is no way to tell now. A screen says nobody recorded it rather than choosing ' +
          'one of the two.',
        example: { how: 'a-starter', who: { kind: 'agent', id: 'secretary-1' } },
      },
      {
        key: 'elevation',
        type: 'Elevation[]',
        required: false,
        description:
          'EVERY GRANT THE PERSON HAS MADE THIS AGENT, oldest first, saying it may act for them and until when. ' +
          'The LAST one is the one that counts and the ones before it are grants they made and ended. ' +
          'Only the person\'s own press in the office grants it, and only a secretary may be raised. ' +
          'It is written by their press at POST /api/roles/elevation/<handle> and by nothing else: an agent asking ' +
          'for one is refused, and so is an agent already acting for them. Absent means they never said. While it ' +
          'holds, that agent has every act under the power the declaration names, and every write it makes under ' +
          'it carries the grant on the change row and on the revision. It carries `endedAt` once it is over, ' +
          'rather than going away, because when it ended is a fact about the writes made while it held.',
        example: [
          {
            id: 'elevation-20260906223000',
            endsWhen: 'when you say',
            grantedAt: '2026-09-06 22:30:00',
            grantedBy: 'owner',
          },
        ],
      },
      {
        key: 'mayInject',
        type: 'boolean',
        required: false,
        description:
          'NO LONGER READ. This field once said whether this one agent could inject a message to a person. ' +
          'Whether agents may inject is now one switch for every agent, on the Settings page ' +
          '(since 25 September 2026), and nothing reads this ' +
          'field. It is kept so an old record that carries it is still accepted.',
        example: false,
      },
      {
        key: 'workArea',
        type: 'string[]',
        required: false,
        description:
          'WHERE THIS AGENT WORKS: the repository-relative places it was started to change, so that its changes ' +
          'are easy to find. Whoever starts an agent writes this when it registers it, so that whoever checks the work ' +
          'afterwards can find the changes instead of working them out from every write the agent made. PATHS ARE ' +
          'REPOSITORY-RELATIVE, never absolute: an absolute path, the repository root and a path outside it are ' +
          'refused. THE GRAIN IS THE AGENT\'S ROLE: a worker registers folders and may name ' +
          'specific files under the repository root beside them (README.md, bridge.py) where its card permits ' +
          'that, a supervisor one directory, a secretary nothing, and an inspector the worktree it checks; the ' +
          'root itself and a file with a path are refused either way. The refusal is the sentence on the role ' +
          'card in src/config/roles.json. NO AGENT MAY START WORK WITH NO AREA, ' +
          'and a stored area that predates the rule keeps working. Work outside the area is still ' +
          'recorded and not refused. Absent means nobody recorded an area; an empty list means somebody said there ' +
          'is none, and the two are different answers.',
        example: ['src/server/lib', 'tests/work-area'],
      },
      {
        key: 'filesArea',
        type: 'Record<string, unknown>[]',
        required: false,
        description:
          'WHERE A FILES RUN OF THIS AGENT MAY LAND: absolute folders, each `{written, resolved}`, the folder as it ' +
          'was written and as it resolved, with every link followed, when it was registered. It exists because a files ' +
          'seal\'s paths are relative to its root, and the work area is repository-relative, so no ' +
          'file of a files run was ever inside a work area. It is set as a work area is changed, by the owner, the ' +
          'agent\'s starter or a secretary, with a reason, and never by the run. REFUSED, whoever sets it: `/`, a ' +
          'home or a folder that holds one; a hidden folder directly under a home, or anything below one; the ' +
          'office\'s own data folder, or a folder that holds it; and any folder inside a git working tree, because ' +
          'files that belong to a repository go through the git lane. A file is inside when its REAL location lies ' +
          'in a folder\'s resolved location and not in a git working tree or a hidden folder of a home. A folder ' +
          'that resolves elsewhere today than when it was registered keeps every file outside until it is ' +
          'registered again, and its new target is never followed. Absent means no files area: no file of a files ' +
          'run is inside.',
        example: [{ written: '/srv/lab/runs', resolved: '/srv/lab/runs' }],
      },
      {
        key: 'mustRead',
        type: 'ChapterToRead[]',
        required: false,
        description:
          'WHICH CHAPTERS OF THE OFFICE REGULATIONS THIS AGENT WAS POINTED AT, and how much of each. An agent that ' +
          'starts another may tell it at the start which parts of the regulations to learn. Each entry ' +
          'is a chapter number and a position on the seven-position reading ladder — the same ladder every ' +
          'screen uses, because this design mints no second vocabulary. A chapter named with no level is read at ' +
          'digest. Whoever starts an agent writes this when it registers it, so somebody who was not there can ' +
          'read back which rules that agent was pointed at. ABSENT MEANS THE STARTER NAMED NONE, which is not an ' +
          'exemption: the card the agent holds names what it must read anyway, and the reading says "no chapters ' +
          'named; the <role> default applies" rather than nothing. An empty list is somebody saying none.',
        example: [
          { chapter: 5, level: 'full' },
          { chapter: 9, level: 'digest' },
        ],
      },
      {
        key: 'startedFor',
        type: 'string',
        required: false,
        description:
          'WHAT THIS AGENT WAS STARTED FOR: the id of the record whose end ends this role. Every card says what ' +
          "ends the role it describes, and for a worker that is the piece of work it was " +
          'started for. When the claim on that record is released, this agent is retired with the reason, and its ' +
          'handle is free for a new agent. Absent means nobody said, and an agent with none is never retired by that rule — ' +
          'an agent started for nothing in particular has no end to come.',
        example: 'PdPb2neVO4jH',
      },
      {
        key: 'startedByRun',
        type: 'string',
        required: false,
        description:
          'THE RUN THAT REGISTERED THIS AGENT: the session record of the run that started it. It is what lets ' +
          "this agent's FIRST run say which run started it — the session kind has had `parentAttachment` since " +
          'August and nothing ever wrote one, because nothing knew the answer. Only the first run is filled in ' +
          'from it: an agent has many runs and only the first was started by the run that registered it. Absent ' +
          'means nobody recorded one.',
        example: 'PdPb2neVO4jH',
      },
      {
        key: 'credential',
        type: 'string',
        required: false,
        description:
          'THE VISITOR CREDENTIAL THIS REGISTRATION CAME IN ON. Registration from anywhere but the ' +
          "person's own machine is refused without a credential they have confirmed, and this says which one let this " +
          'agent in. IT IS MEASURED AND NEVER SENT: the door replaces whatever a caller writes here, because a ' +
          'caller that could name its own credential could name one the owner confirmed for somebody else. ABSENT ' +
          'IS THE ORDINARY ANSWER AND MEANS THIS MACHINE — a registration made here needs none, and one made from ' +
          'elsewhere cannot be written without one, so absent says "none was needed" and never "nobody looked". It ' +
          "is the credential's id and not its token: a token is a secret shown once, at issue.",
        example: 'cred-8f2c1d0e',
      },
      {
        key: 'state',
        type: unionOf(AGENT_STATES),
        required: true,
        description:
          '"active" is being given new work. "retired" takes it off the recipient picker for NEW messages and ' +
          'changes NOTHING else: it still resolves, it still has its inbox, whatever is already waiting for it is ' +
          'still waiting, and it can be made active again. Deleting it instead is refused while anything is ' +
          'waiting, because that would leave the person\'s words addressed to a record that is gone.',
        example: 'active',
      },
      {
        key: 'retiredBecause',
        type: 'string',
        required: false,
        description:
          'One plain sentence saying why, when the state is "retired". Leave it out otherwise; it means nothing ' +
          'beside "active" and nothing infers one.',
        example: 'The round nine campaign finished on 21 August and nothing has run as it since.',
      },
      {
        key: 'notes',
        type: 'string',
        required: false,
        description:
          'THE FOLDER ON THIS MACHINE WHERE THIS AGENT KEEPS ITS OWN NOTES, as an absolute path. When Mole ' +
          'Office starts a run to answer a message, it reads the markdown files in that folder and hands the run ' +
          'a file naming them, so a fresh run knows what the agent knows. Absent is a real answer and means ' +
          'nobody has said where this agent keeps notes; a run then gets its recent records and nothing else, ' +
          'and the bundle says so rather than being silent about it. Nothing is written into the folder.',
        refusal: 'a relative path means nothing to a run started somewhere else, so this must be absolute',
        example: '/srv/mole-office-fixtures/.claude/projects/-srv-mole-office-fixtures-mole-office/memory',
      },
      {
        key: 'startFolder',
        type: 'string',
        required: false,
        description:
          'THE FOLDER THIS AGENT’S SESSIONS START IN, as an absolute path. A ' +
          'terminal has no way of its own to know which agent it is, so the session hook reads the environment, then ' +
          'a `.env`, then this, then nobody. IT IS RECORDED ONLY WHEN SOMEBODY ASKS FOR IT, through ' +
          '`--start-folder` on for-agents/register-myself.mjs, and never from the working directory a registration sends: ' +
          'the skill has every session a person starts register itself, and a folder is often shared. THE MATCH IS ' +
          'THE EXACT FOLDER after trailing slashes go: a subfolder is not a match and no link is followed, because ' +
          'the hook is handed a spelling and not a real location. THE HOOK NAMES AN AGENT FROM IT ONLY WHEN EXACTLY ' +
          'ONE LIVE AGENT IS REGISTERED AS STARTING THERE AND THAT AGENT IS NOT ALREADY ANSWERING IN ANOTHER LIVE ' +
          'SESSION; otherwise it names nobody and says which of those it was. Two agents may hold one folder: it is ' +
          'recorded and the reply warns, because refusing would stop an agent registering at all. REFUSED: a ' +
          'relative path, a path with "." or ".." in it, the root of the machine, and a home folder — each of ' +
          'those would match sessions that are not this agent’s. It is CHANGED by the owner, the agent’s ' +
          'starter or a secretary, with a reason, at POST /api/participants/agent/<handle>/start-folder, and never ' +
          'by the agent itself. Absent means nobody recorded one, and the hook then names this agent only from an ' +
          'environment or a `.env`.',
        refusal: 'a start folder is absolute, written plainly, and is neither the root of the machine nor a home folder',
        example: '/srv/mole-office-fixtures/mole-office',
      },
      {
        key: 'queuesAtTheSeal',
        type: 'QueuesAtTheSeal',
        required: false,
        description:
          "WHETHER THE OFFICE PUTS THIS AGENT'S SEALED ROUNDS IN THE MERGE QUEUE ITSELF (wave 13u round 93), the " +
          "repository they go to, and who turned it, when and why. Written only at POST /api/merge-queue/lines, by the " +
          'person or a secretary with its own key; each change is kept in the revisions. An ordinary write may not set, ' +
          'change or drop it. ABSENT MEANS NOBODY TURNED IT: the line is off, and its rounds are submitted by hand.',
        example: { on: true, repository: 'mole-office', because: 'This line seals often, and its rounds wait for nobody.', by: { kind: 'person', id: 'owner' }, at: '2026-10-25 17:30:00' },
      },
      ...commonFields('agent'),
    ],
    rules: [
      'the handle is unique across every agent in this project AND across every handle any of them has ever had. ' +
        'A duplicate is refused 409 naming the record that holds it, because two agents sharing a handle would ' +
        'deliver one agent\'s mail to the other.',
      'an agent with unhandled mail is not deleted. DELETE /api/records/<id> refuses 409 naming the count and ' +
        'says to retire it instead, which leaves the inbox alone.',
      'whether anybody is listening as this agent right now is NEVER stored on it. It is worked out from the ' +
        'requests this server is holding open, so it cannot be a stale copy of a process that has died.',
    ],
    example: { handle: 'round-ten', runtime: 'claude-code', state: 'active' },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const AGENT_SHAPES: Record<string, ShapeSpec> = {
  Elevation: {
    name: 'Elevation',
    description:
      'ONE GRANT: the person saying a secretary may act for them, and until when. Written by their press at POST ' +
      '/api/roles/elevation/<handle> and by nothing else. While it holds, that agent has every act under the power ' +
      'the role declaration names, and every write it makes under it carries this object on the change row and on ' +
      'the revision. It keeps its place with `endedAt` set once it is over, rather than going away.',
    fields: [
      {
        key: 'id',
        type: 'string',
        required: true,
        description: 'This grant\'s id. It is what a write made under it names on the two ledgers.',
        example: 'elevation-20260906223000',
      },
      {
        key: 'endsWhen',
        type: 'string',
        required: true,
        description:
          'Which of the ways it ends, by the word the role declaration uses. The words are in `elevation.howItEnds` ' +
          'on GET /api/roles; they are not listed here because that file is the only place they live.',
        example: 'when you say',
      },
      {
        key: 'until',
        type: 'string',
        required: false,
        description:
          'What it ends at, and what that means depends on `endsWhen`: a local wall-clock stamp for a time, the id ' +
          'of the record for a piece of work, and absent for "when you say", where nothing is named.',
        example: '2026-09-08 18:00:00',
      },
      {
        key: 'grantedAt',
        type: 'date',
        required: true,
        description: 'When they pressed it, in local wall clock.',
        example: '2026-09-06 22:30:00',
      },
      {
        key: 'grantedBy',
        type: 'string',
        required: true,
        description: 'Who granted it. The person, always: nothing else can write one.',
        example: 'owner',
      },
      {
        key: 'endedAt',
        type: 'date',
        required: false,
        description: 'When it ended, or absent while it still holds.',
        example: '2026-09-07 09:00:00',
      },
      {
        key: 'endedBecause',
        type: 'string',
        required: false,
        description: 'What ended it, in a sentence, or absent while it still holds.',
        example: 'You ended it.',
      },
      {
        key: 'reason',
        type: 'string',
        required: false,
        description:
          'WHY THE PERSON RAISED IT, in their words. Since 26 September 2026 the press asks for a reason. ' +
          'Absent on every grant made before then.',
        example: 'Delete the decision record filed by mistake',
      },
      {
        key: 'run',
        type: 'string',
        required: false,
        description:
          'THE SESSION RECORD OF THE RUN the secretary was in when the person pressed, where the raise is also written with its ' +
          'start and its end. Absent on every grant made before 26 September 2026, when the office began writing it.',
        example: 'Q7vN2cXe9TbL',
      },
    ],
  },

  /**
   * ONE CHAPTER OF THE CODE OF LAW, AND HOW MUCH OF IT SOMEBODY READS. Criterion C14.
   *
   * A shape rather than an open bag because both fields are read by something: the number by the
   * assembler that writes the chapter out, and the level by the ladder that decides how far. A bag
   * would let a chapters line be stored that the check could not act on, which for this field means
   * an agent believing it was pointed at a rule nobody can produce.
   */
  ChapterToRead: {
    name: 'ChapterToRead',
    description:
      'ONE CHAPTER OF THE OFFICE REGULATIONS, and the position on the seven-position reading ladder it is read at. The ' +
      'chapters are the chapter records of the office, at GET /api/office-regulations; the ladder is the same one every screen ' +
      'uses, so this design speaks no second vocabulary. A chapter named with no level is read at digest.',
    fields: [
      {
        key: 'chapter',
        type: 'number',
        required: true,
        description: 'The chapter number in the office regulations, 1 upwards. A number the code has no chapter for is refused.',
        example: 5,
      },
      {
        key: 'level',
        type: unionOf(RUNGS),
        required: true,
        description:
          'How much of it is read. A rung means this much and everything shorter, so `outline` is the name, what ' +
          'the chapter governs, its Conclusion and its rules. Positions 5, 6 and 7 are not written for any ' +
          'chapter yet, and a read that asks for one is told so rather than handed a cut-down copy.',
        example: 'digest',
      },
    ],
  },

  WhoChoseTheCard: {
    name: 'WhoChoseTheCard',
    description:
      'WHO CHOSE THE ROLE CARD ON AN AGENT. It exists because a card written by a rule and a card ' +
      'chosen by a starter used to be told apart only by the card being ABSENT, so two facts were read out of one ' +
      'empty value. Absent on the record means nobody recorded it, which is every agent registered before ' +
      '8 September 2026, and it is never read as either answer.',
    fields: [
      {
        key: 'how',
        type: unionOf(HOW_A_CARD_WAS_CHOSEN),
        required: true,
        description:
          '`the-rule` — no card was named at registration, so the rule wrote the worker card and nobody chose it. ' +
          '`a-starter` — whoever registered this agent named the card. `a-credential` — the agent asked for this ' +
          'card in its credential and the owner gave it when they confirmed at the Embassy.',
        example: 'a-starter',
      },
      {
        key: 'who',
        type: 'ParticipantRef',
        required: false,
        description:
          'Who chose it. Absent exactly when `how` is `the-rule`, because nobody did: a rule is not a person and ' +
          'naming one there would say somebody made a choice that nobody made.',
        example: { kind: 'agent', id: 'secretary-1' },
      },
    ],
  },

  BranchedFrom: {
    name: 'BranchedFrom',
    description:
      'THE AGENT A BRANCHED AGENT CAME FROM. Two facts and no sentence: the page writes the sentence in the ' +
      'reader\'s language. It holds no conversation, because the conversation with the old agent has no id of its ' +
      'own: the old agent\'s id is what opens it.',
    fields: [
      {
        key: 'agent',
        type: 'string',
        required: true,
        description: 'The old agent\'s id in the agent registry, as GET /api/participants lists it.',
        example: 'hkLnSG9FYPQ5',
      },
      {
        key: 'handle',
        type: 'string',
        required: true,
        description: 'The old agent\'s handle when the press was made.',
        example: 'a-builder',
      },
    ],
  },

  /**
   * WHETHER AN AGENT'S LINE IS PUT IN THE MERGE QUEUE AT THE SEAL, KEPT ON ITS AGENT RECORD BY THE OFFICE. Wave 13u
   * round 93; src/shared/merge-queue-at-the-seal.ts.
   */
  QueuesAtTheSeal: {
    name: 'QueuesAtTheSeal',
    description:
      "WHETHER THE OFFICE PUTS THIS AGENT'S SEALED ROUNDS IN THE MERGE QUEUE ITSELF. Written only by POST " +
      '/api/merge-queue/lines, for the person or a secretary with its own key, always with a reason.',
    fields: [
      { key: 'on', type: 'boolean', required: true, description: 'Whether the line is turned on.', example: true },
      { key: 'repository', type: 'string', required: false, description: "The repository the line's entries go to, by name. Present whenever the line is on.", example: 'mole-office' },
      { key: 'because', type: 'string', required: true, description: 'Why it was turned on or off, in the words of who turned it.', example: 'This line seals often, and its rounds wait for nobody.' },
      { key: 'by', type: 'ParticipantRef', required: true, description: 'Who turned it.', example: { kind: 'person', id: 'owner' } },
      { key: 'at', type: 'date', required: true, description: 'When, in local wall clock.', example: '2026-10-25 17:30:00' },
    ],
  },
}
