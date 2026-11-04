import { isPaymentMethod } from './receipt-categories.ts'

export const SETTING_KEYS = {
  profileType: 'profile.type',
  fullName: 'profile.fullName',
  businessName: 'business.name',
  legalBusinessName: 'business.legalName',
  businessType: 'business.type',
  businessRegistrationNumber: 'business.registrationNumber',
  taxIdentificationNumber: 'business.taxId',
  website: 'business.website',
  businessAddress: 'business.address',
  businessPhone: 'business.phone',
  businessEmail: 'business.email',
  businessLogo: 'business.logo',
  taxRegistrationDetails: 'business.taxRegistration',
  profilePhoto: 'profile.photo',
  profileSignature: 'profile.signature',
  receiptPrefix: 'receipt.prefix',
  receiptCurrency: 'receipt.currency',
  receiptTaxRate: 'receipt.taxRate',
  receiptNumberFormat: 'receipt.numberFormat',
  receiptFooterMessage: 'receipt.footer',
  receiptPaymentMethod: 'receipt.paymentMethod',
  receiptTimezone: 'receipt.timezone',
  dateFormat: 'display.dateFormat',
  numberFormat: 'display.numberFormat',
} as const

export const DATE_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'D MMM YYYY',
] as const

export const NUMBER_FORMATS = [
  'en-IN',
  'en-US',
  'en-GB',
  'de-DE',
  'fr-FR',
] as const

export interface BusinessProfile {
  name: string
  address: string
  phone: string
  email: string
  logo: string
  website?: string
  taxRegistration?: string
  signature?: string
}

export type ProfileType = 'individual' | 'business'

export interface SettingsFormValues {
  profileType: string
  fullName: string
  businessName: string
  legalBusinessName: string
  businessType: string
  businessRegistrationNumber: string
  taxIdentificationNumber: string
  website: string
  businessAddress: string
  businessPhone: string
  businessEmail: string
  businessLogo: string
  taxRegistrationDetails: string
  profilePhoto: string
  profileSignature: string
  receiptPrefix: string
  receiptCurrency: string
  receiptTaxRate: string
  receiptNumberFormat: string
  receiptFooterMessage: string
  defaultPaymentMethod: string
  receiptTimezone: string
  dateFormat: string
  numberFormat: string
}

export type SettingsErrors = Record<string, string>

