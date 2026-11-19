// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `purchase`, something that has to be bought and where it has
 * got to.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind, PURCHASE_STATES and PurchaseState from kinds.ts.
 *
 * THIS FILE IMPORTS `attentionFields`, `commonFields`, `unionOf` AND THE `KindSpec` TYPE FROM
 * ./kind-common.ts. `PURCHASE_STATES` AND `PurchaseState` moved here with the kind, because its
 * `state` field is `unionOf(PURCHASE_STATES)` and a file that imported them from kinds.ts would
 * make the central file and this one load each other.
 */
import { attentionFields, commonFields, unionOf, type KindSpec } from './kind-common.ts'

/** Where a purchase has got to. */
export const PURCHASE_STATES = ['wanted', 'ordered', 'arrived', 'cancelled'] as const
export type PurchaseState = (typeof PURCHASE_STATES)[number]

export const purchaseKind: KindSpec = {
    kind: 'purchase',
    purpose: 'Something that has to be bought, and where it has got to.',
    whenToRecord: 'When work is waiting on an object that is not in the lab. A purchase nobody filed is a week of delay nobody can explain afterwards.',
    humanOnly: false,
    fields: [
      { key: 'state', type: unionOf(PURCHASE_STATES), required: false, description: 'Where it has got to: wanted, ordered, arrived or cancelled.', example: 'ordered' },
      { key: 'why', type: 'string', required: false, description: 'What is blocked until it arrives.', example: 'The 50 N gauge is borrowed and has to go back before the setting 18 run.' },
      { key: 'cost', type: 'number', required: false, description: 'What it costs, as a number. Send `currency` with it — a bare number is not a price.', example: 240 },
      { key: 'currency', type: 'string', required: false, description: 'The currency of `cost`, e.g. "GBP", "EUR", "CNY".', example: 'GBP' },
      { key: 'url', type: 'string', required: false, description: 'Where it is bought from.', example: 'https://uk.rs-online.com/web/p/force-gauges/1234567' },
      { key: 'vendor', type: 'string', required: false, description: 'Who sells it, when that matters more than the link.', example: 'RS Components' },
      { key: 'needed_by', type: 'date', required: false, description: 'The date after which its absence starts costing something.', example: '2026-09-01' },
      ...attentionFields('purchase'),
      ...commonFields('purchase'),
    ],
    rules: ['`cost` and `currency` go together: a number with no currency is not a price.'],
    example: { state: 'wanted', why: 'The borrowed gauge goes back on Friday and the setting 18 run needs one.', cost: 240, currency: 'GBP', needed_by: '2026-09-01' },
}
