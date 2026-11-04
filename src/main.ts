import { createApp } from './app/app.ts'
import { createBackupPage } from './app/backup.ts'
import { createCustomerPage } from './app/customer-page.ts'
import { createDashboard } from './app/dashboard.ts'
import { createPinGate } from './app/pin-gate.ts'
import { createPropertyPage } from './app/property-page.ts'
import { createReceiptPage } from './app/receipt-page.ts'
import { createReports } from './app/reports.ts'
import { applyTheme, createSettingsPage, readTheme } from './app/settings.ts'
import { installGlobalErrorHandling } from './app/error-handling.ts'
import { openSharedReceipt } from './app/shared-receipt.ts'
import { refreshAppPreferences } from './services/preferences.ts'
import { readReceiptShareToken } from './services/receipt-share.ts'

applyTheme(document, readTheme(document))
installGlobalErrorHandling(document)
registerServiceWorker()

let bootstrapped = false
const shareToken = readReceiptShareToken(location.href)

if (shareToken) {
  void openSharedReceipt(document, shareToken)
} else {
  createPinGate(document, {
    onUnlocked: () => {
      bootstrapWorkspace()
    },
  })
}

function bootstrapWorkspace() {
  if (bootstrapped) {
    return
  }

  bootstrapped = true
  void refreshAppPreferences().catch(() => {})

  createApp()
  createDashboard(document)
  createReceiptPage(document)
  createCustomerPage(document)
  createPropertyPage(document)
  createReports(document)
  createBackupPage(document)
  createSettingsPage(document)
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.port === '5173') {
    return
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is optional; the app works without it.
    })
  })
}
