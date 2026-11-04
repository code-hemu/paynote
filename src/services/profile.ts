import {
  getActiveProfile,
  setActiveProfile,
  type DbProfile,
} from '../db/profile.ts'

import { getDatabaseClient } from './database.ts'
import { refreshAppPreferences } from './preferences.ts'

let pendingSwitch: Promise<void> | null = null

export function switchProfile(profile: DbProfile): Promise<void> {
  if (pendingSwitch) {
    return pendingSwitch
  }

  const operation = performSwitch(profile).finally(() => {
    pendingSwitch = null
  })
  pendingSwitch = operation
  return operation
}

async function performSwitch(profile: DbProfile): Promise<void> {
  const previousProfile = getActiveProfile()
  const client = getDatabaseClient()

  if (
    profile === previousProfile &&
    client.getProfile() === profile
  ) {
    return
  }

  try {
    await client.switchProfile(profile)
    setActiveProfile(profile)
    await refreshAppPreferences()
  } catch (error) {
    try {
      await client.switchProfile(previousProfile)
      setActiveProfile(previousProfile)
      await refreshAppPreferences()
    } catch {
      setActiveProfile(previousProfile)
    }

    throw error
  }
}
