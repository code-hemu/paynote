import { afterEach, describe, expect, it } from '@guchho/test'

import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import { createApp, type AppStorage, type PayNoteApp } from './app.ts'
import { navigation } from './navigation.ts'

interface Fixture {
  document: FakeDocument
  view: FakeWindow
  dashboard: FakeElement
  customers: FakeElement
  notFound: FakeElement
  sectionTitle: FakeElement
  storageStatus: FakeElement
  storageBadge: FakeElement
  storageWarning: FakeElement
  fields: Map<string, FakeElement>
  navLinks: FakeElement[]
}

const FIELD_NAMES = [
  'app-name',
  'app-version',
  'platform',
  'storage-type',
  'storage-engine',
  'device-platform',
  'database-path',
  'record-count',
  'usage-bytes',
  'quota-bytes',
]

let app: PayNoteApp | undefined

function createFixture(): Fixture {
  const view = new FakeWindow()
  const document = new FakeDocument(view)
  const dashboard = document.add(new FakeElement({ route: '/' }, { id: 'page-dashboard' }))
  const customers = document.add(new FakeElement({ route: '/customers' }, { id: 'page-customers' }))
  const notFound = document.add(new FakeElement({ route: '*' }, { id: 'page-not-found' }))
  const sectionTitle = document.add(new FakeElement({ sectionTitle: '' }))
  const storageStatus = document.add(new FakeElement({ storageStatus: '' }))
  const storageBadge = document.add(new FakeElement({ storageBadge: '' }))
  const storageWarning = document.add(new FakeElement({ storageWarning: '' }))

  document.add(new FakeElement({ appVersion: '' }))
  document.add(new FakeElement({ schemaVersion: '' }))
  document.add(new FakeElement({ dashboardError: '' }))
  document.add(new FakeElement({ errorMessage: '' }))
  document.add(new FakeElement({ retry: '' }))

  const fields = new Map(
    FIELD_NAMES.map((name) => [name, document.add(new FakeElement({ field: name }))]),
  )

  const navLinks = navigation.map((item) => {
    const link = new FakeElement({ nav: '' }, { href: `#${item.path}` })
    link.textContent = item.label
    document.add(link)
    return link
  })

  customers.textContent = 'Customer records'
  notFound.textContent = 'Page not found'

  return {
    document,
    view,
    dashboard,
    customers,
    notFound,
    sectionTitle,
    storageStatus,
    storageBadge,
    storageWarning,
    fields,
    navLinks,
  }
}

function createStorage(): AppStorage {
  return {
    getAppInfo: () => ({
      appName: 'PayNote',
      appVersion: '0.1.0',
      platform: 'Test browser',
      storageType: 'SQLite WASM + OPFS',
      schemaVersion: 1,
    }),
    getStorageHealth: async () => ({
      ok: true,
      schemaVersion: 1,
      usageBytes: 4096,
      quotaBytes: 8192,
      recordCount: 0,
      persistent: true,
      databasePath: '/paynote.sqlite3',
      detail: 'Records are saved in the browser private file system on this device.',
    }),
  }
}

function mountApp(fixture = createFixture(), storage = createStorage()) {
  app = createApp(fixture.document as unknown as Document, storage)

  return { app, fixture }
}

afterEach(() => {
  app?.destroy()
  app = undefined
})

describe('App shell', () => {
  it('renders the dashboard and all primary destinations', async () => {
    const { app: currentApp, fixture } = mountApp()

    await currentApp.refreshStatus()

    expect(fixture.dashboard.hidden).toBe(false)
    expect(fixture.fields.get('app-name')?.textContent).toBe('PayNote')

    for (const item of navigation) {
      const link = fixture.navLinks.find((element) => element.getAttribute('href') === `#${item.path}`)

      expect(link?.textContent).toBe(item.label)
    }

    expect(fixture.storageStatus.textContent).toContain('Storage ready')
    expect(fixture.storageBadge.textContent).toBe('Available')
  })

  it('navigates to the customer module', () => {
    const { app: currentApp, fixture } = mountApp()

    currentApp.navigate('/customers')

    expect(fixture.customers.hidden).toBe(false)
    expect(fixture.dashboard.hidden).toBe(true)
    expect(fixture.sectionTitle.textContent).toBe('Customers')
    expect(fixture.document.title).toBe('Customers · PayNote')
    expect(fixture.customers.textContent).toContain('Customer records')
    expect(
      fixture.navLinks.find((element) => element.getAttribute('href') === '#/customers')?.getAttribute('aria-current'),
    ).toBe('page')
  })

  it('warns when storage is nearly full', async () => {
    const fixture = createFixture()
    const storage = createStorage()
    storage.getStorageHealth = async () => ({
      ...(await createStorage().getStorageHealth()),
      usageBytes: 9000,
      quotaBytes: 10000,
    })

    const { app: currentApp } = mountApp(fixture, storage)

    await currentApp.refreshStatus()

    expect(fixture.storageWarning.hidden).toBe(false)
    expect(fixture.storageWarning.textContent).toContain('90% full')
  })

  it('hides the storage warning when space is available', async () => {
    const fixture = createFixture()
    const storage = createStorage()
    storage.getStorageHealth = async () => ({
      ...(await createStorage().getStorageHealth()),
      usageBytes: 1000,
      quotaBytes: 10000,
    })

    const { app: currentApp } = mountApp(fixture, storage)

    await currentApp.refreshStatus()

    expect(fixture.storageWarning.hidden).toBe(true)
  })

  it('shows the not-found page for an unknown route', () => {
    const { app: currentApp, fixture } = mountApp()

    currentApp.navigate('/missing')

    expect(fixture.notFound.hidden).toBe(false)
    expect(fixture.dashboard.hidden).toBe(true)
    expect(fixture.sectionTitle.textContent).toBe('Page not found')
    expect(fixture.document.title).toBe('Page not found · PayNote')
  })
})
