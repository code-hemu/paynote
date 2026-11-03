import { describe, expect, it } from '@guchho/test'

import {
  hasErrors,
  validateCustomerForm,
  validatePropertyForm,
} from './form-validation.ts'

const validCustomer = {
  fullName: 'Asha Rao',
  phone: '9876543210',
  email: 'asha@example.com',
  address: '12 Lake Road',
  notes: '',
}

const validProperty = {
  name: 'Main Shop',
  propertyType: 'shop',
  propertyNumber: 'S-1',
  address: 'Market Road',
  description: '',
  notes: '',
}

describe('customer form validation', () => {
  it('accepts valid values', () => {
    expect(hasErrors(validateCustomerForm(validCustomer))).toBe(false)
  })

  it('requires a name', () => {
    const errors = validateCustomerForm({ ...validCustomer, fullName: '   ' })

    expect(errors.fullName).toBe('This field is required.')
  })

  it('rejects invalid email and phone values', () => {
    const errors = validateCustomerForm({
      ...validCustomer,
      email: 'not-an-email',
      phone: 'call me',
    })

    expect(errors.email).toBe('Enter a valid email address.')
    expect(errors.phone).toBe('Phone must contain digits.')
  })

  it('rejects values that exceed the stored limits', () => {
    const errors = validateCustomerForm({
      ...validCustomer,
      fullName: 'A'.repeat(201),
      address: 'B'.repeat(501),
      notes: 'C'.repeat(2001),
    })

    expect(errors.fullName).toBe(
      'Customer name must be 200 characters or fewer.',
    )
    expect(errors.address).toBe('Address must be 500 characters or fewer.')
    expect(errors.notes).toBe('Notes must be 2000 characters or fewer.')
  })
})

describe('property form validation', () => {
  it('accepts valid values', () => {
    expect(hasErrors(validatePropertyForm(validProperty))).toBe(false)
  })

  it('requires a name and a valid type', () => {
    const empty = validatePropertyForm({
      ...validProperty,
      name: ' ',
      propertyType: '',
    })
    expect(empty.name).toBe('This field is required.')
    expect(empty.propertyType).toBe('Choose a property type.')

    const invalid = validatePropertyForm({
      ...validProperty,
      propertyType: 'castle',
    })
    expect(invalid.propertyType).toBe('Choose a valid property type.')
  })

  it('rejects values that exceed the stored limits', () => {
    const errors = validatePropertyForm({
      ...validProperty,
      name: 'A'.repeat(201),
      propertyNumber: 'B'.repeat(101),
      description: 'C'.repeat(2001),
    })

    expect(errors.name).toBe('Property name must be 200 characters or fewer.')
    expect(errors.propertyNumber).toBe(
      'Property number must be 100 characters or fewer.',
    )
    expect(errors.description).toBe(
      'Description must be 2000 characters or fewer.',
    )
  })
})
