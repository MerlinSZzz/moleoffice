// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s, the person's authority. The browser's doors to the person's authority: grants, keys, visitors,
// one press, signing packages, delegation, roles, regulations and chapters, casting, and the person's own words.
// Wave 13y's round 68 moved them here out of the one `api` object in src/web/api.ts; a line adds its new doors to
// its own part, and src/web/api-parts/join.ts joins every part into `api`.
import { type ConfirmPackageReply, type DelegationReply, type OutsideExportReply, type RecordDetail, type ReturnFromOutsideReply, type ScreeningOnTheWire, type TheBytesThatAnswered, type UnmetItem, json, request } from '../api.ts'
import type { TheWorkersOfAPackage, TheWorkersOfADay } from '@shared/package-workers.ts'
import type { ZipExportAnswer } from '@shared/zip-export/manifest.ts'
import { t } from '@shared/i18n.ts'
import { theExportEntryJustWritten } from './records.ts'
import type { AChapterPreview, AChapterWritten, AChaptersHistory, ChapterContent, TheSelectedChapters } from '@shared/chapter-edit.ts'
import type { AChoiceForADoor, WhatTheGrantCarriesAfterAChange, WhatTheGrantCarriesReading } from '@shared/what-the-grant-carries.ts'
import type { AWaitingNote } from '@shared/the-persons-own-words.ts'
import type { EmbassyKey, EmbassyRow } from '@shared/worlds.ts'
import type { VisitorCredential, VisitorRequestRow } from '@shared/visitors.ts'
import type { Elevation, WhatTheRolesSay, WhoHoldsTheCards } from '@shared/roles.ts'
import type { WhatTheOfficeRegulationsSay } from '@shared/office-rules.ts'
import type { TheProjectChapter } from '@shared/project-rules.ts'
import type { ADesignReminderJudgement, DesignReminderVerdict, TheDesignReminderCount } from '@shared/design-reminders.ts'
import type { TrustedMachine, WhatTheOfficeTrusts } from '@shared/trustedmachines.ts'
import type { WhatTheKeyWindowSays, WhatTheKeyWindowSaysToThisCaller } from '@shared/keywindow.ts'
import { theApiUrlFor } from '../lib/api-address.ts'
import type { AccessReply } from '../../server/lib/access.ts'
import type { AOnePressRequest } from '../../server/lib/one-press.ts'
import type { ASigningPackage, SigningPackageState } from '../../server/lib/signing-packages.ts'
import type { NeedsYouReply } from '../../server/api/needs-you.ts'
import { WORKSPACE_HEADER } from '../lib/workspace.ts'
import type { PanelRecord } from '@shared/types.ts'

/**
 * WHAT THE OUTSIDE EXPORT ANSWERS: the text reply the press has always given, or one zip.
 *
 * THE TEXT ANSWER IS THE SERVER'S WHOLE REPLY with `kind` added, so nothing a page read before
 * changes shape. The zip's counts and the screen's answer come from the export entry the press
 * wrote, which is where the server records both.
 */
export type OutsideExportAnswer =
  | ({ kind: 'text' } & OutsideExportReply)
  | ({ kind: 'zip'; screening: ScreeningOnTheWire } & ZipExportAnswer)

