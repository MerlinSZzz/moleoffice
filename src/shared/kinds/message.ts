// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `message`, one thing said by one participant to another.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, `LONGEST_LABEL` AND `LABEL_COLOURS` FROM ../message-label.ts,
 * `THE_PERSONS_NAME_FOR_THE_ADDRESS` FROM ../renamed-words.ts, AND ITS OTHER CONSTANTS FROM THE
 * FILES THAT DECLARE THEM. IT IMPORTS NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS
 * KIND; `MESSAGE_SHAPES` holds the shapes moved out of ../kinds.ts, with their comments and text
 * unchanged.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { INTENT_MARKS } from '../intent-mark.ts'
import { A_GROUP_IS_NAMED_BY_ITS_ID, NOBODY_NAMED_AND_NOTHING_POINTED_AT, RECIPIENT_MAX } from '../messages.ts'
import { LONGEST_LABEL, LABEL_COLOURS } from '../message-label.ts'
import { THE_PERSONS_NAME_FOR_THE_ADDRESS } from '../renamed-words.ts'
import { WHEN_TO_SEND_A_LEAD } from '../when-to-send-a-lead.mjs'

export const messageKind: KindSpec = {
    kind: 'message',
    purpose:
      'One thing said by one participant to another. Everything said in Mole Office is one of these: a line on the ' +
      'message board, a message in a conversation, and a comment left on a page, which is a message that also says ' +
      'what on the page it is about.',
    whenToRecord:
      'When you need to say something to a person or to another agent that is not itself a record of work \u2014 a ' +
      'question you are blocked on, a heads-up, an answer, a remark on a passage of a report. Anything worth keeping ' +
      'as a finding, a problem or a result becomes that kind instead, and the message says where to look.',
    humanOnly: false,
    fields: [
      {
        key: 'body',
        type: 'string',
        required: true,
        description:
          'What is being said, in full. Needed before the message is complete: the message IS the body, and a board ' +
          'entry with only a title is a subject line with no letter under it. A record id or a page address written ' +
          'in here is drawn as a link the reader follows with one press.',
        example: 'The setting 15 print cracked again. I am holding the sweep until you say whether to try PLA.',
      },
      {
        key: 'sentBy',
        type: 'ParticipantRef',
        required: false,
        description:
          'WHO SENT IT, as a person or an agent in the registries. Left out only where nobody could be worked out: ' +
          'a message written by an actor id that answers to no registry row keeps its words and says nobody was ' +
          'found, rather than being given a sender it does not have. This is the strict half; `from` below is what ' +
          'somebody typed.',
        example: { kind: 'agent', id: 'builder-aa' },
      },
      {
        key: 'to',
        type: 'ParticipantRef[]',
        required: false,
        description:
          'WHO IT IS ADDRESSED TO, one entry per recipient, at most ' +
          String(RECIPIENT_MAX) +
          '. Leave it out on a comment left on a page for nobody in particular \u2014 who a comment should reach is a ' +
          'later and separate question. A message with neither a recipient nor a target is addressed to nobody and ' +
          'about nothing, and is refused. A LINE FOR THE OWNER NAMES THE OWNER: writing to the person is what most ' +
          'of the message board is, and it is written by naming the person here, never by leaving this out and letting ' +
          'Mole Office work out who you meant. HOW FAR IT GOT with each recipient is not here: a delivery mark ' +
          'changes, and a field cannot change without a revision, so the marks are rows of their own read at ' +
          'GET /api/messages/:id.',
        example: [{ kind: 'person', id: 'owner' }],
        refusal: NOBODY_NAMED_AND_NOTHING_POINTED_AT,
      },
      {
        key: 'toGroup',
        type: 'string',
        required: false,
        description:
          'THE GROUP IT IS ADDRESSED TO, by its id. Every member of that group at the moment it is sent gets one ' +
          'delivery row, and whoever sent it gets none. A message names a group or names participants in `to`, ' +
          'never both. Whoever writes it has to be in the group. GET /api/groups lists every group in this ' +
          'project. HOW FAR IT GOT with each member is read at GET /api/messages/:id, exactly as for a message ' +
          'addressed to people by name.',
        example: 'aB3dEf7hIjKl',
        refusal: A_GROUP_IS_NAMED_BY_ITS_ID,
      },
      {
        key: 'target',
        type: 'Context',
        required: false,
        description:
          'WHAT ON A PAGE THIS IS ABOUT, when it is a comment: the thing, optionally the exact words inside it, ' +
          'optionally the revision it was written against. It is the same shape a comment of kind "annotation" ' +
          'carries, so a page draws the two the same way. Leave it out for a message that is not about a place.',
        example: {
          target: { kind: 'reportBlock', recordId: 'PtnsAZ3meHwk', blockId: 'b-2' },
          span: { quote: '1.9', from: 18, to: 21, field: 'data.blocks[#b-2].rows[1].cells[1]' },
        },
      },
      {
        key: 'quotes',
        type: 'Context[]',
        required: false,
        description:
          'WHAT THIS MESSAGE QUOTES, one entry per quote, drawn at its position in the words or above them when positions are omitted. Each entry is ' +
          'the same shape as `target` above: the thing, and optionally the exact words inside it. There is no limit ' +
          'on how many. Use it for a message that quotes several things; a comment left on ' +
          'one place says so with `target`, and a message with `target` already quotes that one place. A message ' +
          'carries `target` or `quotes`, never both. A message with `quotes` is not a comment on those places, so ' +
          'it still names who it is for. Leave it out for a message that quotes nothing.',
        example: [
          { target: { kind: 'reportBlock', recordId: 'PtnsAZ3meHwk', blockId: 'b-2' }, span: { quote: '1.9', from: 18, to: 21, field: 'data.blocks[#b-2].rows[1].cells[1]' } },
          { target: { kind: 'record', recordId: 'PtnsAZ3meHwk', workspaceId: 'greenhouse' } },
        ],
      },
      {
        key: 'quotePositions',
        type: 'number[]',
        required: false,
        description: 'One UTF-16 position in the body for each quote, in order. Leave it out to put quotes before the words.',
        example: [0, 12],
      },
      {
        key: 'lead',
        type: 'Context',
        required: false,
        description:
          'WHERE THIS MESSAGE OFFERS TO TAKE THE READER: a thing on a page, and optionally the exact words inside ' +
          'it. The same shape as `target` above, because it is the same question asked for a different reason \u2014 ' +
          '`target` says what this message is ABOUT and this says where it wants to TAKE you. NOTHING MOVES A ' +
          'PERSON\u2019S PAGE BECAUSE OF THIS FIELD. Unless that person has said they are following the agent that ' +
          'sent it, a lead is drawn as an offer with one button and the page stays where it is. ' +
          WHEN_TO_SEND_A_LEAD,
        example: { target: { kind: 'record', recordId: 'PtnsAZ3meHwk', workspaceId: 'greenhouse' } },
      },
      {
        key: 'recipientHint',
        type: 'string',
        required: false,
        description:
          'WHO A COMMENT SEEMED TO BE FOR, in the words the writer used. A HINT AND NOT A DECISION: nothing routes ' +
          'anything from it, and a comment is never refused because of who it might be sent to. Only a message with ' +
          'a target carries one, because it is about a comment nobody has chosen a reader for yet.',
        example: 'whoever ran the calibration on Tuesday',
      },
      {
        key: 'chosenRecipient',
        type: 'ChosenRecipient',
        required: false,
        description:
          'WHO SOMEBODY CHOSE A COMMENT TO GO TO, which is a decision and not a hint. Leave it out when nobody has ' +
          'chosen. Sending is a separate act: this says where the comment WOULD go and nothing goes anywhere until ' +
          'somebody presses send. Set it to null to unchoose.',
        example: { kind: 'new', said: 'a new agent' },
      },
      { key: 'from', type: 'string', required: false, description: 'WHO IT IS FROM IN SOMEBODY\u2019S OWN WORDS, kept exactly as typed. `sentBy` above is the addressable half; this is the line a person or an agent wrote, and several of the ones already stored name nothing in either registry.', example: 'claude-code \u00b7 session touch' },
      {
        key: 'read',
        type: 'boolean',
        required: false,
        description:
          'NOT WHETHER THE MESSAGE HAS BEEN READ. That is the delivery row, at GET /api/messages/:id, and this ' +
          'field is neither read nor written by anything in this build. It is what the messages written before ' +
          'delivery marks existed carry, and it is still declared so those records stay writable: a key a kind ' +
          'does not declare makes the next write to the record it sits on fail, which would delete somebody\u2019s ' +
          'history by making it unwritable. Writing it here moves nothing: POST /api/messages/:id/mark is the door ' +
          'to the store, and the number on the circle counts what that door writes.',
        example: false,
      },
      {
        key: 'inReplyTo',
        type: 'string',
        required: false,
        description:
          'THE MESSAGE THIS ONE ANSWERS, by its record id. Written by the worker on an agent\u2019s reply, and by ' +
          'the answer a person types into an agent\u2019s comment card, where it names the last thing that agent ' +
          'said about that place. It is also how the loop guard counts: an agent\u2019s reply that starts another ' +
          'agent\u2019s run is one hop, and the chain is followed back to the last message a person sent. Leave it ' +
          'out when this message answers nothing. LEAVING IT OUT DOES NOT MAKE A COMMENT A FIRST REMARK: when a ' +
          'message with a target does not say what it answers, Mole Office works that out from the place it is ' +
          'about and who it is addressed to, and announces it as an answer if one of them has already spoken there.',
        example: 'NAKz9LZd928j',
      },
      {
        key: 'fromRun',
        type: 'string',
        required: false,
        description:
          'THE RUN THESE WORDS CAME OUT OF, by the session record id of that run. Present on a reply the worker ' +
          'filed after reading a run\u2019s output, so a reader can open the run and see what it was given, what ' +
          'it cost and when it ended. Absent on a message somebody wrote themselves.',
        example: 'Lpl1JKtjwQUA',
      },
      {
        key: 'runWasAskedFor',
        type: 'RunWasAskedFor',
        required: false,
        description:
          'THE PERSON PRESSED TO START A RUN FOR THIS MESSAGE, OR A SECRETARY HOLDING THE PERSON\u2019S GRANT PRESSED ' +
          'IT FOR THEM WHERE THIS OFFICE\u2019S LIST OF WHAT THE GRANT CARRIES SAYS SO. Where an agent cannot be ' +
          'reached and a run would have to be started, ask the person first. A message to an agent nobody is ' +
          'answering as waits, and the chat offers the press; this field is what the press writes. WRITTEN BY ' +
          'MOLE OFFICE AND NOT BY THE WRITER, through POST /api/messages/<id>/start-an-agent: the secretary card ' +
          'keeps this press for the person by default, any other agent is refused, and a writer that could fill ' +
          'this in could start a run in the person\u2019s name. Absent means nobody has pressed, which is the state ' +
          'every message is sent in.',
        example: { at: '2026-09-07 19:04:11', by: 'owner' },
      },
      {
        key: 'carriedTo',
        type: 'Record<string, unknown>[]',
        required: false,
        description:
          'WHERE THE PRESS TO START A NEW AGENT CARRIED THIS MESSAGE. One entry per carry: the agent it was ' +
          'waiting for (`from`, `fromHandle`), the new agent it went to (`to`, `toHandle`), the copy the press ' +
          'made (`copy`, or null) and when (`at`). The chat draws it on the message in the page\u2019s language. ' +
          'WRITTEN BY MOLE OFFICE AND NOT BY THE WRITER: a value sent with the message is dropped, and only the ' +
          'press may add it. Absent means the press never carried this message.',
        example: [{ from: 'aB3dEf7hIjKl', fromHandle: 'codex-elsewhere', to: 'mN4oPq8rStUv', toHandle: 'codex-elsewhere-2', copy: 'wX5yZa9bCdEf', at: '2026-10-04 04:02:11' }],
      },
      {
        key: 'routed',
        type: 'Record<string, unknown>[]',
        required: false,
        description:
          'WHERE THE MESSAGE WENT WHEN ITS ADDRESSEE COULD NOT BE REACHED. ' +
          'WRITTEN BY MOLE OFFICE AND NOT BY THE WRITER, at send ' +
          'time, and later by the dead-letter sweep for an addressee that is retired, whose entries say when in ' +
          '`said.sweptAt`: a value sent with the message is dropped, and a patch may not set or change it. The addressee is ' +
          'NEVER replaced and the words are never rewritten \u2014 `to` and `body` keep what the author wrote. One ' +
          'entry per addressee that could not be reached, each carrying the addressee (`for`), the reach reading\u2019s ' +
          'own sentence (`because`), the one participant the copy went to (`to`, null when that is the sender), the ' +
          'rungs passed over (`passedOver`, each `{who, because}`), the finished English line (`line`) an agent reads, ' +
          'and what that line was built from (`said`: the names and readings), from which a page builds the same line ' +
          'in its own language. An entry written before `said` was stored is drawn from its English `line`. Absent ' +
          'means nobody had to route the message, which is nearly every message.',
        example: [
          {
            for: { kind: 'agent', id: 'live-undergone' },
            because: 'This agent was retired: the piece of work is done. Nothing new is given to a retired agent.',
            to: { kind: 'agent', id: 'secretary-1' },
            passedOver: [],
            line:
              'a worker could not be reached when this was sent: it is retired. Mole Office also gave it to secretary-1, ' +
              'the first one up a worker\u2019s chain of starters who could be reached.',
          },
        ],
      },
      {
        key: 'saidInFull',
        type: 'string',
        required: false,
        description:
          'THE WHOLE SENTENCE BEHIND A LINE MOLE OFFICE WROTE, when there is more to say than the few words in '
          + '`body`. A line Mole Office writes says what happened in a few words \u2014 "Agent run '
          + 'ended", "Mole Office restarted" \u2014 and the sentence naming the run, the minutes or the reason is '
          + 'this field, drawn as the block\u2019s hover text. Absent means the few words are the whole of it, not '
          + 'that nobody wrote the sentence. Absent on every message somebody wrote themselves: it is not a place '
          + 'for a longer version of what a person said.',
        example:
          '10 minutes passed with nothing more said, so this agent\u2019s run has ended. Write again whenever you '
          + 'like. The next message starts a new run, which will not remember this one.',
      },
      {
        key: 'summons',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'THIS MESSAGE IS A SUMMONS, and what a tool that takes it to the person another way may read of it: who called, how ' +
          'urgent and the title. WRITTEN BY MOLE OFFICE AND NOT BY THE WRITER, by the summons ' +
          'door when a secretary calls the person in (POST /api/office/summon): a value sent with a message is dropped, and a ' +
          'patch may not set, change or remove it, so no writer can make a message the mail tool would carry to the person. ' +
          'GET /api/office/summonses reads it. Absent on every other message.',
        example: { who: 'The secretary', urgency: 'now', title: 'The nightly build is red' },
      },
      {
        key: 'carries',
        type: 'string[]',
        required: false,
        description:
          'THE COMMENTS THIS MESSAGE CARRIES, by record id, when it is the message a sent review gave one agent. The send ' +
          'archived each comment’s own queued delivery to that agent, with a sentence naming this message, so the agent ' +
          'is given the words once, here. A press to start a run for one of those comments asks for this message’s run. ' +
          'WRITTEN BY MOLE OFFICE AND NOT BY THE WRITER, by the review’s send: a value sent with a message is dropped, and ' +
          'a patch may not set, change or remove it. Absent on every other message.',
        example: ['q7c2mx9kd4wa', 'r5t8nb3hz6ye'],
      },
      {
        key: 'aboutRun',
        type: 'string',
        required: false,
        description:
          'WHICH RUN THIS LINE IS ABOUT, by the session record id of that run. Present on a line Mole Office itself ' +
          'wrote to say what happened to a run \u2014 it waited for the next message and none came, or a restart cut it ' +
          'off before it answered. It is what makes such a line get written once: whether a run has already been ' +
          'said goodbye to is read from the conversation rather than from a flag stored beside it. Absent on every ' +
          'message somebody wrote.',
        example: 'Lpl1JKtjwQUA',
      },
      {
        key: 'aboutMessage',
        type: 'string',
        required: false,
        description:
          'WHICH MESSAGE THIS LINE IS ABOUT, by its record id. A notice Mole Office writes about a ' +
          'conversation is a system line in that conversation, and this is how a reader finds which conversation ' +
          'without the notice being addressed to the agent whose conversation it is. Present on the cap-stopped ' +
          'notice and on the stop-cause notice; absent on every message somebody wrote and on every other ' +
          'system line.',
        example: 'YiFAJoP46QYX',
      },
      {
        key: 'foldedInto',
        type: 'string',
        required: false,
        description:
          'THE LINE THIS ONE IS FOLDED INTO, by its record id. Present only on a line Mole Office wrote into a ' +
          'group and later folded under one newer line of its own in the same group, so the group draws the one ' +
          'line and opens the folded ones under it. Nothing folded is deleted. WRITTEN BY MOLE OFFICE AND NOT BY ' +
          'THE WRITER: a message that carries it is refused, and a patch may not set, change or take it off. ' +
          'Absent on every other message.',
        example: 'Xq2LmP0aTr8c',
      },
      {
        key: 'deliveredOnlyTo',
        type: 'ParticipantRef[]',
        required: false,
        description:
          'THE MEMBERS OF THE GROUP THIS LINE IS DELIVERED TO, when it is not every member. WRITTEN BY MOLE OFFICE ' +
          'AND NOT BY THE WRITER: a message from anybody else that carries it is refused. Older dead-letter sweep ' +
          'group lines carry it. Current sweep notices address only the named secretary, or nobody, with no group address. ' +
          'A line using this field stays readable in its group; only the delivery rows, which wake a ' +
          'reader, are narrowed. Absent means every member, which is nearly every group message.',
        example: [{ kind: 'agent', id: 'aB3dEf7hIjKl' }],
      },
      {
        key: 'notice',
        type: 'string',
        required: false,
        description:
          'WHAT KIND OF NOTICE THIS IS, on a message Mole Office or the inspector wrote, so that a message that asks ' +
          'nothing of its reader waits until the reader looks instead of waking them. The ' +
          'kind decides whether the message wakes its reader: a notice that asks nothing does not end a waiter\u2019s ' +
          'hold, and is handed over with the next message that does, and the inbox shows it as any other. The kinds, ' +
          'each with whether it wakes and why, are listed in src/server/lib/notices.ts. WRITTEN BY MOLE OFFICE OR THE ' +
          'INSPECTOR: a message from anybody else that carries it is refused, a kind the list does not hold is ' +
          'refused, and a patch may not set or change it. Absent on every message a person or another agent writes, ' +
          'and on a notice written before 6 October 2026; a message without it always wakes its reader.',
        example: 'aRunWasSealed',
      },
      {
        key: 'deadLetterSweep',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'WHAT ONE DEAD-LETTER SWEEP DID, on its direct notice to the named secretary, or its retained notice with no ' +
          'recipient. Older sweep lines have a group address. WRITTEN BY MOLE OFFICE: `waiting` lists the letters that still wait for a secretary to be named, each as its message id ' +
          'and its addressee’s id joined by "~", so the next sweep writes no second line about the same letters. ' +
          '`said` holds the facts the line’s sentence says (what the sweep archived, passed on, gave to the secretary ' +
          'and left waiting, and who the line was sent to and why), so a page says the sentence in its own language; ' +
          'a line written before 3 October 2026 has no `said`. ON THE ONE MESSAGE A SWEEP SENDS EACH RECEIVER OF ' +
          'AGENTS\u2019 LETTERS TO RETIRED AGENTS, `summary` holds when the sweep looked, how many letters it routed to ' +
          'that receiver, and for which retired addressees, so a page says the message in its own language. Absent on ' +
          'every other message.',
        example: { waiting: ['YiFAJoP46QYX~aB3dEf7hIjKl'] },
      },
      {
        key: 'askedToResolve',
        type: 'Record<string, unknown>',
        required: false,
        description:
          '{entry, files, red, brief, agent, until}: WHAT A PROGRAM READS OFF THE ONE MESSAGE THAT ASKS A MERGE ENTRY\u2019S ' +
          'SUPERVISOR TO RESOLVE A CONFLICT, OR FIX TESTS RED ONLY WITH THE ENTRY, THAT THE QUEUE HANDED ON. `entry` is the merge entry, `files` the files to resolve, ' +
          'empty for red tests, `red` the red tests to fix, present only for red tests, ' +
          '`brief` the absolute path of the resolve brief the office wrote into the asked agent\u2019s sandbox or null when it ' +
          'wrote none, `agent` the registry id of the agent to ask for or null when no agent told of the entry\u2019s end may ' +
          'hand a resolution over, and `until` the end of the time set for resolving a conflict on the Gates panel as an instant in UTC. The entry\u2019s `resolving.asked` says ' +
          'why a brief or an agent is missing. WRITTEN BY MOLE OFFICE: a message from anybody else that carries it is ' +
          'refused, and a patch may not set or change it. Absent on every other message.',
        example: { entry: 'Xq2LmP0aTr8c', files: ['src/x.ts'], brief: '/srv/mole-office-fixtures/.cache/mole-office/sandboxes/s1/briefs/resolve-Xq2LmP0aTr8c.md', agent: 'aB3dEf7hIjKl', until: '2026-10-17T09:10:00.000Z' },
      },
      {
        key: 'urgent',
        type: 'boolean',
        required: false,
        description:
          'SENT AS AN EMERGENCY, and emergencies only. TO AN AGENT it means: where the runtime lets a running ' +
          'session be reached, the waiter reaches it; where it ' +
          'cannot, the message is first in that agent\u2019s queue and carries the urgent mark. Which of the two a ' +
          'runtime gets is read off the measurements in src/shared/waking.ts and is nobody\u2019s choice. TO A ' +
          'PERSON it is a dialogue in the page with everything behind it blurred, dismissed by one press. Absent ' +
          'or false is an ordinary message.',
        example: true,
      },
      {
        key: 'asksThePerson',
        type: 'boolean',
        required: false,
        description:
          'THIS MESSAGE ASKS THE PERSON SOMETHING AND WANTS THEIR ANSWER. The writer sets it to true when it writes a ' +
          'question to the person, and Mole Office then lists the message under "Waiting for your answer" on the ' +
          'Messages page until they write back to the sender. Mole Office never works this out from the words: a ' +
          'question mark is not a question. Set it to false to say the message asks nothing. LEAVING IT OUT IS NOT ' +
          'FALSE: it means nobody said, which is every message written before this field existed. It goes only on a ' +
          'message whose `to` names a person, never on a message to a group, and it is set when the message is ' +
          'written: a later write may not set, change or take it off. WAITING FOR THEIR ANSWER means: this field is ' +
          'true, the message was addressed to them, and they have written nothing to its sender since, in any project. ' +
          'GET /api/messages?only=waiting-for-my-answer answers those messages for whoever asks, and every message ' +
          'on GET /api/messages?full=1 carries this field as true, false or null.',
        example: true,
      },
      {
        key: 'intent',
        type: unionOf(INTENT_MARKS),
        required: false,
        description:
          'WHAT THE PERSON WANTS BACK, the mark they put on a message to an agent: ' +
          '"just-ask" is answer only and change nothing; "proposal-first" is come back with a proposal and build ' +
          'nothing until the person says yes; "align" is agree first, restate what was agreed and act only after the ' +
          'person\u2019s yes to that; "give-options" is come back with two or three options, each with its cost and ' +
          'one recommended, and build nothing until the person chooses one; "none" asks none of these. ONLY THE PERSON SETS IT, on a message they write, ' +
          'when they write it: an agent that sends it is refused, and a later write may not set, change or take it ' +
          'off. LEAVING IT OUT means nobody set a mark, which is every agent\u2019s message and every message written ' +
          'before this field existed. Every read an agent makes of a marked message carries the mark and the ' +
          'person\u2019s instruction for it, when they set one.',
        example: 'just-ask',
      },
      {
        key: 'label',
        type: 'MessageLabel',
        required: false,
        description:
          'A LABEL OF THE PERSON\u2019S OWN, a short word and a colour they made in Settings, which they put on a ' +
          'message they write. The message keeps only its word and colour; every read carries the person\u2019s ' +
          'instruction for that flag, when they set one. ONLY THE PERSON ' +
          'SETS IT, on a message they write, when they write it: an agent that sends it is refused, and a later write ' +
          'may not set, change or take it off. LEAVING IT OUT means the person put no label on the message.',
        example: { text: 'Later', colour: 'green' },
      },
      {
        key: 'markedParts',
        type: 'MarkedPart[]',
        required: false,
        description:
          'THE RUNS OF THE MESSAGE\u2019S OWN WORDS THE PERSON MARKED, each with its own flag, in the order they ' +
          'appear. A message carries marked parts or one flag on the whole message (`intent` that asks something, ' +
          'or `label`), never both. ONLY THE PERSON SETS THEM, on a message they write, when they write it: an ' +
          'agent that sends them is refused, and a later write may not set, change or take them off. Every read an ' +
          'agent makes of a message with parts carries each part\u2019s flag name and the person\u2019s instruction ' +
          'for it. LEAVING IT OUT means the message carries no parts.',
        example: [{ from: 12, to: 40, quote: 'Please read the whole table.', intent: 'just-ask' }],
      },
      {
        key: 'onlyOn',
        type: 'OnlyOn',
        required: false,
        description:
          'SHOW THIS TO ONE VIEWER ALONE, by the machine they are reading on and the program they are reading in. ' +
          'An emergency may be sent to one screen alone. It ' +
          'narrows WHO SEES the dialogue and never who the message is addressed to \u2014 `to` is still the ' +
          'answer to that, and the message is in that conversation for everybody. Absent means every viewer the ' +
          'message is addressed to. It is matched against what Mole Office measures on the reader\u2019s own ' +
          'request, never against anything the reader sends.',
        example: { machine: 'desk-pc', program: 'Chrome' },
      },
      {
        key: 'writtenIn',
        type: 'WrittenIn',
        required: false,
        description:
          'WHERE THIS MESSAGE WAS WRITTEN: the project and the page, as the request named them. ' +
          'MOLE OFFICE WRITES IT AND A VALUE YOU SEND IS REPLACED. Every message is kept in the message centre and belongs ' +
          'to no project; this mark is what a project\u2019s pages filter on.',
        example: { project: 'greenhouse', page: '#/chat' },
      },
      {
        key: 'aboutProject',
        type: 'string',
        required: false,
        description:
          'THE PROJECT THIS MESSAGE IS ABOUT, when its writer says so, so that project\u2019s pages show it too. It must be ' +
          'a project that exists. Absent when the writer said none.',
        example: 'greenhouse',
      },
      {
        key: 'writtenFrom',
        type: 'WrittenFrom',
        required: false,
        description:
          'WHERE THIS MESSAGE WAS WRITTEN FROM: the machine, and the browser or runtime. MOLE ' +
          'OFFICE WRITES IT AND A VALUE YOU SEND IS IGNORED — the machine is measured from the connection the ' +
          'write arrived on, and a message able to claim an origin it did not have would be worse than one that ' +
          'says nothing. Absent on every message filed before 6 September 2026, and absence means nobody recorded ' +
          'it rather than that it was written from nowhere.',
        example: { machine: 'desk-pc', how: 'this machine', program: 'Chrome' },
      },
      {
        key: 'pictures',
        type: 'ImageBlock[]',
        required: false,
        description:
          'PICTURES AND FILES THIS MESSAGE CARRIES, each one the same ImageBlock a report is made of: a path on this ' +
          'machine, and words saying what the file is. An agent answering with a screenshot ' +
          'files ONE message rather than a message and a report. THE FILE IS POINTED AT AND NEVER COPIED INTO THE ' +
          'DATABASE, exactly as in a report, so the bytes are read back through GET /api/file — which serves a ' +
          'path only while a live record in this project points at it, and only inside the directories Mole ' +
          'Office may read. A FILE THAT DOOR WOULD NOT SERVE IS REFUSED AT THE SEND, AND NOTHING IS SENT: a path ' +
          'that is not absolute, a file that names a machine, outside every preview root, missing or not a file. The ' +
          'refusal says why and where to put the file. A picture up to 25 MB is shown, a film plays, and any other file is ' +
          'offered to open or save whole, of any size. A person sending one from a browser does not write this field by hand: POST ' +
          '/api/messages/pictures takes the file, stores it inside those directories and hands back the path to ' +
          'put here. HOW A READER SEES IT IS THEIRS AND NOT YOURS: each browser chooses between ' +
          'the picture shown, the picture shown after a press, and the path alone. THE FIELD IS NOT CALLED ' +
          '`blocks`: a message carries files and no other kind of block.',
        example: [
          {
            id: 'p-1',
            type: 'image',
            path: '/srv/mole-office-fixtures/mole-office/data/message-pictures/K3nQ8rTdWm2b.png',
            alt: 'The v3 clamp holding the 60 mm pot at setting 12',
          },
        ],
      },
      {
        key: 'sendId',
        type: 'string',
        required: false,
        // One message per id for each writer, by point 1 of a decision.
        description:
          'THE SENDER’S OWN ID FOR ONE PRESS OF SEND, chosen by the browser and new for every press. ' +
          'When the answer to a send is lost, the chat reads the conversation and finds its own letter ' +
          'by this id, never by its words. Mole Office stores it as sent and hands it back on the message. ONE MESSAGE ' +
          'PER ID FOR EACH WRITER: a second send from the same writer with the same id ' +
          'writes nothing, and answers 200 with the first message as it was stored and `alreadySent`, which says why. ' +
          'Two writers may use the same id. Send a new one for every press, and the same one when you send that press ' +
          'again because its answer was lost.',
        example: 'c2a91f07d4e35b86a01c7e9d',
      },
      {
        key: 'edited',
        type: 'Record<string, unknown>',
        required: false,
        description:
          'THE WORDS WERE CHANGED AFTER THE MESSAGE WAS WRITTEN. Only the ' +
          'writer may change the words (the title and `body`), and only within ' +
          'MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS of writing it, two minutes unless set. WRITTEN BY MOLE OFFICE AND ' +
          'NOT BY THE WRITER: the first change stores when (`at`), who (`by`) and the title and body as first ' +
          'written (`original`), and a later change moves `at` and keeps `original`. A value you send is refused. ' +
          'Absent means the words are as first written.',
        example: {
          at: '2026-09-29 10:04:11',
          by: { kind: 'agent', id: 'builder-aa' },
          original: { title: 'The setting 15 print cracked', body: 'The setting 15 print cracked again.' },
        },
      },
      {
        key: 'writtenTime',
        type: 'ClockStamp',
        required: false,
        description:
          'THE MOMENT THE MESSAGE WAS WRITTEN: the instant beside its stamp, from the one reading of the clock that ' +
          'made the stamp. MOLE OFFICE WRITES IT AND A VALUE YOU SEND IS REPLACED. On the night the clocks go back the ' +
          'stamp alone cannot say which pass of the hour from 01:00 it means, and this can. Absent on a message ' +
          'written before the office kept it, which is read from its stamp.',
        example: { stamp: '2026-10-25 01:30:00', instant: '2026-10-25T01:30:00.000+00:00', offset: '+00:00', timeZone: 'Europe/London' },
      },
      ...commonFields('message'),
    ],
    rules: [
      'a message with no `to` and no `target` is REFUSED, with a sentence saying what to add. It used to be stored ' +
        'as addressed to the owner, because that is what a line on the message board has always been. The reading ' +
        'was right and the place was wrong: it wrote an interpretation into the field an author writes, with ' +
        'nothing saying it was one, so nobody could tell a message addressed to the owner on purpose from one addressed ' +
        'to the owner by that rule. A line for the owner names the owner. The messages already in the corpus keep the ' +
        'reading the migration gave them, and each of their delivery rows says which migration worked it out. A ' +
        '`to` that is present and empty is refused too, and says something different: somebody meant to name ' +
        'somebody and named nobody.',
      'how far a message got with each recipient is not a field. It is one row per recipient, queued then delivered ' +
        'then seen, read at GET /api/messages/:id and changed at POST /api/messages/:id/mark. A mark changes and a ' +
        'field cannot change without a revision.',
      'a `lead` never moves anybody\u2019s page by itself. It is an offer, and the page moves only when the reader ' +
        'presses it or has said they are following the agent that sent it. A visible way to stop following is on ' +
        'screen the whole time somebody is.',
      'when it was sent is the record\u2019s own created time. There is no `sentAt` field and there must not be one: ' +
        'sending a message is creating it, so a second stored copy would be free to disagree with the first.',
    ],
    // NO `sentBy` IN THE EXAMPLE, because a caller never sends one: who sent a message is who wrote
    // it, and the door fills the field in from the actor. An example carrying one would be showing
    // an author a key their own write would be refused over.
    example: {
      body: 'The setting 15 print cracked again. Holding the sweep until you say whether to try PLA.',
      to: [{ kind: 'person', id: 'owner' }],
      from: 'claude-code \u00b7 session touch',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const MESSAGE_SHAPES: Record<string, ShapeSpec> = {
  OnlyOn: {
    name: 'OnlyOn',
    description:
      'ONE VIEWER, by where they are reading. Both parts are optional and both are matched against ' +
      'what Mole Office measured for the reader\u2019s own request \u2014 see the WrittenFrom shape, which is the ' +
      'same two facts about the writer. An empty object narrows nothing and is the same as leaving the field out.',
    fields: [
      {
        key: 'machine',
        type: 'string',
        required: false,
        description:
          'THE MACHINE, by the name Mole Office knows it as: this machine\u2019s hostname, or the tailnet\u2019s ' +
          'name for it. Leave it out to mean every machine.',
        example: 'desk-pc',
      },
      {
        key: 'program',
        type: 'string',
        required: false,
        description:
          'THE BROWSER OR RUNTIME, by the name it gives for itself. Leave it out to mean every program on the ' +
          'machine above.',
        example: 'Chrome',
      },
    ],
  },

  MessageLabel: {
    name: 'MessageLabel',
    description:
      'A LABEL OF THE PERSON\u2019S OWN, a short word and a colour, which they put on a message they write. On the ' +
      'message it is only its word and colour; every read carries the person\u2019s instruction for that flag, when ' +
      'they set one. The rules are in src/shared/message-label.ts.',
    fields: [
      {
        key: 'text',
        type: 'string',
        required: true,
        description:
          `THE WORD, on one line, with no space at its start or end, and at most ${String(LONGEST_LABEL)} characters.`,
        example: 'Later',
      },
      {
        key: 'colour',
        type: unionOf(LABEL_COLOURS),
        required: true,
        description: 'THE COLOUR the person\u2019s screens draw the word in, one of the set the page offers.',
        example: 'green',
      },
    ],
    rules: [`The text is not empty, is on one line, has no space at its start or end, and has at most ${String(LONGEST_LABEL)} characters.`],
  },

  MarkedPart: {
    name: 'MarkedPart',
    description:
      'ONE RUN OF A MESSAGE\u2019S OWN WORDS WITH ITS OWN FLAG, marked by the person who wrote it. A message carries ' +
      'either `markedParts` or one flag on the whole message, never both. The run is named by where it starts and ' +
      'stops and by the words themselves; exactly one of `intent` and `label` says its flag. The rules are ' +
      '`readTheMarkedParts` in src/shared/intent-mark.ts.',
    fields: [
      { key: 'from', type: 'number', required: true, description: 'WHERE THE RUN STARTS in the message\u2019s words, counted from 0.', example: 12 },
      { key: 'to', type: 'number', required: true, description: 'WHERE IT STOPS, so the words are `body.slice(from, to)`.', example: 40 },
      { key: 'quote', type: 'string', required: true, description: 'THE WORDS AT THAT RUN, exactly as the message holds them.', example: 'Please read the whole table.' },
      {
        key: 'intent',
        type: unionOf(INTENT_MARKS),
        required: false,
        description: 'THE FLAG THIS RUN CARRIES, when it is one of the office\u2019s four marks. A part\u2019s mark asks something; "none" is not a flag.',
        example: 'just-ask',
      },
      {
        key: 'label',
        type: 'MessageLabel',
        required: false,
        description: 'THE FLAG THIS RUN CARRIES, when it is a label of the person\u2019s own.',
        example: { text: 'Later', colour: 'green' },
      },
    ],
    rules: [
      'The run lies inside the message\u2019s words, with `to` after `from`, and its `quote` is exactly those words.',
      'The run holds a character a person can see, and starts and ends on one, not on a space or a line break.',
      'Exactly one of `intent` and `label` is set, and an `intent` asks something.',
      'Two parts of one message never share a character of its words.',
    ],
  },

  RunWasAskedFor: {
    name: 'RunWasAskedFor',
    description:
      'THE PERSON PRESSED TO START AN AGENT FOR ONE MESSAGE, OR A SECRETARY HOLDING THE PERSON\u2019S GRANT PRESSED ' +
      'IT FOR THEM WHERE THIS OFFICE\u2019S LIST OF WHAT THE GRANT CARRIES SAYS SO. MOLE OFFICE WRITES IT, NOT THE ' +
      'WRITER: it is written by POST /api/messages/<id>/start-an-agent, the secretary card keeps this press for ' +
      'the person by default, any other agent is refused, and a value sent with the message itself is dropped.',
    fields: [
      {
        key: 'at',
        type: 'string',
        required: true,
        description: 'When they pressed, as a local wall-clock stamp.',
        example: '2026-09-07 19:04:11',
      },
      {
        key: 'by',
        type: 'string',
        required: true,
        description: 'Who pressed, by the id their request was filed under.',
        example: 'owner',
      },
      {
        key: 'expectedMinutes',
        type: 'number',
        required: false,
        description:
          'HOW LONG THE TASK WAS EXPECTED TO TAKE, in whole minutes, typed at the press. The press ' +
          'may carry {"expectedMinutes": 45}; the message worker reads it once per run start and files it on the ' +
          'run\u2019s session record, which is the one place the expected-time reminder reads. Left out when nobody ' +
          'typed one, and then nothing is reminded about the run it starts — no default exists, because a guessed ' +
          'duration would remind healthy runs about a deadline nobody set.',
        example: 45,
      },
    ],
  },

  WrittenIn: {
    name: 'WrittenIn',
    description:
      'WHERE A MESSAGE WAS WRITTEN: the project and the page the writer was on. A ' +
      'message belongs to no project and is kept in the office\u2019s message centre, and this mark says where it was said. ' +
      'MOLE OFFICE WRITES IT, NOT THE WRITER: the project is the one the request named in x-mole-office-workspace and the ' +
      'page is the one it named in x-mole-office-page, and a value you send here is replaced. A key the request did not ' +
      'name is left out, so a message written by a tool that named no project holds no project rather than a guessed one.',
    fields: [
      {
        key: 'project',
        type: 'string',
        required: false,
        description: 'The project the request named when the message was written. Absent when it named none.',
        example: 'greenhouse',
      },
      {
        key: 'page',
        type: 'string',
        required: false,
        description: 'The page the request named when the message was written, as the page gave it. Absent when it named none.',
        example: '#/chat',
      },
      {
        key: 'recordedBy',
        type: 'string',
        required: false,
        description:
          'Who recorded this mark, when it was not recorded at writing. Only the move of every earlier message into the ' +
          'message centre writes it: the project it names is the one that message was filed in.',
        example: 'the move into the message centre: the project this message was filed in before messages left projects',
      },
    ],
  },

  WrittenFrom: {
    name: 'WrittenFrom',
    description:
      'WHERE A MESSAGE WAS WRITTEN FROM: which machine, and what program. ' +
      'MOLE OFFICE WRITES IT, NOT THE WRITER. The machine is measured ' +
      'from the connection and the program is what the writer said it was writing in, and both are stamped by the ' +
      'server on the message as it is filed. A value you send here is ignored: a message that could claim to have ' +
      'been written somewhere it was not is worse than one that says nothing.',
    fields: [
      {
        key: 'machine',
        type: 'string',
        required: false,
        description:
          'THE MACHINE, in its own name where one could be read and as the address it was reached at where one ' +
          'could not. `how` says which. Absent when nothing about the connection named a machine.',
        example: 'desk-pc',
      },
      {
        key: 'how',
        type: unionOf(['this machine', 'an address', THE_PERSONS_NAME_FOR_THE_ADDRESS, 'nobody could tell']),
        required: false,
        description:
          'HOW `machine` WAS ARRIVED AT, so a reader never has to guess whether it is holding a name or an ' +
          'address. "this machine" is the computer Mole Office is running on, by its own hostname. "an address" ' +
          'means the caller was somewhere else and nobody had named the address, which is standing in. "the name the person ' +
          'gave the address" means the person had named that address in their table in Settings, ' +
          '`machine` is their name for it and `address` is the address. "nobody could tell" means the ' +
          'connection said nothing usable. THERE IS NO WORD FOR "the private network named it": naming another ' +
          'machine that way needs a command, and Mole Office has one operating-system layer which has no method ' +
          'for running one.',
        example: 'an address',
      },
      {
        key: 'address',
        type: 'string',
        required: false,
        description:
          'THE ADDRESS THE PERSON\'S NAME STANDS FOR. Present only when `how` is "the name the person gave the address". The ' +
          'message keeps the name it was written with, so a later rename does not change what it says.',
        example: '192.0.2.10',
      },
      {
        key: 'program',
        type: 'string',
        required: false,
        description:
          'THE BROWSER OR THE RUNTIME the writer said it is writing in, in its own words. Absent when the writer ' +
          'said nothing, which is ordinary: nothing on the server can tell one program from another, so this is ' +
          'told rather than measured and is never read as authority.',
        example: 'Chrome',
      },
    ],
  },
}
