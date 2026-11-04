import {
  settingsToFormValues,
  type SettingsFormValues,
} from '../domain/settings.ts'
import { setFormatPreferences } from '../utils/format.ts'

import { readSettings } from './settings.ts'

export interface AppPreferences {
  defaultPaymentMethod: string
  footerMessage: string
  taxRate: string
}

const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultPaymentMethod: 'cash',
  footerMessage: '',
  taxRate: '',
}

let currentPreferences: AppPreferences = { ...DEFAULT_APP_PREFERENCES }

export function applyAppPreferences(values: SettingsFormValues): void {
  currentPreferences = {
    defaultPaymentMethod: values.defaultPaymentMethod || 'cash',
    footerMessage: values.receiptFooterMessage,
    taxRate: values.receiptTaxRate,
  }

  setFormatPreferences({
    currency: values.receiptCurrency || 'INR',
    locale: values.numberFormat || 'en-IN',
    dateFormat: values.dateFormat || 'DD/MM/YYYY',
    timeZone: values.receiptTimezone || 'UTC',
  })
}

export function getAppPreferences(): AppPreferences {
  return { ...currentPreferences }
}

export async function refreshAppPreferences(): Promise<void> {
  applyAppPreferences(settingsToFormValues(await readSettings()))
}
