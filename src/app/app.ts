import {
  getAppInfo,
  getStorageHealth,
  STORAGE_LOCATION,
} from '../services/storage.ts'
import type { AppInfo, StorageHealth } from '../types/system.ts'
import { formatBytes, formatSchemaVersion } from '../utils/format.ts'

import { findNavItem, normalizePath } from './navigation.ts'

const REFRESH_INTERVAL_MS = 30_000
const LOW_SPACE_RATIO = 0.85

export interface AppStorage {
  getAppInfo(): AppInfo
  getStorageHealth(): Promise<StorageHealth>
}

const defaultStorage: AppStorage = {
  getAppInfo,
  getStorageHealth,
}

export interface PayNoteApp {
  navigate(path: string): void
  refreshStatus(): Promise<void>
  destroy(): void
}

export function createApp(
  doc: Document = document,
  storage: AppStorage = defaultStorage,
): PayNoteApp {
  const view = doc.defaultView ?? window
  const pages = [...doc.querySelectorAll<HTMLElement>('[data-route]')]
  const navLinks = [...doc.querySelectorAll<HTMLAnchorElement>('[data-nav]')]
  const sectionTitle = doc.querySelector<HTMLElement>('[data-section-title]')
  const storageStatus = doc.querySelector<HTMLElement>('[data-storage-status]')
  const versionBadge = doc.querySelector<HTMLElement>('[data-app-version]')
  const storageBadge = doc.querySelector<HTMLElement>('[data-storage-badge]')
  const schemaBadge = doc.querySelector<HTMLElement>('[data-schema-version]')
  const errorPanel = doc.querySelector<HTMLElement>('[data-dashboard-error]')
  const errorMessage = doc.querySelector<HTMLElement>('[data-error-message]')
  const retryButton = doc.querySelector<HTMLButtonElement>('[data-retry]')
  const storageWarning = doc.querySelector<HTMLElement>('[data-storage-warning]')

  const info = storage.getAppInfo()
  let loaded = false

  setField(doc, 'app-name', info.appName)
  setField(doc, 'app-version', `v${info.appVersion}`)
  setField(doc, 'platform', info.platform)
  setField(doc, 'storage-type', info.storageType)
  setField(doc, 'storage-engine', info.storageType)
  setField(doc, 'device-platform', info.platform)
  setField(doc, 'database-path', STORAGE_LOCATION)

  if (versionBadge) {
    versionBadge.textContent = `v${info.appVersion}`
  }

  function renderPath(value: string) {
    const path = normalizePath(value)
    const page =
      pages.find((element) => element.dataset.route === path) ??
      pages.find((element) => element.dataset.routeAlias === path) ??
      pages.find((element) => element.dataset.route === '*')

    for (const element of pages) {
      element.hidden = element !== page
    }

    for (const link of navLinks) {
      const linkPath = normalizePath(link.getAttribute('href') ?? '')

      if (linkPath === path) {
        link.setAttribute('aria-current', 'page')
      } else {
        link.removeAttribute('aria-current')
      }
    }

    const navItem = findNavItem(path)
    const title = navItem?.label ?? 'Page not found'

    if (sectionTitle) {
      sectionTitle.textContent = title
    }

    doc.title = path === '/' ? 'PayNote' : `${title} · PayNote`
  }

  function setStatus(
    text: string,
    variant: 'loading' | 'success' | 'danger',
    schemaVersion?: number,
  ) {
    if (!storageStatus) {
      return
    }

    storageStatus.className = `status status-${variant}`
    storageStatus.replaceChildren()

    if (variant === 'loading') {
      const spinner = doc.createElement('span')
      spinner.className = 'spinner'
      spinner.setAttribute('aria-hidden', 'true')
      storageStatus.append(spinner)
    } else {
      storageStatus.append(createIcon(doc, variant === 'success' ? 'check' : 'alert'))
    }

    storageStatus.append(text)

    if (variant === 'success' && typeof schemaVersion === 'number') {
      const schema = doc.createElement('span')
      schema.className = 'status-schema'
      schema.textContent = `· schema ${formatSchemaVersion(schemaVersion)}`
      storageStatus.append(schema)
    }
  }

  function renderStorageWarning(health: StorageHealth) {
    if (!storageWarning) {
      return
    }

    const quota = health.quotaBytes

    if (!health.ok || typeof quota !== 'number' || quota <= 0) {
      storageWarning.hidden = true
      return
    }

    const ratio = health.usageBytes / quota

    if (ratio < LOW_SPACE_RATIO) {
      storageWarning.hidden = true
      return
    }

    storageWarning.textContent = `Storage is ${Math.round(ratio * 100)}% full. Export a backup and remove old receipts to free space.`
    storageWarning.hidden = false
  }

  function renderHealth(health: StorageHealth) {
    loaded = true

    if (health.ok) {
      setStatus('Storage ready', 'success', health.schemaVersion)

      if (errorPanel) {
        errorPanel.hidden = true
      }
    } else {
      setStatus('Storage unavailable', 'danger')

      if (errorPanel) {
        errorPanel.hidden = false
      }

      if (errorMessage) {
        errorMessage.textContent = health.detail
      }
    }

    setField(doc, 'record-count', String(health.recordCount))
    setField(doc, 'usage-bytes', formatBytes(health.usageBytes))
    setField(
      doc,
      'quota-bytes',
      typeof health.quotaBytes === 'number' ? formatBytes(health.quotaBytes) : 'Not reported',
    )

    if (storageBadge) {
      storageBadge.textContent = health.ok ? 'Available' : 'Unavailable'
      storageBadge.className = `badge badge-${health.ok ? 'success' : 'danger'}`
    }

    if (schemaBadge) {
      schemaBadge.textContent = formatSchemaVersion(health.schemaVersion)
    }

    renderStorageWarning(health)
  }

  function renderError(error: unknown) {
    loaded = true
    setStatus('Storage unavailable', 'danger')

    if (errorPanel) {
      errorPanel.hidden = false
    }

    if (errorMessage) {
      errorMessage.textContent =
        error instanceof Error ? error.message : 'The workspace could not be loaded.'
    }

    if (storageBadge) {
      storageBadge.textContent = 'Unavailable'
      storageBadge.className = 'badge badge-danger'
    }

    if (storageWarning) {
      storageWarning.hidden = true
    }
  }

  async function refreshStatus() {
    if (!loaded) {
      setStatus('Checking storage', 'loading')
    }

    try {
      renderHealth(await storage.getStorageHealth())
    } catch (error) {
      renderError(error)
    }
  }

  function handleHashChange() {
    renderPath(view.location.hash)
  }

  function handleVisibilityChange() {
    if (doc.visibilityState === 'visible') {
      void refreshStatus()
    }
  }

  function navigate(path: string) {
    const nextPath = normalizePath(path)

    if (normalizePath(view.location.hash) !== nextPath) {
      view.location.hash = nextPath
    }

    renderPath(nextPath)
  }

  view.addEventListener('hashchange', handleHashChange)
  doc.addEventListener('visibilitychange', handleVisibilityChange)
  retryButton?.addEventListener('click', () => {
    void refreshStatus()
  })

  const refreshTimer = view.setInterval(() => {
    void refreshStatus()
  }, REFRESH_INTERVAL_MS)

  renderPath(view.location.hash || '/')
  void refreshStatus()

  return {
    navigate,
    refreshStatus,
    destroy() {
      view.clearInterval(refreshTimer)
      view.removeEventListener('hashchange', handleHashChange)
      doc.removeEventListener('visibilitychange', handleVisibilityChange)
    },
  }
}

function setField(doc: Document, name: string, value: string) {
  for (const element of doc.querySelectorAll<HTMLElement>(`[data-field="${name}"]`)) {
    element.textContent = value
  }
}

function createIcon(doc: Document, name: 'check' | 'alert') {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('aria-hidden', 'true')

  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#icon-${name}`)
  svg.append(use)

  return svg
}
