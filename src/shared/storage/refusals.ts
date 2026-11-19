// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Installation totals span projects and may only be read by installation stewards. */
export const STORAGE_REFUSAL_CODES = {
  storageTotalsForbidden: {},
  storageDestinationInvalid: {},
  storageDestinationForbidden: {},
  storageDestinationSecretsUnsafe: {},
  storageMediaOmitted: {},
  storageDestinationSecretsManyDeclared: {},
  storageDestinationSecretsParentIsALink: {},
  storageDestinationSecretsNoParent: {},
  storageDestinationSecretsNotAPlainFile: {},
  storageDestinationSecretsOthersMayRead: { mode: 'string' },
  storageDestinationSecretsAnotherOwner: {},
  storageDestinationSecretsTooLarge: {},
  storageDestinationSecretsChangedWhileRead: {},
  storageDestinationSecretsUnreadable: { systemError: 'string' },
  storageDestinationSecretsUnwritable: { systemError: 'string' },
} as const
