// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Reading the reminder's facts costs the same number of statements for one or six items. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { recordIncompleteness } from '../src/shared/kinds/incompleteness.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let facts: typeof import('../src/server/lib/before-the-seal.ts')
let slow: typeof import('../src/server/lib/slow-requests.ts')
let zoom: typeof import('../src/server/lib/zoom.ts')
let inspection: typeof import('../src/server/lib/inspection.ts')
let run = ''
let oneRead: ReturnType<typeof read>
let sixRead: ReturnType<typeof read>
const reports: string[] = []
const decisions: string[] = []

beforeAll(async () => {
  t = await freshDb()
  ;(await import('../src/server/lib/roles.ts')).readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  facts = await import('../src/server/lib/before-the-seal.ts')
  inspection = await import('../src/server/lib/inspection.ts')
  slow = await import('../src/server/lib/slow-requests.ts')
  zoom = await import('../src/server/lib/zoom.ts')
  slow.measureTheStatementsOf(t.client.sqlite)
  run = t.api.createRecord({ kind: 'session', title: 'A run with many facts', workspaceId: 'default', data: { state: 'running', doing: 'made-up work' }, actor: t.api.HUMAN }).id
  addOne(1)
  oneRead = read()
  for (let n = 2; n <= 6; n++) addOne(n)
  sixRead = read()
}, 60_000)
afterAll(() => t?.close())

function addOne(n: number): void {
  const report = t.api.createRecord({ kind: 'report', title: n < 3 ? 'A shared report title' : `Report ${n}`, workspaceId: 'default', data: { blocks: [{ id: `b-${n}`, type: 'text', text: `Report number ${n}` }] }, actor: t.api.HUMAN })
  const decision = t.api.createRecord({ kind: 'decision', title: `Decision ${n}`, workspaceId: 'default', data: { because: `Reason ${n}` }, actor: t.api.HUMAN })
  t.api.createLink({ fromId: report.id, toId: run, type: 'about', actor: t.api.HUMAN })
  t.client.sqlite.prepare("UPDATE changes SET session_id = ? WHERE record_id IN (?, ?) AND op = 'create'").run(run, report.id, decision.id)
  t.client.sqlite.prepare("INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said, proof) VALUES (?, 'default', ?, ?, '2026-01-01 00:00:00', 'named-tests', ?, NULL)").run(randomUUID(), run, n, `test use ${n}`)
  reports.push(report.id); decisions.push(decision.id)
}
function read() {
  const record = t.api.getRecord(run)!
  const count = slow.aFreshCount()
  const answer = slow.countedTo(count, () => facts.theFactsBeforeTheSealOf(record, { couldNotRead: 'Git is not part of this test' }))
  return { answer, count: count.statements }
}

it('keeps the facts and uses the same number of statements for one and six of each item', () => {
  const one = oneRead
  const six = sixRead
  expect(one.answer.reports).toHaveLength(1)
  expect(one.answer.decisionAuthorities).toHaveLength(1)
  expect(one.answer.testRuns).toHaveLength(1)
  expect(six.answer.reports).toHaveLength(6)
  expect(six.answer.decisionAuthorities).toHaveLength(6)
  expect(six.answer.testRuns).toHaveLength(6)
  const answer = six.answer
  const held = reports.map((id) => t.api.getRecord(id)!)
  expect(answer.reports).toEqual(held.map(({ id, title, data }) => ({ id, title, data })))
  for (const report of held) {
    expect(answer.sameTitleElsewhere[report.id]).toEqual(held.filter((other) => other.title === report.title && other.id !== report.id).map((other) => other.id))
  }
  expect(answer.testRuns).toEqual(reports.map((_, i) => `test use ${i + 1}`))
  expect(answer.testRunsNotFromTheTool).toEqual([])
  expect(answer.decisionAuthorities).toEqual([...decisions].sort().map((id) => ({ id, authority: null, revisitWhen: false, reference: null })))
  expect(answer.decisionsWithoutShortForms?.ids).toEqual([...decisions].sort())
  for (const id of [...reports, ...decisions]) {
    const record = t.api.getRecord(id)!
    const levels = zoom.readShortForms(id, record.workspaceId).levels
    const written = levels.filter((one) => one.rung === 'label' || ['outline', 'sketch', 'digest'].includes(one.rung))
    const label = levels.find((one) => one.rung === 'label')
    const parts = levels.filter((one) => ['outline', 'sketch', 'digest'].includes(one.rung))
    expect(answer.forms?.find((one) => one.id === id)).toEqual({
      id, about: record.kind, why: [record.kind === 'report' ? 'linked report' : 'decision of the run'],
      missing: [...(label?.state === 'none' ? ['label'] : []), ...(parts.some((one) => one.state === 'none') ? ['parts'] : [])],
      outOfDate: written.some((one) => one.state === 'out_of_date'), cannotCheck: written.some((one) => one.state === 'cannot_check'),
      incomplete: recordIncompleteness(record.kind, record.data, record.summary).map((one) => ({ path: one.path, message: one.message })),
    })
  }
  expect(answer.reportsFiled).toEqual(reports.map((id) => ({ id, aboutARun: true, aboutAPage: false, namesNothingFits: false })))
  expect(six.count).toBe(one.count)
})