export const DEFAULT_SETTINGS: SettingsFormValues = {
  profileType: 'business',
  fullName: '',
  businessName: '',
  legalBusinessName: '',
  businessType: '',
  businessRegistrationNumber: '',
  taxIdentificationNumber: '',
  website: '',
  businessAddress: '',
  businessPhone: '',
  businessEmail: '',
  businessLogo: '',
  taxRegistrationDetails: '',
  profilePhoto: '',
  profileSignature: '',
  receiptPrefix: 'PN',
  receiptCurrency: 'INR',
  receiptTaxRate: '',
  receiptNumberFormat: '{PREFIX}-{YYYY}-{0000}',
  receiptFooterMessage: '',
  defaultPaymentMethod: 'cash',
  receiptTimezone: 'Asia/Kolkata',
  dateFormat: 'DD/MM/YYYY',
  numberFormat: 'en-IN',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PREFIX_PATTERN = /^[A-Za-z0-9-]{1,10}$/
const CURRENCY_PATTERN = /^[A-Za-z]{3}$/
const WEBSITE_PATTERN = /^https?:\/\/\S+$/i
const SETTING_MAX_LENGTH = 5000

export function validateSettings(values: SettingsFormValues): SettingsErrors {
  const errors: SettingsErrors = {}
  const isIndividual = values.profileType === 'individual'
  const isBusiness = values.profileType === 'business'

  if (!isIndividual && !isBusiness) {
    errors.profileType = 'Choose Individual or Business.'
  }

  checkLength(values.fullName, 'fullName', 'Full name', 200, errors)
  checkLength(values.businessName, 'businessName', 'Business name', 200, errors)
  checkLength(
    values.legalBusinessName,
    'legalBusinessName',
    'Legal business name',
    200,
    errors,
  )
  checkLength(values.businessType, 'businessType', 'Business type', 100, errors)
  checkLength(
    values.businessRegistrationNumber,
    'businessRegistrationNumber',
    'Business registration number',
    100,
    errors,
  )
  checkLength(
    values.taxIdentificationNumber,
    'taxIdentificationNumber',
    'Tax identification number',
    100,
    errors,
  )
  checkLength(values.website, 'website', 'Website', 500, errors)
  checkLength(values.businessAddress, 'businessAddress', 'Address', 500, errors)
  checkLength(values.businessPhone, 'businessPhone', 'Phone number', 40, errors)
  checkLength(values.businessEmail, 'businessEmail', 'Email address', 200, errors)
  checkLength(values.businessLogo, 'businessLogo', 'Logo URL', SETTING_MAX_LENGTH, errors)
  checkLength(
    values.taxRegistrationDetails,
    'taxRegistrationDetails',
    'Tax registration details',
    500,
    errors,
  )
  checkLength(
    values.profilePhoto,
    'profilePhoto',
    'Profile photo',
    SETTING_MAX_LENGTH,
    errors,
  )
  checkLength(
    values.profileSignature,
    'profileSignature',
    'Digital signature',
    SETTING_MAX_LENGTH,
    errors,
  )
  checkLength(
    values.receiptNumberFormat,
    'receiptNumberFormat',
    'Receipt numbering format',
    100,
    errors,
  )
  checkLength(
    values.receiptFooterMessage,
    'receiptFooterMessage',
    'Receipt footer message',
    500,
    errors,
  )
  checkLength(values.receiptTimezone, 'receiptTimezone', 'Timezone', 100, errors)

  if (isIndividual && !values.fullName.trim()) {
    errors.fullName = 'Full name is required.'
  }

  if (isBusiness) {
    if (!values.businessName.trim()) {
      errors.businessName = 'Business name is required.'
    }

    if (!values.businessPhone.trim()) {
      errors.businessPhone = 'Phone number is required.'
    }

    if (!values.businessAddress.trim()) {
      errors.businessAddress = 'Address is required.'
    }
  }

  if (values.businessEmail.trim()) {
    if (!EMAIL_PATTERN.test(values.businessEmail.trim())) {
      errors.businessEmail = 'Enter a valid email address.'
    }
  } else if (isBusiness) {
    errors.businessEmail = 'Email address is required.'
  }

  if (values.website.trim() && !WEBSITE_PATTERN.test(values.website.trim())) {
    errors.website = 'Website must start with http:// or https://.'
  }

  const prefix = values.receiptPrefix.trim()

  if (!prefix) {
    errors.receiptPrefix = 'Receipt prefix is required.'
  } else if (!PREFIX_PATTERN.test(prefix)) {
    errors.receiptPrefix = 'Use up to 10 letters, numbers, or dashes.'
  }

  const currency = values.receiptCurrency.trim()

  if (!CURRENCY_PATTERN.test(currency)) {
    errors.receiptCurrency = 'Choose a 3-letter currency code.'
  }

  const taxRate = values.receiptTaxRate.trim()

  if (taxRate) {
    const value = Number(taxRate)

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      errors.receiptTaxRate = 'Tax rate must be between 0 and 100.'
    }
  }

  if (!values.receiptNumberFormat.trim()) {
    errors.receiptNumberFormat = 'Receipt numbering format is required.'
  }

  if (!isPaymentMethod(values.defaultPaymentMethod)) {
    errors.defaultPaymentMethod = 'Choose a default payment method.'
  }

  if (!isDateFormat(values.dateFormat)) {
    errors.dateFormat = 'Choose a date format.'
  }

  if (!isNumberFormat(values.numberFormat)) {
    errors.numberFormat = 'Choose a number format.'
  }

  if (
    values.profileType !== 'individual' &&
    values.businessLogo.trim() &&
    !isSafeImageSource(values.businessLogo.trim())
  ) {
    errors.businessLogo = 'Logo must be an http(s) or data image URL.'
  }

  if (
    values.profileType === 'individual' &&
    values.profilePhoto.trim() &&
    !isSafeImageSource(values.profilePhoto.trim())
  ) {
    errors.profilePhoto = 'Profile photo must be an http(s) or data image URL.'
  }

  if (
    values.profileSignature.trim() &&
    !isSafeImageSource(values.profileSignature.trim())
  ) {
    errors.profileSignature =
      'Digital signature must be an http(s) or data image URL.'
  }

  return errors
}

