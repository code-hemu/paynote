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
          businessPhone: '9876543210',
          businessEmail: 'asha@example.com',
          businessAddress: '12 Lake Road',
          businessLogo: 'https://example.com/logo.png',
          receiptPrefix: 'AT-1',
        }),
      ),
    ).toEqual({})
  })

  it('validates profile type, email, prefix, images, and lengths', () => {
    const errors = validateSettings(
      makeValues({
        profileType: 'other',
        businessName: 'x'.repeat(201),
        businessEmail: 'not-an-email',
        businessLogo: 'javascript:alert(1)',
        profileSignature: 'javascript:alert(1)',
        receiptPrefix: 'toolongprefix',
      }),
    )

    expect(errors.profileType).toBe('Choose Individual or Business.')
    expect(errors.businessName).toContain('200 characters or fewer')
    expect(errors.businessEmail).toBe('Enter a valid email address.')
    expect(errors.businessLogo).toBe('Logo must be an http(s) or data image URL.')
    expect(errors.profileSignature).toBe(
      'Digital signature must be an http(s) or data image URL.',
    )
    expect(errors.receiptPrefix).toBe('Use up to 10 letters, numbers, or dashes.')
    expect(validateSettings(makeValues({ receiptPrefix: ' ' })).receiptPrefix).toBe(
      'Receipt prefix is required.',
    )
  })

  it('requires a full name for individual profiles', () => {
    expect(
      validateSettings(makeValues({ profileType: 'individual', fullName: ' ' }))
        .fullName,
    ).toBe('Full name is required.')
    expect(
      validateSettings(
        makeValues({ profileType: 'individual', fullName: 'Asha Rao' }),
      ).fullName,
    ).toBeUndefined()
    expect(
      validateSettings(makeValues({ profileType: 'business', businessName: '' }))
        .businessName,
    ).toBe('Business name is required.')
  })

  it('accepts optional individual photo and signature images', () => {
    expect(
      validateSettings(
        makeValues({
          profileType: 'individual',
          fullName: 'Asha Rao',
          profilePhoto: 'https://example.com/photo.png',
          profileSignature: 'data:image/png;base64,abc',
        }),
      ),
    ).toEqual({})
  })

  it('rejects unsafe individual photo images', () => {
    expect(
      validateSettings(
        makeValues({
          profileType: 'individual',
          fullName: 'Asha Rao',
          profilePhoto: 'javascript:alert(1)',
        }),
      ).profilePhoto,
    ).toBe('Profile photo must be an http(s) or data image URL.')
  })

  it('maps form values to stored settings and back', () => {
    const values = makeValues({
      profileType: 'individual',
      fullName: ' Asha Rao ',
      businessName: ' Asha Traders ',
      legalBusinessName: ' Asha Traders Pvt Ltd ',
      businessType: ' private-limited ',
      businessRegistrationNumber: ' U12345 ',
      taxIdentificationNumber: ' ABCDE1234F ',
      website: ' https://example.com ',
      businessAddress: ' 12 Lake Road ',
      businessPhone: ' 9876543210 ',
      businessEmail: ' asha@example.com ',
      businessLogo: ' https://example.com/logo.png ',
      taxRegistrationDetails: ' GSTIN 123 ',
      profilePhoto: ' https://example.com/photo.png ',
      profileSignature: ' data:image/png;base64,abc ',
      receiptPrefix: ' at ',
      receiptCurrency: ' inr ',
      receiptTaxRate: ' 18 ',
      receiptNumberFormat: ' {PREFIX}/{YYYY}/{0000} ',
      receiptFooterMessage: ' Thank you ',
      defaultPaymentMethod: 'upi',
      receiptTimezone: ' Asia/Kolkata ',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: 'en-IN',
    })
    const stored = formValuesToSettings(values)

    expect(stored).toEqual({
      [SETTING_KEYS.profileType]: 'individual',
      [SETTING_KEYS.fullName]: 'Asha Rao',
      [SETTING_KEYS.businessName]: 'Asha Rao',
      [SETTING_KEYS.legalBusinessName]: 'Asha Traders Pvt Ltd',
      [SETTING_KEYS.businessType]: 'private-limited',
      [SETTING_KEYS.businessRegistrationNumber]: 'U12345',
      [SETTING_KEYS.taxIdentificationNumber]: 'ABCDE1234F',
      [SETTING_KEYS.website]: 'https://example.com',
      [SETTING_KEYS.businessAddress]: '12 Lake Road',
      [SETTING_KEYS.businessPhone]: '9876543210',
      [SETTING_KEYS.businessEmail]: 'asha@example.com',
      [SETTING_KEYS.businessLogo]: 'https://example.com/logo.png',
      [SETTING_KEYS.taxRegistrationDetails]: 'GSTIN 123',
      [SETTING_KEYS.profilePhoto]: 'https://example.com/photo.png',
      [SETTING_KEYS.profileSignature]: 'data:image/png;base64,abc',
      [SETTING_KEYS.receiptPrefix]: 'AT',
      [SETTING_KEYS.receiptCurrency]: 'INR',
      [SETTING_KEYS.receiptTaxRate]: '18',
      [SETTING_KEYS.receiptNumberFormat]: '{PREFIX}/{YYYY}/{0000}',
      [SETTING_KEYS.receiptFooterMessage]: 'Thank you',
      [SETTING_KEYS.receiptPaymentMethod]: 'upi',
      [SETTING_KEYS.receiptTimezone]: 'Asia/Kolkata',
      [SETTING_KEYS.dateFormat]: 'DD/MM/YYYY',
      [SETTING_KEYS.numberFormat]: 'en-IN',
    })
    expect(settingsToFormValues(stored)).toEqual({
      ...values,
      fullName: 'Asha Rao',
      businessName: 'Asha Rao',
      legalBusinessName: 'Asha Traders Pvt Ltd',
      businessType: 'private-limited',
      businessRegistrationNumber: 'U12345',
      taxIdentificationNumber: 'ABCDE1234F',
      website: 'https://example.com',
      businessAddress: '12 Lake Road',
      businessPhone: '9876543210',
      businessEmail: 'asha@example.com',
      businessLogo: 'https://example.com/logo.png',
      taxRegistrationDetails: 'GSTIN 123',
      profilePhoto: 'https://example.com/photo.png',
      profileSignature: 'data:image/png;base64,abc',
      receiptPrefix: 'AT',
      receiptCurrency: 'INR',
      receiptTaxRate: '18',
      receiptNumberFormat: '{PREFIX}/{YYYY}/{0000}',
      receiptFooterMessage: 'Thank you',
      defaultPaymentMethod: 'upi',
      receiptTimezone: 'Asia/Kolkata',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: 'en-IN',
    })
    expect(
      settingsToFormValues({ [SETTING_KEYS.profileType]: 'unknown' }).profileType,
    ).toBe('business')
  })

  it('builds a printable profile with defaults', () => {
    expect(businessProfileFromSettings({})).toEqual({
      name: '',
      address: '',
      phone: '',
      email: '',
      logo: '',
      website: '',
      taxRegistration: '',
      signature: '',
    })
    expect(
      businessProfileFromSettings({
        [SETTING_KEYS.businessName]: 'Asha Traders',
      }).name,
    ).toBe('Asha Traders')
    expect(
      businessProfileFromSettings({
        [SETTING_KEYS.profileType]: 'individual',
        [SETTING_KEYS.businessName]: 'Asha Rao',
        [SETTING_KEYS.profilePhoto]: 'https://example.com/photo.png',
        [SETTING_KEYS.profileSignature]: 'https://example.com/sign.png',
      }),
    ).toMatchObject({
      name: 'Asha Rao',
      logo: 'https://example.com/photo.png',
      signature: 'https://example.com/sign.png',
    })
  })
})
