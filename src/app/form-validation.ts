import { PROPERTY_TYPES, type PropertyType } from '../db/types.ts'

export type FormErrors = Record<string, string>

export interface CustomerFormValues {
  fullName: string
  phone: string
  email: string
  address: string
  notes: string
}

export interface PropertyFormValues {
  name: string
  propertyType: string
  propertyNumber: string
  address: string
  description: string
  notes: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function requireValue(
  value: string,
  field: string,
  errors: FormErrors,
): string {
  const text = value.trim()

  if (!text) {
    errors[field] = 'This field is required.'
  }

  return text
}

function checkLength(
  value: string,
  field: string,
  label: string,
  maxLength: number,
  errors: FormErrors,
): string {
  const text = value.trim()

  if (text.length > maxLength) {
    errors[field] = `${label} must be ${maxLength} characters or fewer.`
  }

  return text
}

export function validateCustomerForm(values: CustomerFormValues): FormErrors {
  const errors: FormErrors = {}
  const fullName = requireValue(values.fullName, 'fullName', errors)

  if (fullName && fullName.length > 200) {
    errors.fullName = 'Customer name must be 200 characters or fewer.'
  }

  const phone = checkLength(values.phone, 'phone', 'Phone', 40, errors)
  const email = checkLength(values.email, 'email', 'Email', 200, errors)

  if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.'
  }

  checkLength(values.address, 'address', 'Address', 500, errors)
  checkLength(values.notes, 'notes', 'Notes', 2000, errors)

  if (phone.replace(/[^\d]/g, '').length === 0 && values.phone.trim() !== '') {
    errors.phone = 'Phone must contain digits.'
  }

  return errors
}

export function validatePropertyForm(values: PropertyFormValues): FormErrors {
  const errors: FormErrors = {}
  const name = requireValue(values.name, 'name', errors)

  if (name && name.length > 200) {
    errors.name = 'Property name must be 200 characters or fewer.'
  }

  const propertyType = values.propertyType.trim()

  if (!propertyType) {
    errors.propertyType = 'Choose a property type.'
  } else if (!(PROPERTY_TYPES as readonly string[]).includes(propertyType)) {
    errors.propertyType = 'Choose a valid property type.'
  }

  checkLength(
    values.propertyNumber,
    'propertyNumber',
    'Property number',
    100,
    errors,
  )
  checkLength(values.address, 'address', 'Address', 500, errors)
  checkLength(values.description, 'description', 'Description', 2000, errors)
  checkLength(values.notes, 'notes', 'Notes', 2000, errors)

  return errors
}

export function isPropertyType(value: string): value is PropertyType {
  return (PROPERTY_TYPES as readonly string[]).includes(value)
}

export function hasErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0
}
