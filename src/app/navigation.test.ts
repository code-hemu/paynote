import { describe, expect, it } from '@guchho/test'

import { findNavItem, navigation, normalizePath } from './navigation.ts'

describe('normalizePath', () => {
  it('normalizes hash and plain paths', () => {
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('#/')).toBe('/')
    expect(normalizePath('#/customers')).toBe('/customers')
    expect(normalizePath('customers')).toBe('/customers')
    expect(normalizePath('/receipts/')).toBe('/receipts')
  })
})

describe('navigation', () => {
  it('contains every primary destination', () => {
    expect(navigation.map((item) => item.label)).toEqual([
      'Dashboard',
      'New Receipt',
      'Receipt History',
      'Customers',
      'Properties',
      'Reports',
      'Backup & Restore',
      'Settings',
    ])
  })

  it('finds navigation items by path', () => {
    expect(findNavItem('#/reports')?.label).toBe('Reports')
    expect(findNavItem('/missing')).toBeUndefined()
  })
})
