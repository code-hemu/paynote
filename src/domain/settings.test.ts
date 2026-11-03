import { describe, expect, it } from '@guchho/test'

import {
  businessProfileFromSettings,
  DEFAULT_SETTINGS,
  formValuesToSettings,
  SETTING_KEYS,
  settingsToFormValues,
  validateSettings,
  type SettingsFormValues,
} from './settings.ts'

function makeValues(overrides: Partial<SettingsFormValues> = {}): SettingsFormValues {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

describe('settings domain', () => {
  it('accepts valid settings', () => {
    expect(
      validateSettings(
        makeValues({
          businessName: 'Asha Traders',
          businessEmail: 'asha@example.com',
          businessLogo: 'https://example.com/logo.png',
          receiptPrefix: 'AT-1',
        }),
      ),
    ).toEqual({})
  })

  it('validates email, prefix, logo, and lengths', () => {
    const errors = validateSettings(
      makeValues({
        businessName: 'x'.repeat(201),
        businessEmail: 'not-an-email',
        businessLogo: 'javascript:alert(1)',
        receiptPrefix: 'toolongprefix',
      }),
    )

    expect(errors.businessName).toContain('200 characters or fewer')
    expect(errors.businessEmail).toBe('Enter a valid email address.')
    expect(errors.businessLogo).toBe('Logo must be an http(s) or data image URL.')
    expect(errors.receiptPrefix).toBe('Use up to 10 letters, numbers, or dashes.')
    expect(validateSettings(makeValues({ receiptPrefix: ' ' })).receiptPrefix).toBe(
      'Receipt prefix is required.',
    )
  })

  it('maps form values to stored settings and back', () => {
    const values = makeValues({
      businessName: ' Asha Traders ',
      businessAddress: ' 12 Lake Road ',
      businessPhone: ' 9876543210 ',
      businessEmail: ' asha@example.com ',
      businessLogo: ' https://example.com/logo.png ',
      receiptPrefix: ' at ',
      receiptTimezone: ' Asia/Kolkata ',
    })
    const stored = formValuesToSettings(values)

    expect(stored).toEqual({
      [SETTING_KEYS.businessName]: 'Asha Traders',
      [SETTING_KEYS.businessAddress]: '12 Lake Road',
      [SETTING_KEYS.businessPhone]: '9876543210',
      [SETTING_KEYS.businessEmail]: 'asha@example.com',
      [SETTING_KEYS.businessLogo]: 'https://example.com/logo.png',
      [SETTING_KEYS.receiptPrefix]: 'AT',
      [SETTING_KEYS.receiptTimezone]: 'Asia/Kolkata',
    })
    expect(settingsToFormValues(stored)).toEqual({
      ...values,
      businessName: 'Asha Traders',
      businessAddress: '12 Lake Road',
      businessPhone: '9876543210',
      businessEmail: 'asha@example.com',
      businessLogo: 'https://example.com/logo.png',
      receiptPrefix: 'AT',
      receiptTimezone: 'Asia/Kolkata',
    })
  })

  it('builds a printable business profile with defaults', () => {
    expect(businessProfileFromSettings({})).toEqual({
      name: '',
      address: '',
      phone: '',
      email: '',
      logo: '',
    })
    expect(
      businessProfileFromSettings({
        [SETTING_KEYS.businessName]: 'Asha Traders',
      }).name,
    ).toBe('Asha Traders')
  })
})
