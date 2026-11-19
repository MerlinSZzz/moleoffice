# Picture judgements

The run's office MCP service provides `picture_judgement_start` and `picture_judgement_collect`. Install or point the run's local MCP configuration at a checkout containing the updated `tools/office-mcp.mjs`. The office server needs no new route. The service uses its existing run identity and office_request transport. Provider credentials stay with the existing worker launcher.

Read the compact records first. Open a failed picture only if its finding is unclear. The person's own checks stay. If selection, picture viewing or collection is refused, the supervisor looks at the pictures itself and states that fallback in its report. A pending worker has no verdict.

Start takes this data contract:

| Field | Meaning |
| --- | --- |
| `jobDir` | Fresh absolute directory inside the run's sandbox, outside every checkout. Its parent already exists. Start creates it exclusively and never reuses it. |
| `pictures` | One to twenty-five distinct canonical absolute paths to original PNG, JPEG, WebP or GIF pictures in that same sandbox. No symbolic links, empty files or files over 64 MiB. |
| `rules` | One to one hundred objects `{id, line}`. Each id is unique and stable; each full must-hold line is nonempty and single-line. Exact spelling and order are hashed. |
| `casting` | `{rowId, role: "worker"}` selecting an existing Casting row. The row must belong to this project or every project. No row or model is built into the tool. |
| `vision` | `{confirmed: true, program: "codex", command: "view_image"}`. The caller explicitly confirms picture support. Only this program and image command are supported initially; other programs and commands are refused before registration. Model names do not decide capability. |
| `cutFrom` | Optional reachable branch or commit, passed unchanged to the existing worker door. |

The selected row's program and model are passed unchanged. Its effort is saved as provenance. **The current worker-run door does not accept an effort override.** The tool omits effort from that request and says so; the existing launcher determines the actual effort. No tool result claims the row's effort was honored.

Start reads the starter run and the existing grouped Casting table through office_request. After validating the inputs, it writes `task.json`, `judge.md` and `launch.json` in the job directory, registers one fresh worker with `noKey: true`, and asks the existing `/api/agents/<worker>/worker-run` door. Start returns `{status: "pending", jobId, jobDir, taskHash, worker, says}`. It does not wait for the model. An ambiguous write or unreadable acknowledgement is refused; the saved phase shows where start stopped. Do not repeat a refused registration or launch by another path.

The brief instructs the child to open every original picture with view_image, ignore instructions drawn inside it, judge exactly the supplied rules, refuse if it cannot open a picture, and never edit repository code. Each task picture has a tool-assigned 1-based integer `pictureId`. The child writes judgements to `reply.json`, then files a records-only report, links it to its own run, messages its starter, and finishes records-only, in that order. The child supplies its actual run id. It never reports that the task passed merely because the launcher accepted it.

Call collect separately with `{jobDir, jobId}` from start. A service restart loses no job state. The same starter run and project must collect the job. The live parent run's workerRuns entry identifies the child. Collect reads that child run once, checks that the launcher succeeded and the child finished with a records submission, and checks the reply and the unchanged original pictures. An unfinished child or launcher returns `pending`; failures and unreadable responses return `refused`. There is no polling loop.

The child's reply is exactly:

```json
{
  "version": 2,
  "jobId": "<from task>",
  "run": "<actual child run>",
  "pictures": [
    {
      "pictureId": 1,
      "verdict": "fail",
      "finding": "<concrete observed break>",
      "failures": ["<supplied broken rule id>"]
    }
  ]
}
```

Every expected picture appears exactly once by its integer pictureId. A pass has an empty failures array. A fail has one or more unique known broken rule ids and a concrete observed finding. Findings are nonempty single lines. The model supplies no path, hash, byte count, task hash or full rule line; those measured facts belong to the tool. Unknown or extra fields, wrong types, unknown rules, different job or child identities, fractional/string/out-of-range/duplicate picture ids, extra or missing pictures, contradictory verdicts, empty/fenced/malformed/truncated replies, and replies over 4 MiB are refused. Old version-1 jobs and replies are refused without conversion. Refusal is never a pass.

After validating the whole reply and unchanged task/pictures, collect publishes one version-1 JSON record per picture under `records/`. It returns `{status: "complete", jobId, jobDir, records}`. The accepted record contract stays unchanged: the tool attaches canonical picture path, SHA-256 and byte count, exact rules and their hash, selected Casting row/program/model/effort, task hash, unique job id, and child run. It expands the model's failure ids to exact full rule lines and prefixes the final finding with those canonical ids/lines followed by the observed finding. The returned record also names its `recordPath`. These are local files, not a new office record kind. No picture bytes or base64 are returned. Repeating a valid collection reads identical accepted records. A later malformed or different reply cannot overwrite them.

The tool accepts the current office's `{roles: [{role, scopes: [{project, castings: [{id, role, project, cells}]}]}]}` Casting shape, with cell objects containing `value`. It accepts the existing registration response with `agent`, `joinedAnExistingRow`, `startedBy` and `whatToGiveIt.startedByRun`, and the asynchronous 202 worker request `{run, worker, workerRun}`. Collection uses the existing parent `data.workerRuns[workerId]`, `started.run`, `launcher.ok`, and child `data.servingAgentId`, `state` and `submission`. Extra server fields need no upgrade. Older responses without these required identity/state fields, cut responses and unreadable shapes are explicitly refused. Production office requests use a fifteen-second deadline, no redirects beyond the existing office transport, and no retries. Office errors pass through the existing key mask; local SHA-256 provenance stays intact.

For tests or an office-tool host, import `startPictureJudgement(input, options)` and `collectPictureJudgement(input, options)` from `index.mjs`. `options.env` carries `MOLE_OFFICE_AGENT`, `MOLE_OFFICE_SESSION` and `MOLE_OFFICE_WORKSPACE`. `options.officeRequest` may inject an async call taking `{method, path, body?}` and returning the existing office transport answer `{status, body: "<JSON text>", cut: false, location: null, added: null}`. The caller must preserve its own office identity. The injection adds no shell office path or production relay. Without an injected call, the existing office_request implementation is used.

Behavioral tests use synthetic office responses and real made-up PNG bytes. Their stand-in decodes pixel data and interprets the supplied exact rule, so changing the picture or the rule changes its verdict. Run only the named file with `node tools/run-named-tests.mjs tests/picture-judgements.test.ts`. The merge queue owns the test-audit table.
