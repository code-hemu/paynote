export const SETTING_KEYS = {
  businessName: 'business.name',
  businessAddress: 'business.address',
  businessPhone: 'business.phone',
  businessEmail: 'business.email',
  businessLogo: 'business.logo',
  receiptPrefix: 'receipt.prefix',
  receiptTimezone: 'receipt.timezone',
} as const

export interface BusinessProfile {
  name: string
  address: string
  phone: string
  email: string
  logo: string
}

export interface SettingsFormValues {
  businessName: string
  businessAddress: string
  businessPhone: string
  businessEmail: string
  businessLogo: string
  receiptPrefix: string
  receiptTimezone: string
}

export type SettingsErrors = Record<string, string>

export const DEFAULT_SETTINGS: SettingsFormValues = {
  businessName: '',
  businessAddress: '',
  businessPhone: '',
  businessEmail: '',
  businessLogo: '',
  receiptPrefix: 'PN',
  receiptTimezone: 'Asia/Kolkata',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PREFIX_PATTERN = /^[A-Za-z0-9-]{1,10}$/

export function validateSettings(values: SettingsFormValues): SettingsErrors {
  const errors: SettingsErrors = {}

  checkLength(values.businessName, 'businessName', 'Business name', 200, errors)
  checkLength(values.businessAddress, 'businessAddress', 'Address', 500, errors)
  checkLength(values.businessPhone, 'businessPhone', 'Phone', 40, errors)
  checkLength(values.businessEmail, 'businessEmail', 'Email', 200, errors)
  checkLength(values.receiptTimezone, 'receiptTimezone', 'Timezone', 100, errors)

  if (values.businessEmail.trim() && !EMAIL_PATTERN.test(values.businessEmail.trim())) {
    errors.businessEmail = 'Enter a valid email address.'
  }

  const prefix = values.receiptPrefix.trim()

  if (!prefix) {
    errors.receiptPrefix = 'Receipt prefix is required.'
  } else if (!PREFIX_PATTERN.test(prefix)) {
    errors.receiptPrefix = 'Use up to 10 letters, numbers, or dashes.'
  }

  if (values.businessLogo.trim() && !isSafeImageSource(values.businessLogo.trim())) {
    errors.businessLogo = 'Logo must be an http(s) or data image URL.'
  }

  return errors
}

export function settingsToFormValues(
  settings: Record<string, string>,
): SettingsFormValues {
  return {
    businessName: settings[SETTING_KEYS.businessName] ?? DEFAULT_SETTINGS.businessName,
    businessAddress:
      settings[SETTING_KEYS.businessAddress] ?? DEFAULT_SETTINGS.businessAddress,
    businessPhone: settings[SETTING_KEYS.businessPhone] ?? DEFAULT_SETTINGS.businessPhone,
    businessEmail: settings[SETTING_KEYS.businessEmail] ?? DEFAULT_SETTINGS.businessEmail,
    businessLogo: settings[SETTING_KEYS.businessLogo] ?? DEFAULT_SETTINGS.businessLogo,
    receiptPrefix: settings[SETTING_KEYS.receiptPrefix] ?? DEFAULT_SETTINGS.receiptPrefix,
    receiptTimezone:
      settings[SETTING_KEYS.receiptTimezone] ?? DEFAULT_SETTINGS.receiptTimezone,
  }
}

export function formValuesToSettings(
  values: SettingsFormValues,
): Record<string, string> {
  return {
    [SETTING_KEYS.businessName]: values.businessName.trim(),
    [SETTING_KEYS.businessAddress]: values.businessAddress.trim(),
    [SETTING_KEYS.businessPhone]: values.businessPhone.trim(),
    [SETTING_KEYS.businessEmail]: values.businessEmail.trim(),
    [SETTING_KEYS.businessLogo]: values.businessLogo.trim(),
    [SETTING_KEYS.receiptPrefix]: values.receiptPrefix.trim().toUpperCase(),
    [SETTING_KEYS.receiptTimezone]: values.receiptTimezone.trim(),
  }
}

export function businessProfileFromSettings(
  settings: Record<string, string>,
): BusinessProfile {
  const values = settingsToFormValues(settings)

  return {
    name: values.businessName,
    address: values.businessAddress,
    phone: values.businessPhone,
    email: values.businessEmail,
    logo: values.businessLogo,
  }
}

function checkLength(
  value: string,
  field: string,
  label: string,
  maxLength: number,
  errors: SettingsErrors,
): void {
  if (value.trim().length > maxLength) {
    errors[field] = `${label} must be ${maxLength} characters or fewer.`
  }
}

function isSafeImageSource(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);/i.test(value)
}