/** The original complete reading, with generated record ids given stable names. */
it('keeps every finish fact as it was before the batch reads', () => {
  const aliases: [string, string][] = [
    [run, 'RUN'],
    ...reports.map((id, i): [string, string] => [id, `REPORT_${i + 1}`]),
    ...[...decisions].sort().map((id, i): [string, string] => [id, `DECISION_${i + 1}`]),
  ]
  let reading = JSON.stringify(sixRead.answer)
  for (const [id, alias] of aliases) reading = reading.replaceAll(id, alias)
  expect(JSON.parse(reading)).toEqual({
  "runId": "RUN",
  "runTitle": "A run with many facts",
  "testRuns": [
    "test use 1",
    "test use 2",
    "test use 3",
    "test use 4",
    "test use 5",
    "test use 6"
  ],
  "testRunsNotFromTheTool": [],
  "git": {
    "couldNotRead": "Git is not part of this test"
  },
  "reports": [
    {
      "id": "REPORT_1",
      "title": "A shared report title",
      "data": {
        "blocks": [
          {
            "id": "b-1",
            "type": "text",
            "text": "Report number 1"
          }
        ]
      }
    },
    {
      "id": "REPORT_2",
      "title": "A shared report title",
      "data": {
        "blocks": [
          {
            "id": "b-2",
            "type": "text",
            "text": "Report number 2"
          }
        ]
      }
    },
    {
      "id": "REPORT_3",
      "title": "Report 3",
      "data": {
        "blocks": [
          {
            "id": "b-3",
            "type": "text",
            "text": "Report number 3"
          }
        ]
      }
    },
    {
      "id": "REPORT_4",
      "title": "Report 4",
      "data": {
        "blocks": [
          {
            "id": "b-4",
            "type": "text",
            "text": "Report number 4"
          }
        ]
      }
    },
    {
      "id": "REPORT_5",
      "title": "Report 5",
      "data": {
        "blocks": [
          {
            "id": "b-5",
            "type": "text",
            "text": "Report number 5"
          }
        ]
      }
    },
    {
      "id": "REPORT_6",
      "title": "Report 6",
      "data": {
        "blocks": [
          {
            "id": "b-6",
            "type": "text",
            "text": "Report number 6"
          }
        ]
      }
    }
  ],
  "sameTitleElsewhere": {
    "REPORT_1": [
      "REPORT_2"
    ],
    "REPORT_2": [
      "REPORT_1"
    ],
    "REPORT_3": [],
    "REPORT_4": [],
    "REPORT_5": [],
    "REPORT_6": []
  },
  "mustRead": facts.theChaptersTheReminderWants(inspection.theChaptersARunsAgentMustRead(t.api.getRecord(run)!)),
  "checkAlso": [],
  "decisionsWithoutShortForms": {
    "ids": [
      "DECISION_1",
      "DECISION_2",
      "DECISION_3",
      "DECISION_4",
      "DECISION_5",
      "DECISION_6"
    ],
    "complete": false
  },
  "forms": [
    {
      "id": "REPORT_1",
      "about": "report",
      "why": [
        "linked report"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "data.for",
          "message": "data.for is not filled in, so this report is incomplete. Who this is written for, in plain words: a person, a group, whoever asked for it. Needed before the report is complete, and it is what makes this kind different from a note — a report addressed to nobody is a note. Write who reads it, not what you want them to do about it. The record is kept either way — fill it in when you know it. Example: \"The person who asked for the review\""
        },
        {
          "path": "data.date",
          "message": "data.date is not filled in, so this report is incomplete. The day the report is ABOUT, which is not always the day it was written: a review written on Friday about Wednesday's run carries Wednesday. Needed before the report is complete, because a report is a statement about a day — one with no day reads as a statement about now, and stops being true the moment the work moves on. Nothing infers it from the record's own stamps: those say when it was filed and last edited. The record is kept either way — fill it in when you know it. Example: \"2026-08-14\""
        }
      ]
    },
    {
      "id": "REPORT_2",
      "about": "report",
      "why": [
        "linked report"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "data.for",
          "message": "data.for is not filled in, so this report is incomplete. Who this is written for, in plain words: a person, a group, whoever asked for it. Needed before the report is complete, and it is what makes this kind different from a note — a report addressed to nobody is a note. Write who reads it, not what you want them to do about it. The record is kept either way — fill it in when you know it. Example: \"The person who asked for the review\""
        },
        {
          "path": "data.date",
          "message": "data.date is not filled in, so this report is incomplete. The day the report is ABOUT, which is not always the day it was written: a review written on Friday about Wednesday's run carries Wednesday. Needed before the report is complete, because a report is a statement about a day — one with no day reads as a statement about now, and stops being true the moment the work moves on. Nothing infers it from the record's own stamps: those say when it was filed and last edited. The record is kept either way — fill it in when you know it. Example: \"2026-08-14\""
        }
      ]
    },
    {
      "id": "REPORT_3",
      "about": "report",
      "why": [
        "linked report"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "data.for",
          "message": "data.for is not filled in, so this report is incomplete. Who this is written for, in plain words: a person, a group, whoever asked for it. Needed before the report is complete, and it is what makes this kind different from a note — a report addressed to nobody is a note. Write who reads it, not what you want them to do about it. The record is kept either way — fill it in when you know it. Example: \"The person who asked for the review\""
        },
        {
          "path": "data.date",
          "message": "data.date is not filled in, so this report is incomplete. The day the report is ABOUT, which is not always the day it was written: a review written on Friday about Wednesday's run carries Wednesday. Needed before the report is complete, because a report is a statement about a day — one with no day reads as a statement about now, and stops being true the moment the work moves on. Nothing infers it from the record's own stamps: those say when it was filed and last edited. The record is kept either way — fill it in when you know it. Example: \"2026-08-14\""
        }
      ]
    },
    {
      "id": "REPORT_4",
      "about": "report",
      "why": [
        "linked report"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "data.for",
          "message": "data.for is not filled in, so this report is incomplete. Who this is written for, in plain words: a person, a group, whoever asked for it. Needed before the report is complete, and it is what makes this kind different from a note — a report addressed to nobody is a note. Write who reads it, not what you want them to do about it. The record is kept either way — fill it in when you know it. Example: \"The person who asked for the review\""
        },
        {
          "path": "data.date",
          "message": "data.date is not filled in, so this report is incomplete. The day the report is ABOUT, which is not always the day it was written: a review written on Friday about Wednesday's run carries Wednesday. Needed before the report is complete, because a report is a statement about a day — one with no day reads as a statement about now, and stops being true the moment the work moves on. Nothing infers it from the record's own stamps: those say when it was filed and last edited. The record is kept either way — fill it in when you know it. Example: \"2026-08-14\""
        }
      ]
    },
    {
      "id": "REPORT_5",
      "about": "report",
      "why": [
        "linked report"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "data.for",
          "message": "data.for is not filled in, so this report is incomplete. Who this is written for, in plain words: a person, a group, whoever asked for it. Needed before the report is complete, and it is what makes this kind different from a note — a report addressed to nobody is a note. Write who reads it, not what you want them to do about it. The record is kept either way — fill it in when you know it. Example: \"The person who asked for the review\""
        },
        {
          "path": "data.date",
          "message": "data.date is not filled in, so this report is incomplete. The day the report is ABOUT, which is not always the day it was written: a review written on Friday about Wednesday's run carries Wednesday. Needed before the report is complete, because a report is a statement about a day — one with no day reads as a statement about now, and stops being true the moment the work moves on. Nothing infers it from the record's own stamps: those say when it was filed and last edited. The record is kept either way — fill it in when you know it. Example: \"2026-08-14\""
        }
      ]
    },
    {
      "id": "REPORT_6",
      "about": "report",
      "why": [
        "linked report"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "data.for",
          "message": "data.for is not filled in, so this report is incomplete. Who this is written for, in plain words: a person, a group, whoever asked for it. Needed before the report is complete, and it is what makes this kind different from a note — a report addressed to nobody is a note. Write who reads it, not what you want them to do about it. The record is kept either way — fill it in when you know it. Example: \"The person who asked for the review\""
        },
        {
          "path": "data.date",
          "message": "data.date is not filled in, so this report is incomplete. The day the report is ABOUT, which is not always the day it was written: a review written on Friday about Wednesday's run carries Wednesday. Needed before the report is complete, because a report is a statement about a day — one with no day reads as a statement about now, and stops being true the moment the work moves on. Nothing infers it from the record's own stamps: those say when it was filed and last edited. The record is kept either way — fill it in when you know it. Example: \"2026-08-14\""
        }
      ]
    },
    {
      "id": "DECISION_1",
      "about": "decision",
      "why": [
        "decision of the run"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "summary",
          "message": "summary is not filled in, so this decision is incomplete. A decision's level-3 context is what happened — the situation, the measurement or the words that raised the question — and why this was decided, written for an agent that meets the decision months later with nothing else in hand. The record is kept either way — write it when you know it."
        }
      ]
    },
    {
      "id": "DECISION_2",
      "about": "decision",
      "why": [
        "decision of the run"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "summary",
          "message": "summary is not filled in, so this decision is incomplete. A decision's level-3 context is what happened — the situation, the measurement or the words that raised the question — and why this was decided, written for an agent that meets the decision months later with nothing else in hand. The record is kept either way — write it when you know it."
        }
      ]
    },
    {
      "id": "DECISION_3",
      "about": "decision",
      "why": [
        "decision of the run"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "summary",
          "message": "summary is not filled in, so this decision is incomplete. A decision's level-3 context is what happened — the situation, the measurement or the words that raised the question — and why this was decided, written for an agent that meets the decision months later with nothing else in hand. The record is kept either way — write it when you know it."
        }
      ]
    },
    {
      "id": "DECISION_4",
      "about": "decision",
      "why": [
        "decision of the run"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "summary",
          "message": "summary is not filled in, so this decision is incomplete. A decision's level-3 context is what happened — the situation, the measurement or the words that raised the question — and why this was decided, written for an agent that meets the decision months later with nothing else in hand. The record is kept either way — write it when you know it."
        }
      ]
    },
    {
      "id": "DECISION_5",
      "about": "decision",
      "why": [
        "decision of the run"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "summary",
          "message": "summary is not filled in, so this decision is incomplete. A decision's level-3 context is what happened — the situation, the measurement or the words that raised the question — and why this was decided, written for an agent that meets the decision months later with nothing else in hand. The record is kept either way — write it when you know it."
        }
      ]
    },
    {
      "id": "DECISION_6",
      "about": "decision",
      "why": [
        "decision of the run"
      ],
      "missing": [
        "label"
      ],
      "outOfDate": false,
      "cannotCheck": false,
      "incomplete": [
        {
          "path": "summary",
          "message": "summary is not filled in, so this decision is incomplete. A decision's level-3 context is what happened — the situation, the measurement or the words that raised the question — and why this was decided, written for an agent that meets the decision months later with nothing else in hand. The record is kept either way — write it when you know it."
        }
      ]
    }
  ],
  "decisionAuthorities": [
    {
      "id": "DECISION_1",
      "authority": null,
      "revisitWhen": false,
      "reference": null
    },
    {
      "id": "DECISION_2",
      "authority": null,
      "revisitWhen": false,
      "reference": null
    },
    {
      "id": "DECISION_3",
      "authority": null,
      "revisitWhen": false,
      "reference": null
    },
    {
      "id": "DECISION_4",
      "authority": null,
      "revisitWhen": false,
      "reference": null
    },
    {
      "id": "DECISION_5",
      "authority": null,
      "revisitWhen": false,
      "reference": null
    },
    {
      "id": "DECISION_6",
      "authority": null,
      "revisitWhen": false,
      "reference": null
    }
  ],
  "doing": "made-up work",
  "earlierRefusal": {
    "couldNotRead": "the office could not tell which agent this run serves, so it could not find the agent's earlier runs."
  },
  "reportsFiled": [
    {
      "id": "REPORT_1",
      "aboutARun": true,
      "aboutAPage": false,
      "namesNothingFits": false
    },
    {
      "id": "REPORT_2",
      "aboutARun": true,
      "aboutAPage": false,
      "namesNothingFits": false
    },
    {
      "id": "REPORT_3",
      "aboutARun": true,
      "aboutAPage": false,
      "namesNothingFits": false
    },
    {
      "id": "REPORT_4",
      "aboutARun": true,
      "aboutAPage": false,
      "namesNothingFits": false
    },
    {
      "id": "REPORT_5",
      "aboutARun": true,
      "aboutAPage": false,
      "namesNothingFits": false
    },
    {
      "id": "REPORT_6",
      "aboutARun": true,
      "aboutAPage": false,
      "namesNothingFits": false
    }
  ],
  "packagesHeld": {
    "couldNotRead": "the office could not tell which agent this run serves, so it could not find the inside packages the run has taken."
  }
})
  expect(sixRead.count).toBe(oneRead.count)
})
