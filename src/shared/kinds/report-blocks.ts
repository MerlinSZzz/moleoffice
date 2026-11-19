// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REPORT BLOCKS: the writing a module's summary or a report is made of.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same shapes, the
 * same comments and the same values.
 *
 * THIS FILE IMPORTS `unionOf`, `A_QUOTE_MAY_NOT_BE_HIDDEN` AND THE `ShapeSpec` TYPE FROM
 * ./kind-common.ts, `BLOCK_COMMON_FIELDS` AND `mediaBlockShape` FROM ./block-fields.ts,
 * `CALLOUT_TONES`, `ITEM_STATES`, `PATH_KINDS` AND `SUMMARY_BLOCK_TYPES` FROM ../types.ts, AND
 * THE PROPORTION LIMITS FROM ../beside.ts. IT IMPORTS NOTHING FROM ../kinds.ts, so it makes no
 * runtime cycle through it.
 */
import { A_QUOTE_MAY_NOT_BE_HIDDEN, unionOf, type ShapeSpec } from './kind-common.ts'
import { BLOCK_COMMON_FIELDS, mediaBlockShape } from './block-fields.ts'
import { CALLOUT_TONES, ITEM_STATES, PATH_KINDS, SUMMARY_BLOCK_TYPES } from '../types.ts'
import { MEASURE_PRESETS, MEASURE_RATIO_MAX, MEASURE_RATIO_MIN, PARTS_MAX, PARTS_MIN, SHARE_MAX, SHARE_MIN } from '../beside.ts'

