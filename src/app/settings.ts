import {
  DEFAULT_SETTINGS,
  formValuesToSettings,
  settingsToFormValues,
  validateSettings,
  type SettingsFormValues,
} from '../domain/settings.ts'
import * as settingsService from '../services/settings.ts'
import { setFormValues, clearFormErrors, focusFirstField } from './form-dom.ts'

export const THEME_KEY = 'paynote.theme'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface SettingsDeps {
  readSettings?: typeof settingsService.readSettings
  setSettings?: typeof settingsService.setSettings
}

export interface SettingsController {
  refresh(): Promise<void>
  destroy(): void
}

interface SettingsElements {
  root: HTMLElement
  form: HTMLFormElement
  save: HTMLButtonElement
  reset: HTMLButtonElement
  theme: HTMLSelectElement
  notice: HTMLElement
  error: HTMLElement
  logoPreview: HTMLElement | null
  logoImage: HTMLImageElement | null
  previewName: HTMLElement | null
  previewAddress: HTMLElement | null
  previewPhone: HTMLElement | null
}

const FIELD_MAP: Record<keyof SettingsFormValues, string> = {
  businessName: 'businessName',
  businessAddress: 'businessAddress',
  businessPhone: 'businessPhone',
  businessEmail: 'businessEmail',
  businessLogo: 'businessLogo',
  receiptPrefix: 'receiptPrefix',
  receiptTimezone: 'receiptTimezone',
}

function queryElements(doc: Document): SettingsElements {
  const elements: SettingsElements = {
    root: doc.querySelector<HTMLElement>('[data-settings]')!,
    form: doc.querySelector<HTMLFormElement>('[data-settings-form]')!,
    save: doc.querySelector<HTMLButtonElement>('[data-settings-save]')!,
    reset: doc.querySelector<HTMLButtonElement>('[data-settings-reset]')!,
    theme: doc.querySelector<HTMLSelectElement>('[data-settings-theme]')!,
    notice: doc.querySelector<HTMLElement>('[data-settings-notice]')!,
    error: doc.querySelector<HTMLElement>('[data-settings-error]')!,
    logoPreview: doc.querySelector<HTMLElement>('[data-settings-logo-preview]'),
    logoImage: doc.querySelector<HTMLImageElement>('[data-settings-logo-image]'),
    previewName: doc.querySelector<HTMLElement>('[data-settings-preview-name]'),
    previewAddress: doc.querySelector<HTMLElement>('[data-settings-preview-address]'),
    previewPhone: doc.querySelector<HTMLElement>('[data-settings-preview-phone]'),
  }

  for (const [name, value] of Object.entries(elements)) {
    if (!value) {
      throw new Error(`Settings markup is incomplete: ${name}.`)
    }
  }

  return elements
}

export function applyTheme(
  doc: Document,
  preference: ThemePreference,
): void {
  const root = doc.documentElement
  root.dataset.theme = preference
  root.style.colorScheme =
    preference === 'dark'
      ? 'dark'
      : preference === 'light'
        ? 'light'
        : 'light dark'
}

export function readTheme(doc: Document): ThemePreference {
  try {
    const stored = doc.defaultView?.localStorage?.getItem(THEME_KEY)

    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    return 'system'
  }

  return 'system'
}