export function settingsToFormValues(
  settings: Record<string, string>,
): SettingsFormValues {
  const profileType = settings[SETTING_KEYS.profileType] ?? ''
  const storedBusinessName = settings[SETTING_KEYS.businessName] ?? ''

  return {
    profileType: isProfileType(profileType)
      ? profileType
      : DEFAULT_SETTINGS.profileType,
    fullName:
      settings[SETTING_KEYS.fullName] ??
      (profileType === 'individual'
        ? storedBusinessName
        : DEFAULT_SETTINGS.fullName),
    businessName: storedBusinessName,
    legalBusinessName:
      settings[SETTING_KEYS.legalBusinessName] ?? DEFAULT_SETTINGS.legalBusinessName,
    businessType:
      settings[SETTING_KEYS.businessType] ?? DEFAULT_SETTINGS.businessType,
    businessRegistrationNumber:
      settings[SETTING_KEYS.businessRegistrationNumber] ??
      DEFAULT_SETTINGS.businessRegistrationNumber,
    taxIdentificationNumber:
      settings[SETTING_KEYS.taxIdentificationNumber] ??
      DEFAULT_SETTINGS.taxIdentificationNumber,
    website: settings[SETTING_KEYS.website] ?? DEFAULT_SETTINGS.website,
    businessAddress:
      settings[SETTING_KEYS.businessAddress] ?? DEFAULT_SETTINGS.businessAddress,
    businessPhone: settings[SETTING_KEYS.businessPhone] ?? DEFAULT_SETTINGS.businessPhone,
    businessEmail: settings[SETTING_KEYS.businessEmail] ?? DEFAULT_SETTINGS.businessEmail,
    businessLogo: settings[SETTING_KEYS.businessLogo] ?? DEFAULT_SETTINGS.businessLogo,
    taxRegistrationDetails:
      settings[SETTING_KEYS.taxRegistrationDetails] ??
      DEFAULT_SETTINGS.taxRegistrationDetails,
    profilePhoto:
      settings[SETTING_KEYS.profilePhoto] ?? DEFAULT_SETTINGS.profilePhoto,
    profileSignature:
      settings[SETTING_KEYS.profileSignature] ?? DEFAULT_SETTINGS.profileSignature,
    receiptPrefix: settings[SETTING_KEYS.receiptPrefix] ?? DEFAULT_SETTINGS.receiptPrefix,
    receiptCurrency:
      settings[SETTING_KEYS.receiptCurrency] ?? DEFAULT_SETTINGS.receiptCurrency,
    receiptTaxRate:
      settings[SETTING_KEYS.receiptTaxRate] ?? DEFAULT_SETTINGS.receiptTaxRate,
    receiptNumberFormat:
      settings[SETTING_KEYS.receiptNumberFormat] ??
      DEFAULT_SETTINGS.receiptNumberFormat,
    receiptFooterMessage:
      settings[SETTING_KEYS.receiptFooterMessage] ??
      DEFAULT_SETTINGS.receiptFooterMessage,
    defaultPaymentMethod:
      settings[SETTING_KEYS.receiptPaymentMethod] ??
      DEFAULT_SETTINGS.defaultPaymentMethod,
    receiptTimezone:
      settings[SETTING_KEYS.receiptTimezone] ?? DEFAULT_SETTINGS.receiptTimezone,
    dateFormat: settings[SETTING_KEYS.dateFormat] ?? DEFAULT_SETTINGS.dateFormat,
    numberFormat:
      settings[SETTING_KEYS.numberFormat] ?? DEFAULT_SETTINGS.numberFormat,
  }
}