export const REPORT_BLOCK_SHAPES: Record<string, ShapeSpec> = {
  RuleChinese: {
    name: 'RuleChinese',
    description:
      'The Chinese of one rule: a text block\'s heading and text, stored on the block of a chapter record. The English ' +
      'stays the source. A write that changes the block\'s heading or text must set this in the same write, with from ' +
      'naming the new English, or it is refused.',
    fields: [
      { key: 'heading', type: 'string', required: true, description: 'The block\'s heading in Chinese.', example: '先跑对照' },
      { key: 'text', type: 'string', required: true, description: 'The block\'s text in Chinese.', example: '在变异之前，先用同一条命令跑一次不改动的代码。' },
      {
        key: 'from',
        type: 'string',
        required: true,
        description:
          'Which English this was written from: englishHash([heading, text]) of the block, 16 hex characters, with an ' +
          'absent heading read as the empty string. src/shared/english-hash.ts defines it.',
        example: '656eb835c8d14f20',
      },
    ],
  },

  NeutralRule: {
    name: 'NeutralRule',
    description:
      'One rule of a chapter record in neutral words, as the default regulations give it to a new office: no name, no ' +
      'quote, no record id, the person called the person or they. Its Chinese speaks to the person as 你 and about them as 管理员.',
    fields: [
      { key: 'heading', type: 'string', required: true, description: 'The rule\'s name, in neutral English.', example: 'Run a control first' },
      { key: 'text', type: 'string', required: true, description: 'The rule\'s text, in neutral English.', example: 'Run the same command once on the unchanged code before the mutation.' },
      { key: 'zh', type: 'NeutralRuleChinese', required: true, description: 'The same rule in Chinese.', example: { heading: '先跑对照', text: '在变异之前，先用同一条命令跑一次不改动的代码。', from: 'c34e811e200c23c8' } },
      {
        key: 'zhFrom',
        type: "'the chapter records' | 'written for the default set'",
        required: true,
        description: 'Where the Chinese came from: started from the Chinese on the owner\'s own rule, or written for the default set.',
        example: 'the chapter records',
      },
      {
        key: 'from',
        type: 'string',
        required: true,
        description:
          'Which of the owner\'s English this was written from: theEnglishHashOfARule of the rule\'s heading and text, the hash ' +
          'a Chinese half names too (src/shared/office-rules.ts). When the owner\'s rule changes, this no longer matches, and ' +
          'the default regulations refuse the twin until it is written again from the new English.',
        example: '656eb835c8d14f20',
      },
    ],
  },

  NeutralRuleChinese: {
    name: 'NeutralRuleChinese',
    description: 'A neutral rule\'s name and text in Chinese.',
    fields: [
      { key: 'heading', type: 'string', required: true, description: 'The name in Chinese.', example: '先跑对照' },
      { key: 'text', type: 'string', required: true, description: 'The text in Chinese.', example: '在变异之前，先用同一条命令跑一次不改动的代码。' },
      {
        key: 'from',
        type: 'string',
        required: false,
        description:
          'Which English this Chinese was written from: theEnglishHashOfARule of the twin\'s own heading and text, not the ' +
          'owner\'s (src/shared/office-rules.ts). A write that changes the twin\'s English or its Chinese sets it, and the record ' +
          'door refuses one that does not match. A twin written before its Chinese named its English has none, and the ' +
          'default regulations name it.',
        example: 'c34e811e200c23c8',
      },
    ],
  },

  PathRef: {
    name: 'PathRef',
    description:
      'A pointer to something that lives outside Mole Office — a report, a directory, a CAD file, a video. ' +
      'Mole Office points at it and never copies it in, so the file staying where the work happens is the point.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'A stable id, unique within the record.', example: 'clamp-calib' },
      { key: 'label', type: 'string', required: true, description: 'What a reader would call it.', example: 'Calibration output and test captures' },
      {
        key: 'path',
        type: 'string',
        required: true,
        description: 'An absolute path. A relative path means something different depending on where the server was started from.',
        example: '/srv/mole-office-fixtures/projects/greenhouse/docs/close_up_camera',
      },
      {
        key: 'kind',
        type: unionOf(PATH_KINDS),
        required: true,
        description: 'What is at the far end, which decides the icon. `other` is a real answer; guessing a wrong one is not.',
        example: 'dir',
      },
      { key: 'machine', type: 'string', required: false, description: 'Which machine the file is on. Leave it out when it is this one.', example: 'lab-pc' },
    ],
  },

  // ------------------------------------------------------------------ curated summary blocks

  SummaryBlock: {
    name: 'SummaryBlock',
    description:
      `One block of written content, of one of these types: ${SUMMARY_BLOCK_TYPES.join(', ')}. ` +
      'The `type` key decides what the rest of the object has to contain. This is where a chart, an equation ' +
      'or a table goes; there is nowhere else for them. TWO FIELDS HOLD THESE AND NOTHING ELSE DOES: a module ' +
      "keeps its curated summary in `summaryBlocks`, and a report keeps the report itself in `blocks`. It is one " +
      'shape because it is one job — content a person reads — so a chart written on a report is drawn by exactly ' +
      'what draws a chart on a module.',
    discriminator: {
      key: 'type',
      // IN THE ORDER `SUMMARY_BLOCK_TYPES` DECLARES THEM. tests/validate.test.ts compares these
      // keys with that list as a sequence, so a block added to one and not the other is red.
      variants: {
        text: 'TextBlock',
        heading: 'HeadingBlock',
        finding: 'FindingBlock',
        callout: 'CalloutBlock',
        metrics: 'MetricsBlock',
        keyvalue: 'KeyValueBlock',
        list: 'ListBlock',
        checklist: 'ChecklistBlock',
        code: 'CodeBlock',
        quote: 'QuoteBlock',
        path: 'PathBlock',
        chart: 'ChartBlock',
        math: 'MathBlock',
        table: 'TableBlock',
        timeline: 'TimelineBlock',
        image: 'ImageBlock',
        file: 'FileBlock',
        audio: 'AudioBlock',
        video: 'VideoBlock',
        section: 'SectionBlock',
        columns: 'ColumnsBlock',
        grid: 'GridBlock',
        tabs: 'TabsBlock',
        beside: 'BesideBlock',
        world: 'WorldBlock',
        choice: 'ChoiceBlock',
        fillin: 'FillInBlock',
        button: 'ButtonBlock',
        box: 'BoxBlock',
      },
    },
    fields: [],
  },

  TextBlock: {
    name: 'TextBlock',
    description:
      'Prose. The paragraph that says what happened, in the author\'s own words. Markdown: headings, bullet and ' +
      'numbered lists, fenced code, quoted lines, and a table written with pipes all draw as themselves.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary. Ids are what a reorder and a scroll-to anchor address.', example: 'b-what-broke' },
      { key: 'type', type: "'text'", required: true, description: 'Always the string "text".', example: 'text' },
      { key: 'heading', type: 'string', required: false, description: 'An optional heading above the paragraph.', example: 'What broke' },
      { key: 'text', type: 'string', required: true, description: 'The paragraph itself. Up to about a page.', example: 'The shell cracked at setting 15, on the third print of the v3 geometry.' },
      { key: 'tone', type: "'normal' | 'quiet'", required: false, description: 'Quiet draws it as an aside beside the writing rather than as part of it.', example: 'quiet' },
      {
        key: 'zh',
        type: 'RuleChinese',
        required: false,
        description:
          'The Chinese of this block\'s heading and text. Its from must be the hash of the English beside it, ' +
          'englishHash([heading, text]) with a missing heading as the empty string. A page in Chinese draws it in place ' +
          'of the English while that hash matches, on any record; on a chapter record each text block is one rule of ' +
          'the office regulations, and the record door refuses a from that does not match.',
        example: { heading: '先跑对照', text: '在变异之前，先用同一条命令跑一次不改动的代码。', from: '656eb835c8d14f20' },
      },
      {
        key: 'neutral',
        type: 'NeutralRule',
        required: false,
        description:
          'Read only on a chapter record: this rule in neutral words, in English and Chinese, as a new office gets it in the ' +
          'default regulations. Written once by an agent when the rule is agreed, beside the owner\'s own heading and text, ' +
          'which it never replaces. A rule the person marked as only for this office needs none.',
        example: {
          heading: 'Run a control first',
          text: 'Run the same command once on the unchanged code before the mutation.',
          zh: { heading: '先跑对照', text: '在变异之前，先用同一条命令跑一次不改动的代码。', from: 'c34e811e200c23c8' },
          zhFrom: 'the chapter records',
          from: '656eb835c8d14f20',
        },
      },
    ],
  },

  HeadingBlock: {
    name: 'HeadingBlock',
    description:
      'A heading inside the writing. The record\'s own title is the first heading on the page, so these step down ' +
      'from it and never up.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-part-a' },
      { key: 'type', type: "'heading'", required: true, description: 'Always the string "heading".', example: 'heading' },
      { key: 'text', type: 'string', required: true, description: 'The heading itself.', example: 'Part A — the plan surface' },
      {
        key: 'level',
        type: 'number',
        required: false,
        description:
          'How deep: 2 or 3, and nothing else. Left out it is 2, the first level below the record\'s title. There ' +
          'is no level 1 because the record\'s title is the page\'s first heading.',
        example: 2,
      },
    ],
  },

  FindingBlock: {
    name: 'FindingBlock',
    description:
      'The one sentence worth remembering, with its evidence under it. Use it for the conclusion a reader must not ' +
      'miss; ordinary prose goes in a text block.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-the-finding' },
      { key: 'type', type: "'finding'", required: true, description: 'Always the string "finding".', example: 'finding' },
      { key: 'text', type: 'string', required: true, description: 'The sentence itself.', example: 'The mount holds calibration through a full transplant.' },
      { key: 'detail', type: 'string', required: false, description: 'The evidence, in prose. Markdown, like a text block.', example: 'Forty transplants, position error under 0.5 px throughout.' },
      {
        key: 'state',
        type: unionOf(ITEM_STATES),
        required: false,
        description: 'Optional meaning, drawn the same way a checklist item with that state is drawn.',
        example: 'done',
      },
    ],
  },

  CalloutBlock: {
    name: 'CalloutBlock',
    description:
      'Something set apart from the writing, saying why it is set apart: a note beside it, or a warning about it. ' +
      'It is not a text block drawn quietly — `tone` is a meaning a reader acts on, not a size. It is not a ' +
      'finding either: a finding is the conclusion of the work, and its state says how the work went, while a ' +
      'warning is not the state of any work.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-careful' },
      { key: 'type', type: "'callout'", required: true, description: 'Always the string "callout".', example: 'callout' },
      {
        key: 'tone',
        type: unionOf(CALLOUT_TONES),
        required: true,
        description:
          'What kind of aside this is. "note" is worth knowing beside the writing; "warning" is something that ' +
          'will cost the reader if they miss it. Required, because an aside that does not say which it is has ' +
          'nothing a text block does not have.',
        example: 'warning',
      },
      { key: 'title', type: 'string', required: false, description: 'What it is about, in a few words.', example: 'The speed only latches on a fresh session' },
      {
        key: 'text',
        type: 'string',
        required: true,
        description: 'The aside itself. Markdown, like a text block.',
        example: 'Re-sending the speed to a session that is already running changes nothing, and nothing says so.',
      },
    ],
  },

  MetricItem: {
    name: 'MetricItem',
    description: 'One measured number, with what it is and what it is measured in.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'm-error' },
      { key: 'label', type: 'string', required: true, description: 'What was measured.', example: 'position error' },
      {
        key: 'value',
        type: 'string',
        required: true,
        description:
          'The value, kept as written. A string rather than a number, so "0.4", "not measured" and "12 of 40" are ' +
          'all sayable. Nothing adds these up.',
        example: '0.4',
      },
      { key: 'unit', type: 'string', required: false, description: 'Shown after the value, e.g. "px".', example: 'px' },
      { key: 'note', type: 'string', required: false, description: 'One line under it saying how it was arrived at.', example: 'Over 40 test frames.' },
      {
        key: 'state',
        type: unionOf(ITEM_STATES),
        required: false,
        description: 'Optional meaning, e.g. a number that came out of a run that failed.',
        example: 'failed',
      },
    ],
  },

  MetricsBlock: {
    name: 'MetricsBlock',
    description: 'A row of measured numbers, drawn large enough to read from across the room.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-numbers' },
      { key: 'type', type: "'metrics'", required: true, description: 'Always the string "metrics".', example: 'metrics' },
      {
        key: 'items',
        type: 'MetricItem[]',
        required: true,
        description: 'The numbers, in the order they should be read. At least one.',
        example: [{ id: 'm-error', label: 'position error', value: '0.4', unit: 'px' }],
      },
    ],
  },

  KeyValueItem: {
    name: 'KeyValueItem',
    description: 'One named value: what something is, in one line.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'kv-machine' },
      { key: 'label', type: 'string', required: true, description: 'What this value is called.', example: 'machine' },
      {
        key: 'value',
        type: 'string',
        required: true,
        description: 'The value, kept exactly as written. A string, so a version, a date and a name are all sayable.',
        example: 'lab-pc (192.0.2.21)',
      },
    ],
  },

  KeyValueBlock: {
    name: 'KeyValueBlock',
    description:
      'Named values: what a thing is, one line each — the machine it ran on, the commit, the driver version. ' +
      'IT IS NOT `metrics`, although the fields look the same. A metric is a MEASUREMENT: it has a unit, it can ' +
      'carry a state, and it is drawn large because a reader scans a row of them for magnitude. One of these is ' +
      'a stated fact: nothing measured it, and a reader looks one up rather than scanning them all.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-setup' },
      { key: 'type', type: "'keyvalue'", required: true, description: 'Always the string "keyvalue".', example: 'keyvalue' },
      {
        key: 'items',
        type: 'KeyValueItem[]',
        required: true,
        description: 'The values, in the order they should be read. At least one, at most forty.',
        example: [{ id: 'kv-machine', label: 'machine', value: 'lab-pc (192.0.2.21)' }],
      },
    ],
  },

  ListBlock: {
    name: 'ListBlock',
    description:
      'A bulleted or numbered list. A list inside a paragraph of markdown draws the same way; this is for a list ' +
      'that is a block on its own.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-steps' },
      { key: 'type', type: "'list'", required: true, description: 'Always the string "list".', example: 'list' },
      { key: 'items', type: 'string[]', required: true, description: 'One string per item. At least one.', example: ['Print the v3 shell', 'Calibrate at setting 12'] },
      { key: 'ordered', type: 'boolean', required: false, description: 'Numbered rather than bulleted. Use it when the order is the point.', example: true },
    ],
  },

  ChecklistItem: {
    name: 'ChecklistItem',
    description: 'One thing on a checklist, and where it stands.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'c-limit' },
      { key: 'text', type: 'string', required: true, description: 'The thing itself.', example: 'The closing limit is re-sent on every fresh session' },
      {
        key: 'state',
        type: unionOf(ITEM_STATES),
        required: true,
        description:
          'Where it stands. Required, and it is what makes this a checklist rather than a list: a reader counts ' +
          'the ticks, so an item that says nothing makes the count wrong.',
        example: 'done',
      },
      { key: 'note', type: 'string', required: false, description: 'Why it stands there, when the item alone does not say it.', example: 'Proved on the bench, 18 August.' },
    ],
  },

  ChecklistBlock: {
    name: 'ChecklistBlock',
    description:
      'A list where every item says where it stands. Use `list` when the items have no state — a checklist half ' +
      'of whose items say nothing is a list that a reader will count the ticks on and get a wrong answer.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-before-the-run' },
      { key: 'type', type: "'checklist'", required: true, description: 'Always the string "checklist".', example: 'checklist' },
      {
        key: 'items',
        type: 'ChecklistItem[]',
        required: true,
        description: 'The items, in the order they should be read. At least one.',
        example: [{ id: 'c-limit', text: 'The closing limit is re-sent on every fresh session', state: 'done' }],
      },
    ],
  },

  CodeBlock: {
    name: 'CodeBlock',
    description: 'A block of code or of terminal output, drawn in the fixed-width face and never reflowed.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-command' },
      { key: 'type', type: "'code'", required: true, description: 'Always the string "code".', example: 'code' },
      { key: 'code', type: 'string', required: true, description: 'The characters, exactly as they are. Blank lines are kept.', example: 'npm test' },
      { key: 'language', type: 'string', required: false, description: 'What it is written in. Drawn as a small label; nothing is coloured by it.', example: 'bash' },
      { key: 'caption', type: 'string', required: false, description: 'One line under it saying what it is.', example: 'The command that reproduced it.' },
    ],
  },

  QuoteBlock: {
    name: 'QuoteBlock',
    description: 'Somebody else\'s words, kept as theirs.',
    fields: [
      // NOT `...BLOCK_COMMON_FIELDS`, and the difference is the rule. A quote may never be marked
      // for developers, by anybody: `projections.md` §9.2 rule 2. The checker in
      // `src/server/lib/summary.ts` refuses it, and this line is the same refusal published, so an
      // agent reading `GET /api/kinds` learns the rule instead of meeting it as a 400.
      {
        key: 'audience',
        type: "'everyone'",
        required: false,
        description:
          'The only value a quote block may carry. Every other block type also accepts "developers", which hides it '
          + 'from a normal reader; a quote may not be hidden, because a quote is somebody else\'s words and hiding '
          + 'them is classifying away the original. Put machinery in a `code` block instead.',
        example: 'everyone',
        // AND THE SAME RULE ON THE WAY OUT, in the 400. Without this line the writer who sent
        // "developers" is told the value must be one of: everyone — which is true, and reads as a
        // typo rather than as a rule they cannot get round by spelling it differently.
        refusal: A_QUOTE_MAY_NOT_BE_HIDDEN,
      },
      // AND EVERYTHING ELSE EVERY BLOCK CARRIES, READ FROM THE ONE DECLARATION. Only `audience` is
      // different on a quote, and writing the whole list out by hand to say so lost `measure`: the
      // checker in src/server/lib/summary.ts accepted a reading width on a quote block, this list
      // did not publish it, and a report that stated one was refused with "unknown key measure".
      // Measured on 29 August 2026 across all twenty-one block types: quote was the only one where
      // the two disagreed in that direction.
      ...BLOCK_COMMON_FIELDS.filter((f) => f.key !== 'audience'),
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-their-words' },
      { key: 'type', type: "'quote'", required: true, description: 'Always the string "quote".', example: 'quote' },
      { key: 'text', type: 'string', required: true, description: 'What they said.', example: 'The export button belongs on the first page.' },
      { key: 'source', type: 'string', required: false, description: 'Who said it, and where.', example: 'The owner, 18 August 2026' },
    ],
  },

  PathBlock: {
    name: 'PathBlock',
    description:
      'A pointer into the archive: a report, a directory, a CAD file. The same idea as a PathRef, as a block, so a ' +
      'piece of writing can point at a file where the sentence about it is. Mole Office never copies the file in.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-the-log' },
      { key: 'type', type: "'path'", required: true, description: 'Always the string "path".', example: 'path' },
      { key: 'label', type: 'string', required: true, description: 'What is at the far end, in words.', example: 'The run log' },
      { key: 'path', type: 'string', required: true, description: 'Where it is. Absolute on disk, or a web address.', example: '/srv/mole-office-fixtures/projects/greenhouse/logs/run-18.txt' },
      { key: 'kind', type: unionOf(PATH_KINDS), required: false, description: 'What sort of thing it is, so it is drawn with the right mark.', example: 'code' },
      { key: 'machine', type: 'string', required: false, description: 'Which machine it is on. Leave it out when it is this one.', example: 'lab-pc' },
    ],
  },

  /**
   * A TEST WORLD IN A HANDBACK. Criterion C31.
   *
   * The block a handback carries when the person has to go and look at a feature rather than read
   * about it. It is the address, what to look at, and the ledger row that says whether it is up.
   */
  WorldBlock: {
    name: 'WorldBlock',
    description:
      'A TEST WORLD THE PERSON IS BEING ASKED TO GO AND LOOK AT, in a handback. A world is a natural place to ' +
      'try a new feature: the person can be asked to look at it there, and then decide whether it needs changing. A world is a builder\'s own Mole Office, serving a copy of the corpus ' +
      'on its own ports, started by tools/isolated-mole-office.mjs. The page draws the address as a press that ' +
      'opens it, and reads the ledger row to say whether it is still up. ONLY A HANDBACK THAT ASKS FOR IT CARRIES ' +
      'ONE: nothing makes a builder keep a world running, and a picture does not replace the world when the world ' +
      'can be opened.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-the-world' },
      { key: 'type', type: "'world'", required: true, description: 'Always the string "world".', example: 'world' },
      {
        key: 'label',
        type: 'string',
        required: true,
        description: 'What the person should go and look at, in words. Not the name of the instance.',
        example: 'The check panel on a run that was refused',
      },
      {
        key: 'web',
        type: 'string',
        required: true,
        description: 'The address to open. It is what the press on the page goes to.',
        example: 'http://127.0.0.1:41573',
      },
      {
        key: 'api',
        type: 'string',
        required: false,
        description: 'The API behind it, where that is worth naming. Leave it out where it is not.',
        example: 'http://127.0.0.1:41572',
      },
      { key: 'webForOtherMachines', type: 'string', required: false, description: 'Where another machine opens this world. Absent means it is reachable from this machine only.', example: 'http://office.example:41573' },
      { key: 'apiForOtherMachines', type: 'string', required: false, description: 'Where another machine reaches this world’s API.', example: 'http://office.example:41572' },
      {
        key: 'ledgerRow',
        type: 'string',
        required: false,
        description:
          'THE LEDGER ROW THIS WORLD HOLDS, by id, so the page can say whether it is still up and offer the press ' +
          'that stops it. ABSENT MEANS NOBODY REGISTERED IT, and the page says that rather than drawing a world it ' +
          'cannot see as running. GET /api/resources lists the rows; POST /api/resources/<id>/release is the press.',
        example: 'rs_9Oh9bmQ4clk',
      },
      {
        key: 'because',
        type: 'string',
        required: false,
        description:
          'Why it is being kept up: what the person is being asked to decide by looking. What they decide there is ' +
          'recorded on the criterion.',
        example: 'Whether the words on the five standings are the ones they want a reader to see.',
      },
    ],
  },

  /**
   * THE THREE BLOCKS THE PERSON ANSWERS IN A REPORT, AND THE BOX THAT GROUPS
   * THEM. The answers are kept in the report's `answers` field, which only
   * the answer door writes; src/shared/answers.ts says which answers a press sends.
   */
  ChoiceBlock: {
    name: 'ChoiceBlock',
    description:
      'A QUESTION THE PERSON ANSWERS BY CHOOSING, in a report only. Two to four options; one of them, or several when ' +
      '`many` is true. Mark the option you recommend with `recommended`. The page always offers the person a line of ' +
      'their own words as well. When the answer is sent, it is recorded at once as the person\'s decision, with their ' +
      'words, linked to this report; when `about` names a proposal, that decision settles it, and when it names a ' +
      'decision, the new one replaces it. Only the person may answer: an agent\'s press is refused. ' +
      'HOW AN AGENT READS THE ANSWERS: the submit sends ONE message to the agent named, through the message door, so its waiter wakes. ' +
      'The message lists each answer and leads back to the report; the report\'s `answers` field holds them too, one entry per block id, ' +
      'with what was sent, by whom, when and the decision a choice was recorded as. docs/questions-in-reports.md has a whole example.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this report. The answer is kept under it.', example: 'q-licence' },
      { key: 'type', type: "'choice'", required: true, description: 'Always the string "choice".', example: 'choice' },
      {
        key: 'question',
        type: 'string',
        required: true,
        description: 'The question, in words the person can answer without reading anything else. At most 1000 characters.',
        example: 'Which licence should the published package carry?',
      },
      {
        key: 'options',
        type: 'ChoiceOption[]',
        required: true,
        description: 'Two to four options. Each id is what the answer stores, so keep it when you correct the words.',
        example: [
          { id: 'a', label: 'MIT, as the code already says', recommended: true },
          { id: 'b', label: 'Apache 2.0' },
        ],
      },
      {
        key: 'many',
        type: 'boolean',
        required: false,
        description: 'True when the person may choose more than one option. Left out, they choose one.',
        example: false,
      },
      {
        key: 'about',
        type: 'string',
        required: false,
        description:
          'The id of the proposal or the decision this question is about. The decision the answer is recorded as links to ' +
          'it: it settles a proposal, and it replaces a decision. Leave it out when the question is new. A write that names ' +
          'no proposal or decision of this project is refused, so no example is given: no id is valid in every project.',
        // NO EXAMPLE, ON PURPOSE: an id is valid only in the project that holds its record, and an example an agent copies
        // and is refused for is worse than none (tests/a-block-addressed-to-the-owner.test.ts says why).
        example: undefined,
      },
    ],
  },

  ChoiceOption: {
    name: 'ChoiceOption',
    description: 'One option of a choice.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within the choice. The answer stores it.', example: 'a' },
      { key: 'label', type: 'string', required: true, description: 'The option, in words. At most 300 characters.', example: 'MIT, as the code already says' },
      {
        key: 'recommended',
        type: 'boolean',
        required: false,
        description: 'True on the option the writer recommends. At most one option of a single choice carries it.',
        example: true,
      },
    ],
  },

  FillInBlock: {
    name: 'FillInBlock',
    description:
      'A BOX THE PERSON FILLS IN WITH THEIR OWN WORDS, in a report only: one line, or several. The words are sent with ' +
      'the box or the report they sit in. They are not recorded as a decision. ' +
      'HOW AN AGENT READS THE ANSWERS: the submit sends ONE message to the agent named, through the message door, so its waiter wakes. ' +
      'The message lists each answer and leads back to the report; the report\'s `answers` field holds them too, one entry per block id, ' +
      'with what was sent, by whom, when and the decision a choice was recorded as. docs/questions-in-reports.md has a whole example.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this report. The answer is kept under it.', example: 'q-holder' },
      { key: 'type', type: "'fillin'", required: true, description: 'Always the string "fillin".', example: 'fillin' },
      {
        key: 'asks',
        type: 'string',
        required: true,
        description: 'The sentence that says what to write. At most 1000 characters.',
        example: 'Whose name should the copyright line carry?',
      },
      {
        key: 'lines',
        type: "'one' | 'many'",
        required: false,
        description: 'How tall the box starts: "one" for a short answer, "many" for a longer one. Left out, "one". Either ' +
          'box takes line breaks and grows as the person writes.',
        example: 'one',
      },
      // Narrow by default, and the writing agent may choose.
      {
        key: 'boxWidth',
        type: "'narrow' | 'wide'",
        required: false,
        description:
          'How wide the answer box is, as you choose it for the answer you expect: "narrow" (as narrow as the ' +
          'choices, 36rem, for a short answer) or "wide" (the whole column). Left out, a one-line box is narrow ' +
          'and a box of several lines is wide.',
        example: 'wide',
      },
    ],
  },

  ButtonBlock: {
    name: 'ButtonBlock',
    description:
      'ONE PRESS THAT TAKES EFFECT, in a report only: for something the person only has to agree to. The page asks once ' +
      'more before it acts, and the press is then sent at once, on its own, to the agent the button names. A button ' +
      'never sits in a box, because it is sent by its own press. ' +
      'HOW AN AGENT READS THE ANSWERS: the submit sends ONE message to the agent named, through the message door, so its waiter wakes. ' +
      'The message lists each answer and leads back to the report; the report\'s `answers` field holds them too, one entry per block id, ' +
      'with what was sent, by whom, when and the decision a choice was recorded as. docs/questions-in-reports.md has a whole example.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this report. The press is kept under it.', example: 'q-start' },
      { key: 'type', type: "'button'", required: true, description: 'Always the string "button".', example: 'button' },
      { key: 'label', type: 'string', required: true, description: 'The words on the button. At most 200 characters.', example: 'Start the work' },
      {
        key: 'confirm',
        type: 'string',
        required: false,
        description: 'The question the page asks before the press takes effect. Left out, the page asks whether they are sure.',
        example: 'Start the work on the licence now?',
      },
      {
        key: 'to',
        type: 'string',
        required: false,
        description:
          'The agent the press is sent to, by handle or id. Left out, the agent that wrote the report. A write that names no ' +
          'registered agent is refused, so no example is given: no agent is registered in every office.',
        // NO EXAMPLE, ON PURPOSE: see `about` on ChoiceBlock.
        example: undefined,
      },
    ],
  },

  BoxBlock: {
    name: 'BoxBlock',
    // ONE SUBMIT FOR THE WHOLE REPORT (wave 13u round 19). The answer door still takes a press
    // scoped to one box (src/shared/answers.ts), and no page presses it.
    description:
      'A BOX OF QUESTIONS UNDER ONE TITLE, in a report only. The page draws no submit for a box: a report is answered ' +
      'with ONE submit for the whole report, which the page draws straight after the last choice or fill-in box, or after ' +
      'the box that holds it. That submit sends every answer not sent yet, inside boxes and outside them, each to the ' +
      'agent its box names, so the box\'s title is what says what its questions are about. A block sits in one box only, so ' +
      'a report with a box inside a box, or with a button inside a box, is refused when it is written. ' +
      'HOW AN AGENT READS THE ANSWERS: the submit sends ONE message to each agent named, through the message door, so its waiter wakes. ' +
      'The message lists each answer and leads back to the report; the report\'s `answers` field holds them too, one entry per block id, ' +
      'with what was sent, by whom, when and the decision a choice was recorded as. docs/questions-in-reports.md has a whole example.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this report. The submit names it.', example: 'box-licence' },
      { key: 'type', type: "'box'", required: true, description: 'Always the string "box".', example: 'box' },
      { key: 'title', type: 'string', required: false, description: 'What the questions in it are about.', example: 'The licence' },
      {
        key: 'to',
        type: 'string',
        required: false,
        description:
          'The agent its answers are sent to, by handle or id. Left out, the agent that wrote the report. A write that names ' +
          'no registered agent is refused, so no example is given: no agent is registered in every office.',
        // NO EXAMPLE, ON PURPOSE: see `about` on ChoiceBlock.
        example: undefined,
      },
      {
        key: 'blocks',
        type: 'SummaryBlock[]',
        required: true,
        description: 'The blocks inside it, at least one choice or fill-in box among them. No box and no button.',
        example: [
          { id: 'q-holder', type: 'fillin', asks: 'Whose name should the copyright line carry?' },
        ],
      },
    ],
  },

  SectionBlock: {
    name: 'SectionBlock',
    description:
      'A titled run of blocks. One of the two blocks that hold other blocks, and what makes a report a tree rather ' +
      'than a list.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-part-one' },
      { key: 'type', type: "'section'", required: true, description: 'Always the string "section".', example: 'section' },
      { key: 'title', type: 'string', required: false, description: 'What this run of blocks is about.', example: 'What was measured' },
      {
        key: 'blocks',
        type: 'SummaryBlock[]',
        required: true,
        description: 'The blocks inside it, in the order they should be read. At least one.',
        example: [{ id: 'b-inside', type: 'text', text: 'Forty transplants, position error under 0.5 px throughout.' }],
      },
    ],
  },

  ColumnsBlock: {
    name: 'ColumnsBlock',
    description:
      'Blocks side by side. The other block that holds blocks: each column is a list of blocks, so two columns is ' +
      'side by side and three is three across. On a narrow screen the columns stack in the order they are written. ' +
      'It means PARALLEL AND EQUAL — a comparison. For anything that is not equal — writing beside a picture, ' +
      'writing beside a table beside a picture — write a `beside` block instead, where each part is named and can ' +
      'say what it is worth beside the others.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-before-and-after' },
      { key: 'type', type: "'columns'", required: true, description: 'Always the string "columns".', example: 'columns' },
      {
        key: 'columns',
        type: 'SummaryBlock[][]',
        required: true,
        description: 'The columns, left to right. Between two and four of them, each holding at least one block.',
        example: [
          [{ id: 'b-before', type: 'text', heading: 'Before', text: 'The mast moved under load.' }],
          [{ id: 'b-after', type: 'text', heading: 'After', text: 'The mast is braced and holds.' }],
        ],
      },
    ],
  },

  GridBlock: {
    name: 'GridBlock',
    description:
      'Many of the same kind of thing, across a row and then down. A GALLERY IS ONE OF THESE FULL OF PICTURES, ' +
      'and there is no `gallery` type for that reason. It is not `columns`: `columns` holds a list per column and ' +
      'is read DOWN each one, so nine pictures written as columns have to be transposed by hand and re-cut every ' +
      'time a tenth is added. A grid holds one list, in the order somebody reads it.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-shots' },
      { key: 'type', type: "'grid'", required: true, description: 'Always the string "grid".', example: 'grid' },
      {
        key: 'blocks',
        type: 'SummaryBlock[]',
        required: true,
        description: 'The blocks, in reading order: across a row, then the next row. At least one.',
        example: [{ id: 'g-1', type: 'image', path: '/srv/mole-office-fixtures/projects/x/before.png', alt: 'The mast before bracing' }],
      },
      {
        key: 'across',
        type: 'number',
        required: false,
        description:
          'The most blocks Mole Office will put on one row: 2, 3 or 4. A cap, never a promise — two blocks are two ' +
          'blocks, and a narrow screen fits fewer whatever this says. Left out, as many fit as will stay readable.',
        example: 3,
      },
    ],
  },

  TabPanel: {
    name: 'TabPanel',
    description: 'One tab: what it is called, and what is under it.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'tab-lab-pc' },
      {
        key: 'label',
        type: 'string',
        required: true,
        description: 'What is under this tab, in a word or two. It is the only thing a reader has to choose by.',
        example: 'lab-pc',
      },
      {
        key: 'blocks',
        type: 'SummaryBlock[]',
        required: true,
        description: 'What is under it, in the order it should be read. At least one.',
        example: [{ id: 'tb-1', type: 'text', text: 'Ran clean, 40 of 40.' }],
      },
    ],
  },

  TabsBlock: {
    name: 'TabsBlock',
    description:
      'One thing shown and the rest put away. THE ONLY BLOCK THAT HIDES WHAT IT HOLDS, which is what it is for ' +
      'and also its whole cost: what is under an unopened tab is not on the screen, the browser\'s own find will ' +
      'not reach it, and nobody can leave a comment on it until they open the tab. Use it for material a reader ' +
      'chooses BETWEEN — the same measurement on three machines, one version against another. Anything a reader ' +
      'has to read goes in a `section`.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-per-machine' },
      { key: 'type', type: "'tabs'", required: true, description: 'Always the string "tabs".', example: 'tabs' },
      {
        key: 'tabs',
        type: 'TabPanel[]',
        required: true,
        description:
          'The tabs, left to right. At least two — one tab is a section with everything in it hidden behind a ' +
          'control nobody has a reason to press — and at most eight.',
        example: [
          { id: 'tab-lab-pc', label: 'lab-pc', blocks: [{ id: 'tb-1', type: 'text', text: 'Ran clean, 40 of 40.' }] },
          { id: 'tab-fern', label: 'fern', blocks: [{ id: 'tb-2', type: 'text', text: 'Stopped at run 12.' }] },
        ],
      },
    ],
  },

  BesidePart: {
    name: 'BesidePart',
    description:
      'One part of a composition: what is in it, what it is worth beside the other parts, and how wide the writing ' +
      'inside it reads.',
    fields: [
      {
        key: 'id',
        type: 'string',
        required: true,
        description:
          'This part\'s own name. A comment left on a part is stored against this, so it survives the parts being ' +
          'reordered. Unique within the block.',
        example: 'p-the-writing',
      },
      {
        key: 'share',
        type: 'number | string',
        required: false,
        description:
          'What this part is worth compared with the OTHER parts. TWO SPELLINGS ARE ACCEPTED and both are stored ' +
          `the same way: a whole number \u2014 3 and 2 \u2014 or a percentage of the row \u2014 "60%" and "40%", which have to ` +
          'add up to 100 across the parts. Percentages that do not add up to 100 are refused, never rescaled. ' +
          'WHAT IS STORED IS THE RATIO WITH THE COMMON FACTOR TAKEN OUT, so 60 and 40 are stored as 3 and 2, and ' +
          'what you wrote is kept on the row as "proportions" so the answer can quote it back to you. A whole ' +
          `number after that reduction is between ${String(SHARE_MIN)} and ${String(SHARE_MAX)}. ` +
          'IT IS NEVER A WIDTH: no pixels, no rem, no "fr", no decimals. How wide the WRITING inside this part ' +
          'reads is "measure", which is a separate thing. ' +
          'A preference, never a command \u2014 Mole Office keeps every ' +
          'part wide enough to read, gives the extra to its neighbours when one would be too narrow, and draws them ' +
          'one under another when the screen is too narrow for all of them. Either every part says what it is ' +
          'worth, or none does and Mole Office chooses from what each part holds. To say it once for the whole ' +
          'row instead, write "proportions" on the block.',
        example: 3,
        refusal:
          'it is a proportion between the parts and never a size. Write 3 and 2, or "60%" and "40%", or write ' +
          '"proportions": "60/40" once on the block. To say how wide the writing inside this part reads, which is ' +
          'a different thing, write "measure"',
      },
      {
        key: 'measure',
        type: `number | ${unionOf(MEASURE_PRESETS)}`,
        required: false,
        description:
          'How wide the WRITING inside this part reads. Only on a part that holds writing. Either one of the four ' +
          `widths, widest first, \u2014 ${MEASURE_PRESETS.join(', ')} \u2014 or a plain ratio between ` +
          `${String(MEASURE_RATIO_MIN)} and ${String(MEASURE_RATIO_MAX)} meaning that much of the column. Left out, ` +
          'the writing uses the whole column, which is what `full` means.',
        example: 'narrow',
        refusal:
          'it narrows the TEXT INSIDE the part and never the part itself, so it is a name or a ratio and never a ' +
          'width \u2014 no pixels, no percentage, no rem. To say how much of the row this part is worth beside the ' +
          'others, write "share"',
      },
      {
        key: 'blocks',
        type: 'SummaryBlock[]',
        required: true,
        description: 'What is in this part, in the order it should be read. At least one.',
        example: [{ id: 'bp-1', type: 'text', text: 'The mast moved 4mm under load, every time.' }],
      },
    ],
  },

  BesideBlock: {
    name: 'BesideBlock',
    description:
      'PARTS OF ONE THING, SEEN BESIDE EACH OTHER, each part holding its own blocks. Writing beside a picture; ' +
      'writing beside a table beside a picture; two pictures; a comparison in as many columns as it has sides. ' +
      'It is not `columns`: `columns` means parallel and EQUAL, and its columns cannot be named or weighted. ' +
      'Each part here has a name, so a comment can be left on it, and may say what it is worth beside the others. ' +
      `Between ${String(PARTS_MIN)} and ${String(PARTS_MAX)} parts: one part is the blocks themselves, and five ` +
      'across is unreadable on any screen. Mole Office keeps every part wide enough to read and draws the parts one ' +
      'under another when the screen is too narrow for all of them.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-mast-and-photo' },
      { key: 'type', type: "'beside'", required: true, description: 'Always the string "beside".', example: 'beside' },
      {
        key: 'proportions',
        type: 'string',
        required: false,
        description:
          'WHAT THIS ROW IS DIVIDED INTO, SAID ONCE FOR THE WHOLE ROW: "3:2", "60/40", "50/50", "3:2:2". One ' +
          'whole number for each part, in the order the parts are written, separated by ":" or "/" — one of the ' +
          'two, not both in one string. Every term may carry a percent sign instead — "60%/40%" — and then they ' +
          'have to add up to 100. It is never a width: no "px", no "rem", no "fr" and no decimals. ' +
          'THIS IS THE SAME THING AS WRITING "share" ON EVERY PART, said once instead of part by part. Write ' +
          'whichever reads better; writing both is allowed only when they agree, which is what a stored row sent ' +
          'back through this door looks like. ' +
          'WHAT COMES BACK IS BOTH: Mole Office stores the ratio with the common factor taken out as "share" on ' +
          'each part, and keeps your own spelling here — so a row you asked for as "60/40" is stored as 3 and 2 ' +
          'and still answers "you asked for 60/40". A preference, never a command: the layout may draw a part ' +
          'wider than you asked when its neighbour is already as narrow as it can be read at, and it says so.',
        example: '3:2',
        refusal:
          'it is a proportion between the parts and never a size. Write "3:2", "60/40", "50/50" or "60%/40%". ' +
          'To say how wide the writing inside a part reads, which is a different thing, write "measure" on that ' +
          'part',
      },
      {
        key: 'parts',
        type: 'BesidePart[]',
        required: true,
        description:
          'The parts, left to right, in the order they should be read when they are drawn one under another. ' +
          `Between ${String(PARTS_MIN)} and ${String(PARTS_MAX)} of them, each holding at least one block.`,
        example: [
          {
            id: 'p-the-writing',
            share: 3,
            blocks: [{ id: 'bp-1', type: 'text', text: 'The mast moved 4mm under load, every time.' }],
          },
          {
            id: 'p-the-photo',
            share: 2,
            blocks: [
              { id: 'bp-2', type: 'image', path: '/srv/mole-office-fixtures/projects/mast/deflection.png', alt: 'The mast under load' },
            ],
          },
        ],
      },
    ],
  },

  ChartBlock: {
    name: 'ChartBlock',
    description:
      'One plotted line or bar set, drawn from numbers you supply. A chart belongs in a module\'s `summaryBlocks` or ' +
      'in a report\'s `blocks`, and nowhere else: written into any other key it is refused, not stored. ' +
      'THE REPORT HALF OF THAT SENTENCE IS NEW. It used to say a module and nothing else, which was true while a ' +
      'module was the only thing that could hold a block; a review with a chart in it then had to be written outside ' +
      'Mole Office, which is the failure the `report` kind exists to end.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-force' },
      { key: 'type', type: "'chart'", required: true, description: 'Always the string "chart".', example: 'chart' },
      {
        key: 'spec',
        type: 'ChartSpec',
        required: true,
        description: 'What to draw: the kind of chart, both axes, and at least one series of points.',
        example: {
          kind: 'line',
          x: { label: 'setting' },
          y: { label: 'holding force', unit: 'N' },
          series: [{ id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }, { x: 18, y: 19.4 }] }],
        },
      },
      { key: 'caption', type: 'string', required: false, description: 'One line under the chart saying what it shows.', example: 'Measured on the 60 mm pot, three prints.' },
    ],
  },

  MathBlock: {
    name: 'MathBlock',
    description: 'A LaTeX formula. It is rendered if it can be, and shown as source if it cannot — never dropped.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-friction' },
      { key: 'type', type: "'math'", required: true, description: 'Always the string "math".', example: 'math' },
      {
        key: 'tex',
        type: 'string',
        required: true,
        description: 'The LaTeX. Braces and dollars must be closed; which commands render is the renderer\'s business, not this check\'s.',
        example: 'F \\ge \\frac{m g}{2 \\mu}',
      },
      { key: 'caption', type: 'string', required: false, description: 'What the symbols mean, for a reader who did not derive it.', example: 'Minimum holding force for a 0.5 kg pot at mu = 0.6.' },
    ],
  },

  TableBlock: {
    name: 'TableBlock',
    description: 'A small table of measurements. Not a spreadsheet — the raw data stays in the project directory.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-effort-table' },
      { key: 'type', type: "'table'", required: true, description: 'Always the string "table".', example: 'table' },
      {
        key: 'columns',
        type: 'TableColumn[]',
        required: true,
        description: 'The header. Every row must have exactly this many cells, or the table is refused.',
        example: [{ label: 'effort' }, { label: 'force (N)', align: 'right' }],
      },
      {
        key: 'rows',
        type: 'TableRow[]',
        required: true,
        description: 'The rows, in the order they should be read.',
        example: [{ cells: ['12', 11.2] }, { cells: ['15', 15.9], state: 'failed' }],
      },
      { key: 'caption', type: 'string', required: false, description: 'One line under the table.', example: 'Measured on the bench jig, 2026-07.' },
    ],
  },

  TimelineItem: {
    name: 'TimelineItem',
    description: 'One thing that happened, and when.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 't-first-print' },
      {
        key: 'when',
        type: 'string',
        required: true,
        description:
          'When it happened, kept exactly as written and never parsed into a date. "14 August", "2026-07" and ' +
          '"after the driver was rolled back" are all real answers. Nothing sorts or counts by it: the order of ' +
          'the items is the order you write them in.',
        example: '14 August, morning',
      },
      { key: 'text', type: 'string', required: true, description: 'What happened.', example: 'The third print cracked at the shoulder.' },
      { key: 'detail', type: 'string', required: false, description: 'What happened, at length. Markdown, like a text block.', example: 'Setting 15, on the v3 geometry. The crack ran along the layer line.' },
      {
        key: 'state',
        type: unionOf(ITEM_STATES),
        required: false,
        description: 'Optional meaning, drawn the same way a checklist item with that state is drawn.',
        example: 'failed',
      },
    ],
  },

  TimelineBlock: {
    name: 'TimelineBlock',
    description:
      'What happened, in order, with when beside it. Use it where the ORDER is the meaning. A table with a "when" ' +
      'column holds the same words and says nothing about them: a table can be sorted by any column, and a reader ' +
      'who sorts one has destroyed the only thing a timeline was for.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-what-happened' },
      { key: 'type', type: "'timeline'", required: true, description: 'Always the string "timeline".', example: 'timeline' },
      {
        key: 'items',
        type: 'TimelineItem[]',
        required: true,
        description: 'What happened, in the order it should be read. At least one.',
        example: [{ id: 't-first-print', when: '14 August, morning', text: 'The third print cracked at the shoulder.', state: 'failed' }],
      },
    ],
  },

  ImageBlock: {
    name: 'ImageBlock',
    description: 'A picture that lives on disk. Mole Office points at it; it is never copied into the database.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-shot' },
      { key: 'type', type: "'image'", required: true, description: 'Always the string "image".', example: 'image' },
      { key: 'path', type: 'string', required: true, description: 'An absolute path on disk.', example: '/srv/mole-office-fixtures/projects/greenhouse/docs/media/clamp.png' },
      {
        key: 'alt',
        type: 'string',
        required: true,
        description: 'What the picture shows, in words. Required, not optional: a picture with no text alternative is invisible to a reader who cannot see it.',
        example: 'The v3 clamp holding the 60 mm pot at setting 12',
      },
      { key: 'caption', type: 'string', required: false, description: 'One line under the picture.', example: 'Third print, before the crack.' },
      { key: 'machine', type: 'string', required: false, description: 'Which machine the file is on. Leave it out when it is this one.', example: 'lab-pc' },
    ],
  },

  // ------------------------------------------------------------------------ a file, as a file
  //
  // CRITERION R3 of design/flows/ACCEPTANCE.md, on a decision. The prose cap is
  // 4,000 characters and it is right for prose, so a file reaching a report used to be cut into
  // 4,000-character text blocks and stopped being a file. This block is the answer: the bytes live
  // beside the database and are served by the same door a picture is, and the block carries the
  // three facts that make it checkable — the file's own name, its size, and a hash of its bytes.
  //
  // NOTHING HERE IS THE CALLER'S WORD FOR IT. The size is the bytes' own length and the hash is
  // taken over the bytes as they are stored, so a block whose numbers disagree with the file is a
  // block somebody edited by hand rather than a file that changed quietly.

  FileBlock: {
    name: 'FileBlock',
    description:
      'A FILE, KEPT AS A FILE. It lives on disk beside the database and Mole Office points at it, the way a ' +
      'picture is pointed at; it is never cut into prose blocks and never copied into the database. The prose ' +
      'cap does not apply to it, and does still apply to its caption.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: 'b-the-file' },
      { key: 'type', type: "'file'", required: true, description: 'Always the string "file".', example: 'file' },
      {
        key: 'path',
        type: 'string',
        required: true,
        description:
          'An absolute path on disk, the same shape an image block carries and read by the same door, which ' +
          'answers only inside a preview root.',
        example: '/srv/mole-office-fixtures/mole-office/data/report-files/V1StGXR8Z5jd.ts',
      },
      {
        key: 'name',
        type: 'string',
        required: true,
        description: "The file's own name, as a person would say it, never the stored name on disk.",
        example: 'summary.ts',
      },
      {
        key: 'size',
        type: 'number',
        required: true,
        description: 'How many bytes the file is: its own length, never a number the caller supplied.',
        example: 24576,
      },
      {
        key: 'hash',
        type: 'string',
        required: true,
        description:
          'Sixteen hex characters of the sha256 of the bytes, the same token shape a record version has, so two ' +
          'copies of a file can be told apart and a changed one cannot pass as the old one.',
        example: '3f1c9a02b7de4415',
      },
      { key: 'caption', type: 'string', required: false, description: 'One line under the file. Prose, and under the prose cap.', example: 'The file as it was when the run ended.' },
      { key: 'machine', type: 'string', required: false, description: 'Which machine the file is on. Leave it out when it is this one.', example: 'lab-pc' },
    ],
  },

  // ------------------------------------------------------------ a sound or a film, played in the page
  //
  // The owner hears voice samples inside a report, and the studio's sample
  // films follow. Each block names a stored file by the four facts POST /api/report-files hands
  // back, and the page plays it from the file door, which streams it and can save it whole. Which
  // formats each block plays is the one list in src/shared/reportmedia.ts.

  AudioBlock: mediaBlockShape('audio'),
  VideoBlock: mediaBlockShape('video'),

  ChartSpec: {
    name: 'ChartSpec',
    description: 'What a chart draws.',
    fields: [
      { key: 'kind', type: "'line' | 'bar'", required: true, description: 'Lines for something measured across a range, bars for separate cases.', example: 'line' },
      { key: 'x', type: 'ChartAxis', required: true, description: 'The horizontal axis. It must be labelled.', example: { label: 'effort' } },
      { key: 'y', type: 'ChartAxis', required: true, description: 'The vertical axis. It must be labelled, and should carry a unit.', example: { label: 'holding force', unit: 'N' } },
      {
        key: 'series',
        type: 'ChartSeries[]',
        required: true,
        description: 'At least one series. Empty axes read as "we measured this and found nothing", when what happened is that nobody supplied the numbers.',
        example: [{ id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }] }],
      },
      {
        key: 'annotations',
        type: 'ChartAnnotation[]',
        required: false,
        description: 'Reference lines, e.g. the force the clamp has to reach.',
        example: [{ id: 'need', axis: 'y', value: 12, label: '12 N needed' }],
      },
    ],
  },

  ChartAxis: {
    name: 'ChartAxis',
    description: 'One axis of a chart.',
    fields: [
      { key: 'label', type: 'string', required: true, description: 'What is on this axis. An unlabelled axis is a number with no unit, which is how a plot lies.', example: 'holding force' },
      { key: 'unit', type: 'string', required: false, description: 'Kept apart from the label so ticks can carry it without repeating the word.', example: 'N' },
      { key: 'min', type: 'number', required: false, description: 'Force the axis to start here. Must be below max.', example: 0 },
      { key: 'max', type: 'number', required: false, description: 'Force the axis to end here.', example: 25 },
    ],
  },

  ChartPoint: {
    name: 'ChartPoint',
    description: 'One measured point.',
    fields: [
      { key: 'x', type: 'number', required: true, description: 'Position along the x axis.', example: 12 },
      { key: 'y', type: 'number', required: true, description: 'Position along the y axis.', example: 11.2 },
    ],
  },

  ChartSeries: {
    name: 'ChartSeries',
    description: 'One line or one set of bars.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within the chart — the legend addresses lines by it.', example: 's1' },
      { key: 'name', type: 'string', required: true, description: 'What this line is, as the legend will say it.', example: 'v3 shell' },
      { key: 'points', type: 'ChartPoint[]', required: true, description: 'The measurements. A named series with no points puts a legend entry on the chart for a line that is not there.', example: [{ x: 12, y: 11.2 }] },
      {
        key: 'state',
        type: unionOf(ITEM_STATES),
        required: false,
        description: 'Optional meaning: a series marked `failed` is drawn the same colour as a failed checklist item, so the two agree.',
        example: 'failed',
      },
      { key: 'dashed', type: 'boolean', required: false, description: 'Draw it dashed. The non-colour channel: a dashed line still reads as "this one" in a mono theme.', example: true },
    ],
  },

  ChartAnnotation: {
    name: 'ChartAnnotation',
    description: 'A reference line across the chart.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within the chart.', example: 'need' },
      { key: 'axis', type: "'x' | 'y'", required: true, description: 'Which axis the value is on. "y" draws a horizontal line.', example: 'y' },
      { key: 'value', type: 'number', required: true, description: 'Where the line sits.', example: 12 },
      { key: 'label', type: 'string', required: true, description: 'What the line means. A line with no label is a mystery.', example: '12 N needed' },
    ],
  },

  TableColumn: {
    name: 'TableColumn',
    description: 'One column header.',
    fields: [
      { key: 'label', type: 'string', required: true, description: 'The header text.', example: 'force (N)' },
      { key: 'align', type: "'left' | 'right'", required: false, description: 'Numbers right, words left. Left when left out.', example: 'right' },
    ],
  },

  TableRow: {
    name: 'TableRow',
    description: 'One row. It must have exactly as many cells as the table has columns.',
    fields: [
      {
        key: 'cells',
        type: '(string | number)[]',
        required: true,
        description:
          'The cells, left to right. Numbers stay numbers so they can be aligned and formatted; ' +
          '"n/a" and "not measured" stay strings, because forcing them into a number invents a measurement.',
        example: ['12', 11.2],
      },
      { key: 'state', type: unionOf(ITEM_STATES), required: false, description: 'Optional meaning for the whole row, e.g. a print attempt that failed.', example: 'failed' },
    ],
  },
}