export function createSettingsPage(
  doc: Document,
  deps: SettingsDeps = {},
): SettingsController {
  const elements = queryElements(doc)
  const read = deps.readSettings ?? settingsService.readSettings
  const write = deps.setSettings ?? settingsService.setSettings
  const view = doc.defaultView

  function setNotice(message: string) {
    elements.notice.textContent = message
    elements.notice.hidden = message === ''
  }

  function setError(message: string) {
    elements.error.hidden = message === ''
    elements.error.textContent = message
  }

  function readThemeSelect(): ThemePreference {
    const value = elements.theme.value
    return value === 'light' || value === 'dark' ? value : 'system'
  }

  function storeTheme(preference: ThemePreference) {
    try {
      view?.localStorage?.setItem(THEME_KEY, preference)
    } catch {
      return
    }
  }

  function readForm(): SettingsFormValues {
    const values = DEFAULT_SETTINGS
    const result = { ...values }

    for (const [field, key] of Object.entries(FIELD_MAP)) {
      const element = doc.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-settings-input="${key}"]`,
      )
      result[field as keyof SettingsFormValues] = element?.value ?? ''
    }

    return result
  }

  function updatePreview(values: SettingsFormValues) {
    if (elements.previewName) {
      elements.previewName.textContent = values.businessName || 'Your business name'
    }

    if (elements.previewAddress) {
      elements.previewAddress.textContent = values.businessAddress || 'Business address'
    }

    if (elements.previewPhone) {
      elements.previewPhone.textContent = values.businessPhone || 'Phone number'
    }

    const logo = values.businessLogo.trim()

    if (elements.logoImage && elements.logoPreview) {
      if (logo) {
        elements.logoImage.src = logo
        elements.logoImage.hidden = false
      } else {
        elements.logoImage.removeAttribute('src')
        elements.logoImage.hidden = true
      }
    }
  }

  function applyValues(values: SettingsFormValues) {
    setFormValues(doc, 'settings', {
      businessName: values.businessName,
      businessAddress: values.businessAddress,
      businessPhone: values.businessPhone,
      businessEmail: values.businessEmail,
      businessLogo: values.businessLogo,
      receiptPrefix: values.receiptPrefix,
      receiptTimezone: values.receiptTimezone,
    })
    updatePreview(values)
  }

  async function refresh(): Promise<void> {
    setError('')

    try {
      const settings = await read()
      applyValues(settingsToFormValues(settings))
      elements.theme.value = readTheme(doc)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Settings could not be loaded.',
      )
    }
  }

  async function handleSubmit(event?: Event) {
    event?.preventDefault()
    setError('')
    setNotice('')
    clearFormErrors(doc, 'settings')

    const values = readForm()
    const errors = validateSettings(values)

    if (Object.keys(errors).length > 0) {
      for (const [field, message] of Object.entries(errors)) {
        const element = doc.querySelector<HTMLElement>(
          `[data-settings-field-error="${field}"]`,
        )

        if (element) {
          element.textContent = message
          element.hidden = false
        }

        const input = doc.querySelector<HTMLElement>(`[data-settings-input="${field}"]`)
        input?.setAttribute('aria-invalid', 'true')
      }

      focusFirstField(doc, Object.keys(errors)[0] ?? 'businessName', 'settings')
      return
    }

    elements.save.disabled = true

    try {
      await write(formValuesToSettings(values))
      const theme = readThemeSelect()
      storeTheme(theme)
      applyTheme(doc, theme)
      setNotice('Settings saved.')
      updatePreview(values)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Settings could not be saved.',
      )
    } finally {
      elements.save.disabled = false
    }
  }

  function handleReset() {
    if (!globalThis.confirm('Reset the form to default settings? Nothing is saved until you click Save.')) {
      return
    }

    applyValues(DEFAULT_SETTINGS)
    elements.theme.value = 'system'
    setNotice('Default values loaded. Click Save to apply them.')
  }

  function handleThemeChange() {
    const theme = readThemeSelect()
    applyTheme(doc, theme)
  }

  function handleInput() {
    updatePreview(readForm())
  }

  elements.form.addEventListener('submit', handleSubmit)
  elements.reset.addEventListener('click', handleReset)
  elements.theme.addEventListener('change', handleThemeChange)
  elements.form.addEventListener('input', handleInput)
  applyTheme(doc, readTheme(doc))
  elements.theme.value = readTheme(doc)

  void refresh()

  return {
    refresh,
    destroy() {
      elements.form.removeEventListener('submit', handleSubmit)
      elements.form.removeEventListener('input', handleInput)
    },
  }
}
