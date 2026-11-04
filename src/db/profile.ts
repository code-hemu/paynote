export const DB_PROFILES = ['business', 'individual'] as const

export type DbProfile = (typeof DB_PROFILES)[number]

export const DEFAULT_DB_PROFILE: DbProfile = 'business'

export const DB_PROFILE_STORAGE_KEY = 'paynote.profile'

export function isDbProfile(value: unknown): value is DbProfile {
  return (
    typeof value === 'string' &&
    (DB_PROFILES as readonly string[]).includes(value)
  )
}

export function getActiveProfile(): DbProfile {
  try {
    const stored = globalThis.localStorage?.getItem(DB_PROFILE_STORAGE_KEY)

    if (isDbProfile(stored)) {
      return stored
    }
  } catch {
    return DEFAULT_DB_PROFILE
  }

  return DEFAULT_DB_PROFILE
}

export function setActiveProfile(profile: DbProfile): void {
  try {
    globalThis.localStorage?.setItem(DB_PROFILE_STORAGE_KEY, profile)
  } catch {
    return
  }
}