export const authorityDoors = {

  /**
   * WHO MAY REACH MOLE OFFICE AND FROM WHERE. Read once, by the Remote Access panel in Settings. It
   * writes nothing and it takes nothing: there is no project header, because whether another
   * computer can open Mole Office is a fact about this machine and not about a project.
   */
  access: () => request<AccessReply>('/api/access'),

  /**
   * WHAT ONLY THE HUMAN CAN DO. No workspace header, like planning and for the same reason: what is
   * waiting on a person is a fact about the person. See the route's own header.
   */
  needsYou: () => request<NeedsYouReply>('/api/needs-you'),

  /**
   * Link by title or by id. The server refuses an unknown title rather than inventing the record.
   *
   * A `blocks` link may also carry a GATE saying HOW MUCH it blocks: `{kind:'hard'}` means the
   * blocked record cannot proceed at all, `{kind:'partial', upTo:'…'}` means it may proceed that
   * far and no further. Leaving `gate` out is not the same as sending `hard` — it means nobody has
   * said how much, which is what every link written before gates existed holds.
   *
   * The server refuses a partial gate with no `upTo`, a hard gate that says how far, and a gate on
   * any type other than `blocks`. Those refusals arrive here as an ApiError carrying the server's
   * own sentence, which says what to send instead; nothing is corrected on the way past.
   */
  /**
   * The person files a prepared note's words as a note of their own. POST /api/records/:id/file-as-my-words. The page
   * of waiting words names the note's project, because the note may be in a project other than the one in the switcher.
   */
  fileAsMyWords: (id: string, workspaceId?: string) =>
    request<{ note: PanelRecord; filedFrom: string }>(`/api/records/${encodeURIComponent(id)}/file-as-my-words`, {
      method: 'POST',
      ...(workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
    }),

  /** The person says a prepared note is not what they said. The note is kept and marked. POST /api/records/:id/not-what-i-said. */
  notWhatISaid: (id: string, workspaceId: string) =>
    request<{ note: PanelRecord }>(`/api/records/${encodeURIComponent(id)}/not-what-i-said`, {
      method: 'POST',
      headers: { [WORKSPACE_HEADER]: workspaceId },
    }),

  /** The notes still waiting for the person, in every project, one page at a time. GET /api/the-persons-words. */
  thePersonsWords: (page: { limit: number; offset: number }) =>
    request<{ notes: AWaitingNote[]; total: number; limit: number; offset: number }>(
      `/api/the-persons-words?limit=${page.limit}&offset=${page.offset}`,
    ),

  /** The person files every named waiting note at once, or none of them. POST /api/the-persons-words/confirm-all. */
  confirmAllMyWords: (ids: readonly string[]) =>
    request<{ filed: { note: PanelRecord; filedFrom: string }[] }>('/api/the-persons-words/confirm-all', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),

  /** Results nothing is using. */
  /** The records, and how many the check was taken over — see `unconsumedOver` on the server. */
  unconsumed: () => request<{ records: PanelRecord[]; counted: number }>('/api/queries/unconsumed'),

  /** Work waiting on something that does not exist, or that has been deleted. */
  unmet: () => request<{ items: UnmetItem[] }>('/api/queries/unmet').then((r) => r.items),

  /**
   * THE PERSON'S PRESS ON A REQUEST FOR ONE PRESS. Agree runs the act once; Refuse runs
   * nothing. The reply is the request as it now stands, with what the act did or why it could not.
   */
  agreeToARequest: (id: string) =>
    request<{ request: AOnePressRequest }>(`/api/one-press/${encodeURIComponent(id)}/agree`, { method: 'POST' }),
  refuseARequest: (id: string) =>
    request<{ request: AOnePressRequest }>(`/api/one-press/${encodeURIComponent(id)}/refuse`, { method: 'POST' }),

  /** Signing packages, from two decisions: one signature and the receipt. */
  signingPackages: (state: SigningPackageState) => request<{ packages: ASigningPackage[] }>(`/api/signing-packages?state=${encodeURIComponent(state)}&limit=25`),
  signingPackage: (id: string) => request<{ package: ASigningPackage }>(`/api/signing-packages/${encodeURIComponent(id)}`),
  signAPackage: (id: string, struck: string[]) => request<{ package: ASigningPackage }>(`/api/signing-packages/${encodeURIComponent(id)}/sign`, { method: 'POST', body: JSON.stringify({ struck }) }),
  refuseAPackage: (id: string) => request<{ package: ASigningPackage }>(`/api/signing-packages/${encodeURIComponent(id)}/refuse`, { method: 'POST' }),

  /**
   * EVERY CREDENTIAL THIS OFFICE ISSUED, as GET /api/office/visitors answers. The person's card reads their
   * browsers from it and splits them by the one function the Embassy door counts them with.
   */
  visitors: () =>
    request<{ credentials: VisitorCredential[]; lasts: number }>('/api/office/visitors'),

  /**
   * ONE VISITING AGENT'S CREDENTIAL, ITS FACTS AND EVERY REQUEST MADE UNDER IT. Criteria P24, P27.
   *
   * NO TOKEN COMES BACK. It was shown once, when the credential was issued, and this office stores
   * only a hash — so there is nothing here for a page to leak.
   */
  visitor: (id: string) =>
    request<{ credential: VisitorCredential; requests: VisitorRequestRow[] }>(
      `/api/office/visitors/${encodeURIComponent(id)}`,
    ),

  /** THEY CONFIRM A VISITING AGENT, in one press. Criterion P25. */
  confirmVisitor: (id: string) =>
    /**
     * AND THE REPLY CARRIES THE ONE ROW THE CONFIRMED VISITOR MADE. Criterion P77: pressing agree
     * used to reload the whole page.
     *
     * The Embassy swaps that row into its list and takes the card out of the asking block, in place.
     * It does NOT read the page again: `useAsync` puts itself back to loading on every re-read, so
     * the list unmounts and the page is blank for the length of the read, which is what they saw.
     * The reply carried the whole reading once, which on the owner's office of 13 November was
     * megabytes and seconds for one visitor.
     */
    request<{
      credential: VisitorCredential
      row: EmbassyRow | null
      /**
       * WHICH KEY A CONFIRMED PERSON'S DEVICE NOW HOLDS, or null. Criterion D2.
       *
       * The value never travels: `id` names the `held_keys` row and `says` is the sentence. It is
       * answered exactly once, by the press that newly confirmed the credential.
       */
      deviceKey?: { id: string; says: string } | null
    }>(`/api/office/visitors/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),

  /** THEY END A VISITING AGENT'S CREDENTIAL, in one press. Criterion P29. */
  endVisitor: (id: string) =>
    /** The ended credential alone: the page removes its card where it stands. P77. */
    request<{ credential: VisitorCredential }>(
      `/api/office/visitors/${encodeURIComponent(id)}/end`,
      { method: 'POST' },
    ),

  /**
   * THEY REVOKE ONE KEY, NAMED BY ITS ID, in one press. Criterion D3; problem yZ71bheXm-Ji.
   *
   * An agent can hold several keys, so the press names the one `held_keys` row it revokes, and the
   * reply names it back (`key`: what it is and whose run). The row itself is not in the reply: the
   * panel reads that one row again after the press, so the list does not blank while a whole
   * reading is built (criterion P77). The key's value never travels.
   */
  revokeKey: (id: string) =>
    request<{ revoked: boolean; key: EmbassyKey; revokedAt: string; undoRemainingMs: number }>(
      `/api/office/held-keys/${encodeURIComponent(id)}/revoke`,
      { method: 'POST' },
    ),

  undoKeyRevocation: (id: string, revokedAt: string) =>
    request<{ restored: boolean }>(
      `/api/office/held-keys/${encodeURIComponent(id)}/revoke/undo`,
      { method: 'POST', body: json({ revokedAt }) },
    ),

  /**
   * THE ROLE CARDS, AND WHERE EACH ONE IS COPIED IN THIS PROJECT. Criteria P12 and P44.
   *
   * `cards` is the declaration, which is the only thing that decides what a role may do. `mirror`
   * says, per card, which record copies it here and whether that copy still matches. The copy grants
   * nothing: nothing reads one of those records to decide a refusal.
   */
  roles: () => request<WhatTheRolesSay>('/api/roles'),

  /** How many citizens hold each card, and who they are. Criterion P72. */
  whoHoldsTheCards: () => request<WhoHoldsTheCards>('/api/roles/who-holds-them'),

  /** The person's regulations and the chapters, read from the records. Criterion G5. */
  officeRegulations: () => request<WhatTheOfficeRegulationsSay>('/api/office-regulations'),
  /** Chapter edits keep the version read, a reason and the office's checked preview. */
  officeChapters: () => request<TheSelectedChapters>('/api/office-regulations/chapters'),
  /** The current project's own chapter, which the regulations page draws as its This project part. */
  projectChapter: () => request<TheProjectChapter>('/api/office-regulations/projects/current/chapters'),
  /** The current project's design reminders and misses of the days counted, the last seven when none are named. */
  designReminders: () => request<TheDesignReminderCount>('/api/office-regulations/projects/current/design-reminders'),
  /** Judge one design reminder, once. Only the person, or the secretary its marker answers to, may. */
  judgeADesignReminder: (id: string, verdict: DesignReminderVerdict) =>
    request<{ judgement: ADesignReminderJudgement }>(`/api/design-reminders/${encodeURIComponent(id)}/judgement`, {
      method: 'POST', body: JSON.stringify({ verdict }),
    }),
  previewChapter: (n: number, chapter: ChapterContent, keep?: string) => request<AChapterPreview>('/api/office-regulations/chapters/preview', {
    method: 'POST', body: JSON.stringify({ n, chapter, keep }),
  }),
  previewRestoreChapter: (n: number, from: 'shipped' | number, keep?: string) => request<AChapterPreview>('/api/office-regulations/chapters/preview', {
    method: 'POST', body: JSON.stringify({ n, from, ...(keep === undefined ? {} : { keep }) }),
  }),
  applyChapter: (edit: { n: number; version: string | null; because: string; chapter: ChapterContent; keep?: string }) =>
    request<AChapterWritten>('/api/office-regulations/chapters', { method: 'POST', body: JSON.stringify(edit) }),
  chapterHistory: (n: number, offset = 0) => request<AChaptersHistory>(`/api/office-regulations/chapters/${n}/history?offset=${offset}`),
  restoreChapter: (edit: { n: number; version: string | null; because: string; from: 'shipped' | number; keep?: string }) =>
    request<AChapterWritten>('/api/office-regulations/chapters/restore', { method: 'POST', body: JSON.stringify(edit) }),
  /** The person marks a rule as only for this office, or takes the mark off. */
  markARuleOnlyForThisOffice: (chapter: string, rule: string, only: boolean) =>
    request<{ chapter: string; rule: string; onlyThisOffice: boolean; changed: boolean }>('/api/office-regulations/only-this-office', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chapter, rule, only }),
    }),

  /** The machines this office trusts. Criterion P73. */
  trustedMachines: () => request<WhatTheOfficeTrusts>('/api/office/trusted-machines'),

  /**
   * WHETHER THE ONE-VERSION KEY WINDOW IS STILL OPEN, AND WHETHER THIS BROWSER MAY PRESS.
   * Criterion P83, point 6.
   *
   * The Settings panel reads this beside the list of callers with no key, so the page can draw the
   * press while the window is open and who closed it and when after it is shut. `mayPress` is
   * false on a browser that holds no key; the panel then draws the sentence instead of the press,
   * so a caller the window made the person is never offered a button that would shut it out.
   */
  keyWindow: () => request<WhatTheKeyWindowSaysToThisCaller>('/api/office/key-window'),

  /**
   * CLOSE THE WINDOW, IN ONE PRESS. The person's own act. A secretary holding the
   * person's grant may press it where this office's list of what the grant carries says so; any other agent is refused
   * and the refusal names who may. It closes both halves at once and there is no separate remote switch.
   */
  closeTheKeyWindow: () =>
    request<{ window: WhatTheKeyWindowSays }>('/api/office/key-window/close', { method: 'POST' }),

  /**
   * THE KEYS THIS OFFICE HAS: ITS OWN TWO, AND EACH RUNTIME'S OWN ASKED READ-ONLY. Criterion U2.
   *
   * The read carries no value: each office key is a boolean and each runtime's own is one of three
   * words. `setAKey` writes one of the office's own and answers the whole reading, which still
   * carries no value. `testAKey` sends a metadata call that costs nothing and answers one of four
   * words, never the key.
   */
  theKeys: () => request<import('@shared/office-keys.ts').TheKeys>('/api/office/keys'),

  setAKey: (provider: import('@shared/office-keys.ts').OfficeKeyProvider, value: string) =>
    request<import('@shared/office-keys.ts').TheKeys>('/api/office/keys/set', {
      method: 'POST',
      body: JSON.stringify({ provider, value }),
    }),

  testAKey: (provider: import('@shared/office-keys.ts').OfficeKeyProvider) =>
    request<import('@shared/office-keys.ts').KeyTestResult>('/api/office/keys/test', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    }),

  /**
   * THE CASTING TABLE, 选角表. `casting` reads every role card
   * with its castings; `castingHistory` reads one casting's changes. The four writes are the person's own
   * acts: an agent is refused with a 403 whose words say so. `addCasting` adds one, `changeCasting` sets
   * the cells a write names on one, `removeCasting` removes one, and `markCasting` moves the mark to one.
   */
  casting: () => request<import('@shared/casting.ts').CastingReading>('/api/casting'),

  castingHistory: (role: string, casting: number) =>
    request<import('@shared/casting.ts').CastingHistory>(`/api/casting/${encodeURIComponent(role)}/history?casting=${String(casting)}`),

  addCasting: (
    role: string,
    add: {
      project: string | null
      native?: import('@shared/casting.ts').CastingNative
    } & Partial<Record<import('@shared/casting.ts').CastingCell, { value: string | null; decision: string | null }>>,
  ) =>
    request<import('@shared/casting.ts').CastingWritten>(`/api/casting/${encodeURIComponent(role)}`, {
      method: 'POST',
      body: JSON.stringify(add),
    }),

  changeCasting: (id: number, change: Partial<Record<import('@shared/casting.ts').CastingCell, { value: string | null; decision: string | null }>>) =>
    request<import('@shared/casting.ts').CastingWritten>(`/api/casting/rows/${String(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    }),

  changeCastingNative: (id: number, native: import('@shared/casting.ts').CastingNative | null) =>
    request<import('@shared/casting.ts').CastingWritten>(`/api/casting/rows/${String(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ native }),
    }),

  clearCastingHold: (id: number) =>
    request<import('@shared/casting.ts').CastingWritten>(`/api/casting/rows/${String(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ hold: null }),
    }),

  removeCasting: (id: number) =>
    request<import('@shared/casting.ts').CastingWritten>(`/api/casting/rows/${String(id)}`, { method: 'DELETE' }),

  markCasting: (id: number) =>
    request<import('@shared/casting.ts').CastingWritten>(`/api/casting/rows/${String(id)}/mark`, { method: 'POST' }),

  /**
   * THE CASTING LABELS. `addCastingLabel` makes one, `changeCastingLabel` renames one or writes what it means, one of
   * the two in each write, and `removeCastingLabel` removes one no row carries. `castingLabelHistory` reads one label's
   * changes, a removed label's too.
   */
  addCastingLabel: (name: string) =>
    request<import('@shared/casting.ts').CastingLabelWritten>('/api/casting/labels', { method: 'POST', body: JSON.stringify({ name }) }),

  changeCastingLabel: (id: number, change: { name: string } | { meaning: { value: string | null } }) =>
    request<import('@shared/casting.ts').CastingLabelWritten>(`/api/casting/labels/${String(id)}`, { method: 'PATCH', body: JSON.stringify(change) }),

  removeCastingLabel: (id: number) =>
    request<import('@shared/casting.ts').CastingLabelWritten>(`/api/casting/labels/${String(id)}`, { method: 'DELETE' }),

  castingLabelHistory: (id: number) =>
    request<import('@shared/casting.ts').CastingLabelHistory>(`/api/casting/labels/${String(id)}/history`),

  /**
   * Trust one. The person's press. A secretary holding the person's grant may press it where this office's list of
   * what the grant carries says so; any other agent is refused and the refusal names who may.
   */
  trustAMachine: (address: string, note: string | null) =>
    request<{ machine: TrustedMachine }>('/api/office/trusted-machines', {
      method: 'POST',
      body: JSON.stringify(note === null ? { address } : { address, note }),
    }),

  /** Stop trusting one. The row is kept and reads as removed. */
  stopTrustingAMachine: (id: string, because: string | null) =>
    request<{ machine: TrustedMachine }>(`/api/office/trusted-machines/${encodeURIComponent(id)}/remove`, {
      method: 'POST',
      body: JSON.stringify(because === null ? {} : { because }),
    }),

  /**
   * The person gives one agent a role card. Criterion P64.
   *
   * It is asked from the agent's own profile, reached from the Embassy, and from nowhere else:
   * appointing a role, and for how long, belongs on that profile.
   */
  giveThisAgentACard: (handle: string, role: string) =>
    request<{ agent: string; role: string; wasHolding: string | null; note: string }>(
      `/api/roles/card/${encodeURIComponent(handle)}`,
      { method: 'POST', body: JSON.stringify({ role }) },
    ),

  /**
   * The person answers the card an agent asked them for, with one press. F15 point 2.
   *
   * The ask used to be refused with a 409 to an agent whose starter is the person. Now it waits on
   * GET /api/needs-you and on the agent's own page, and this is the press that answers it.
   */
  answerACardRequest: (requestId: string, answer: 'grant' | 'refuse', says?: string, workspaceId?: string) =>
    request<{ request: string; answer: string; agent: string; role: string | null; note: string }>(
      `/api/roles/requests/${encodeURIComponent(requestId)}/${answer}`,
      {
        method: 'POST',
        body: JSON.stringify(says === undefined ? {} : { says }),
        // THE ASK'S OWN PROJECT, when the caller names it: Home and the Embassy draw asks from every
        // project, and the server answers an ask only in the project it was filed in. Problem NXEhOBumu5ZZ.
        ...(workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
      },
    ),

  /**
   * The person withdraws a new-key grant nobody collected, with one press, as point 9 of a decision
   * says.
   */
  withdrawANewKeyGrant: (requestId: string) =>
    request<{ request: string; answer: string; agent: string; note: string }>(
      `/api/roles/requests/${encodeURIComponent(requestId)}/withdraw`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  /**
   * The person says a secretary may act for them, for the reason they give, until whichever end they picked. Criterion
   * P59, and a decision: the press asks for their reason, and a time left empty is a day.
   */
  letThisAgentActForYou: (handle: string, reason: string, endsWhen: string, until: string | null) =>
    request<{ agent: string; elevation: Elevation; note: string; writtenOnTheRun: string | null; told: string }>(
      `/api/roles/elevation/${encodeURIComponent(handle)}`,
      {
        method: 'POST',
        body: JSON.stringify({ reason, endsWhen, ...(until === null ? {} : { until }) }),
      },
    ),

  /** What the person's grant carries in this office: every door the list names, the card's answer and this office's. */
  whatTheGrantCarries: () => request<WhatTheGrantCarriesReading>('/api/office/what-the-grant-carries'),

  /** The person changes this office's answer about some doors, pressing it themselves. "default" sets a door back. */
  changeWhatTheGrantCarries: (changes: { door: string; answer: AChoiceForADoor }[]) =>
    request<WhatTheGrantCarriesAfterAChange>('/api/office/what-the-grant-carries', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    }),

  /** The person ends it, before whichever end it was given. Only they can. Criterion P59. */
  endWhatItIsDoingForYou: (handle: string) =>
    request<{ agent: string; elevation: Elevation; note: string }>(`/api/roles/elevation/${encodeURIComponent(handle)}`, {
      method: 'DELETE',
    }),

  /**
   * EVERY PACKAGED TASK IN THIS PROJECT, newest package first. Criterion F16 point 2.
   *
   * THE COLUMN IS A READING OF THE RECORDS, not a second store: the reply is worked out fresh from
   * the task's own `package` field, the live claims on it, its bundle's export list, its returns and
   * its completion, every time this is asked. `couldNotRead` names a packaged task whose `package`
   * field could not be read rather than dropping it silently.
   */
  delegation: () => request<DelegationReply>('/api/delegation'),
  /** The same reading of the packages made for work inside the office, which `delegation` does not list. */
  delegationInside: () => request<DelegationReply>('/api/delegation/inside'),

  /**
   * ONE PACKAGE'S WORKERS, oldest ask first: each worker's run, model, the points it was given, its tokens, its minutes
   * and how many hand-backs name its run. A reading of the records; nothing writes. Round FQ, point OP-3.
   */
  packageWorkers: (recordId: string) =>
    request<TheWorkersOfAPackage>(`/api/delegation/${encodeURIComponent(recordId)}/workers`),

  /** Every package asked for work on one day, newest ask first, in pages of at most 25, from the same reading. */
  packagesOfWorkersOnADay: (day: string, page = 1, size = 25) =>
    request<TheWorkersOfADay>(
      `/api/delegation/workers?day=${encodeURIComponent(day)}&page=${String(page)}&size=${String(size)}`,
    ),

  /**
   * PUT SOMETHING BACK THAT CAME FROM OUTSIDE THE OFFICE. Criterion F16 point 5, the return door.
   *
   * IT TAKES PATHS, NOT BYTES. The pictures and the zip go through `sendAPicture` and
   * `sendAReturnedFile` first, which write the file and hand back the path this call carries. The
   * server refuses a path neither of those doors produced, so a caller cannot point the office at a
   * file it never accepted.
   */
  returnFromOutside: (
    recordId: string,
    body: { fromOutside?: string; words?: string; pictures?: string[]; file?: string },
  ) =>
    request<ReturnFromOutsideReply>(`/api/delegation/${recordId}/return`, {
      method: 'POST',
      body: json(body),
    }),

  /**
   * THE ONE RESPONSIBLE, OR THE PERSON, SAYS A PACKAGE'S TASK IS FINISHED. Criterion F16 point 5.
   *
   * It takes no arguments: a confirmation is a press. The server writes `completed` once and
   * refuses every other caller by name.
   */
  confirmPackage: (recordId: string) =>
    request<ConfirmPackageReply>(`/api/delegation/${recordId}/confirm`, { method: 'POST', body: json({}) }),

  /**
   * MAKE THE TEXT A PERSON CARRIES TO AN OUTSIDE CHAT, screening it first. Criterion F16 points 1
   * and 6.
   *
   * It is a press and takes no arguments for the text answer. A successful call has already
   * recorded the entry on the package's bundle through the bundle's own export door, and the reply
   * carries the text and what the screen said about all of it. A `refused` finding arrives as an
   * `ApiError` naming every finding, and nothing was recorded.
   *
   * THE FILES ANSWER ASKS FOR THE ONE ZIP, and the entry the server wrote is read back so the page
   * can say the export number and the three counts. The two answers are told apart by `kind`.
   */
  exportOutside: async (recordId: string, withFiles = false): Promise<OutsideExportAnswer> => {
    if (!withFiles) {
      const answer = await request<OutsideExportReply>(`/api/delegation/${recordId}/export-outside`, {
        method: 'POST',
        body: json({}),
      })
      return { kind: 'text', ...answer }
    }
    // THE PACKAGE'S BUNDLE IS WHERE THE ENTRY LANDS. The task's own `package` field names it; the
    // text answer needs none of this, so the text path above reads nothing extra.
    const task = await request<RecordDetail>(`/api/records/${encodeURIComponent(recordId)}`)
    const pkg = task.record.data['package'] as { bundleId?: unknown } | undefined
    if (pkg === undefined || typeof pkg.bundleId !== 'string') throw new Error(t('zipExport.noPackage'))
    const answer = await request<TheBytesThatAnswered>(
      `/api/delegation/${recordId}/export-outside`,
      { method: 'POST', body: json({ withFiles: true }) },
      'bytes',
    )
    // THE ENTRY IS READ IN THE TASK'S OWN PROJECT, where the door wrote it. The task and its bundle
    // are one project, and naming it here keeps a page opened from another project from reading the
    // entry in the wrong one.
    const entry = await theExportEntryJustWritten(pkg.bundleId, task.record.workspaceId)
    // A ZIP PRESS RECORDS THE SCREEN'S ANSWER ON THE ENTRY, beside the files. An entry with none
    // would draw no findings where the text press draws them, so this says the entry was not
    // recorded rather than handing the page a zip with the findings silently missing.
    if (entry.screening === null) throw new Error(t('zipExport.notRecorded'))
    return {
      kind: 'zip',
      bytes: answer.bytes,
      n: entry.n,
      // THE ZIP IS NAMED FROM THE TASK, as the server names it. The entry is on a bundle whose own
      // title is "Package of ...", which is not the name a person should be handed.
      title: task.record.title,
      included: entry.included,
      missing: entry.missing,
      leftOut: entry.leftOut,
      screening: entry.screening,
    }
  },

  /**
   * THE SAME TEXT AS A PAGE OF PLAIN TEXT. Criterion F16 point 6, criterion B29.
   *
   * IT IS AN ADDRESS AND NOT A CALL, because the whole point is that a browser opens it: a tab
   * showing text/plain needs no clipboard. The project travels in the address because a tab opened
   * from a link sends none of this app's headers.
   */
  delegationTextAddress: (recordId: string, workspace: string) =>
    theApiUrlFor(
      `/api/delegation/as-text?workspace=${encodeURIComponent(workspace)}&task=${encodeURIComponent(recordId)}`,
    ),

  /**
   * PUT A ZIP SOMEBODY BROUGHT BACK WHERE A RECORD CAN POINT AT IT, and get back the path.
   *
   * It writes no record; the return door is what carries the path. Base64 for the reason the
   * pictures door takes base64: this server has no multipart parser.
   */
  sendAReturnedFile: (bytes: string, workspaceId?: string) =>
    request<{ returnedFile: { path: string; mime: string; bytes: number } }>('/api/returned-files', {
      ...(workspaceId === undefined ? {} : { headers: { [WORKSPACE_HEADER]: workspaceId } }),
      method: 'POST',
      body: json({ bytes }),
    }),
}
