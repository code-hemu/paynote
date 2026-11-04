import { DEFAULT_DB_PROFILE, type DbProfile } from './profile.ts'

let databaseProfile: DbProfile = DEFAULT_DB_PROFILE

export function getDatabaseProfile(): DbProfile {
  return databaseProfile
}

export function setDatabaseProfile(profile: DbProfile): void {
  databaseProfile = profile
}