export function formValuesToSettings(
  values: SettingsFormValues,
): Record<string, string> {
  const isIndividual = values.profileType === 'individual'
  const fullName = values.fullName.trim()
  const businessName = isIndividual ? fullName : values.businessName.trim()

  return {
    [SETTING_KEYS.profileType]: isProfileType(values.profileType)
      ? values.profileType
      : DEFAULT_SETTINGS.profileType,
    [SETTING_KEYS.fullName]: fullName,
    [SETTING_KEYS.businessName]: businessName,
    [SETTING_KEYS.legalBusinessName]: values.legalBusinessName.trim(),
    [SETTING_KEYS.businessType]: values.businessType.trim(),
    [SETTING_KEYS.businessRegistrationNumber]:
      values.businessRegistrationNumber.trim(),
    [SETTING_KEYS.taxIdentificationNumber]:
      values.taxIdentificationNumber.trim(),
    [SETTING_KEYS.website]: values.website.trim(),
    [SETTING_KEYS.businessAddress]: values.businessAddress.trim(),
    [SETTING_KEYS.businessPhone]: values.businessPhone.trim(),
    [SETTING_KEYS.businessEmail]: values.businessEmail.trim(),
    [SETTING_KEYS.businessLogo]: values.businessLogo.trim(),
    [SETTING_KEYS.taxRegistrationDetails]: values.taxRegistrationDetails.trim(),
    [SETTING_KEYS.profilePhoto]: values.profilePhoto.trim(),
    [SETTING_KEYS.profileSignature]: values.profileSignature.trim(),
    [SETTING_KEYS.receiptPrefix]: values.receiptPrefix.trim().toUpperCase(),
    [SETTING_KEYS.receiptCurrency]: values.receiptCurrency.trim().toUpperCase(),
    [SETTING_KEYS.receiptTaxRate]: values.receiptTaxRate.trim(),
    [SETTING_KEYS.receiptNumberFormat]: values.receiptNumberFormat.trim(),
    [SETTING_KEYS.receiptFooterMessage]: values.receiptFooterMessage.trim(),
    [SETTING_KEYS.receiptPaymentMethod]: values.defaultPaymentMethod.trim(),
    [SETTING_KEYS.receiptTimezone]: values.receiptTimezone.trim(),
    [SETTING_KEYS.dateFormat]: values.dateFormat.trim(),
    [SETTING_KEYS.numberFormat]: values.numberFormat.trim(),
  }
}

export function businessProfileFromSettings(
  settings: Record<string, string>,
): BusinessProfile {
  const values = settingsToFormValues(settings)

  return {
    name:
      values.profileType === 'individual'
        ? values.fullName || values.businessName
        : values.businessName,
    address: values.businessAddress,
    phone: values.businessPhone,
    email: values.businessEmail,
    logo: values.profileType === 'individual' ? values.profilePhoto : values.businessLogo,
    website: values.website,
    taxRegistration: values.taxRegistrationDetails,
    signature: values.profileSignature,
  }
}

function isProfileType(value: string): value is ProfileType {
  return value === 'individual' || value === 'business'
}

function isDateFormat(value: string): boolean {
  return (DATE_FORMATS as readonly string[]).includes(value)
}

function isNumberFormat(value: string): boolean {
  return (NUMBER_FORMATS as readonly string[]).includes(value)
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
  return (
    /^https?:\/\//i.test(value) ||
    /^data:image\/(png|jpe?g|webp|gif|svg\+xml|x-icon|ico|bmp|avif);/i.test(value)
  )
}
