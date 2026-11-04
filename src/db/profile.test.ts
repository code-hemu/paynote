import { afterEach, describe, expect, it } from '@guchho/test'

import { databaseConfigFor } from './constants.ts'
import {
  DB_PROFILE_STORAGE_KEY,
  DEFAULT_DB_PROFILE,
  getActiveProfile,
  isDbProfile,
  setActiveProfile,
} from './profile.ts'

let restoreStorage: (() => void) | null = null

function installStorage(initial: Record<string, string> = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map(Object.entries(initial))

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) {
        return values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        values.set(key, value)
      },
    },
  })

  restoreStorage = () => {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', previous)
      return
    }

    delete (globalThis as { localStorage?: unknown }).localStorage
  }
}

afterEach(() => {
  restoreStorage?.()
  restoreStorage = null
})

describe('database profile', () => {
  it('validates profile names', () => {
    expect(isDbProfile('business')).toBe(true)
    expect(isDbProfile('individual')).toBe(true)
    expect(isDbProfile('other')).toBe(false)
    expect(isDbProfile(undefined)).toBe(false)
  })

  it('defaults to the business database when nothing is stored', () => {
    installStorage()

    expect(getActiveProfile()).toBe(DEFAULT_DB_PROFILE)
    expect(getActiveProfile()).toBe('business')
  })

  it('persists the active profile', () => {
    installStorage()

    setActiveProfile('individual')

    expect(getActiveProfile()).toBe('individual')
    expect(globalThis.localStorage.getItem(DB_PROFILE_STORAGE_KEY)).toBe(
      'individual',
    )
  })

  it('ignores invalid stored profiles', () => {
    installStorage({ [DB_PROFILE_STORAGE_KEY]: 'other' })

    expect(getActiveProfile()).toBe('business')
  })

  it('uses one shared database for both profiles', () => {
    const business = databaseConfigFor('business')
    const individual = databaseConfigFor('individual')

    expect(business.file).toBe('/paynote.sqlite3')
    expect(individual.file).toBe(business.file)
    expect(individual.directory).toBe(business.directory)
    expect(individual.vfs).toBe(business.vfs)
    expect(individual.lock).toBe(business.lock)
    expect(individual.label).toBe('Individual')
  })
})
