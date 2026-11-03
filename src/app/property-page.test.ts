import { afterEach, describe, expect, it } from '@guchho/test'

import type {
  ListResult,
  Property,
  PropertyCustomerSummary,
  PropertyDetail,
  PropertyInput,
  ReceiptSummary,
} from '../db/types.ts'
import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import {
  createPropertyPage,
  type PropertyPageController,
  type PropertyPageDeps,
} from './property-page.ts'

const controllers: PropertyPageController[] = []

function addField(
  document: FakeDocument,
  dataset: Record<string, string>,
): FakeElement {
  return document.add(new FakeElement(dataset))
}

function createFixture(): {
  document: FakeDocument
  view: FakeWindow
  elements: Record<string, FakeElement>
} {
  const view = new FakeWindow()
  view.location.hash = '#/properties'
  const document = new FakeDocument(view)
  const elements: Record<string, FakeElement> = {}

  const names = [
    'propertyList',
    'propertyAdd',
    'propertyFormPanel',
    'propertyFormTitle',
    'propertyForm',
    'propertySave',
    'propertyCancel',
    'propertyDetailPanel',
    'propertyDetailName',
    'propertyDetailMeta',
    'propertyDetailInfo',
    'propertyDetailStats',
    'propertyDetailCustomers',
    'propertyDetailCustomersEmpty',
    'propertyDetailReceipts',
    'propertyDetailEmpty',
    'propertyDetailEdit',
    'propertyDetailDelete',
    'propertyDetailClose',
    'propertyDeletePanel',
    'propertyDeleteMessage',
    'propertyDeleteConfirm',
    'propertyDeleteCancel',
    'propertyNotice',
    'propertySearch',
    'propertyType',
    'propertySort',
    'propertyStatus',
    'propertyTable',
    'propertyRows',
    'propertyEmpty',
    'propertyEmptyTitle',
    'propertyEmptyMessage',
    'propertyError',
    'propertyErrorMessage',
    'propertyRetry',
    'propertyPagination',
    'propertyPrevious',
    'propertyNext',
    'propertyPage',
    'propertyFormError',
  ] as const

  for (const key of names) {
    elements[key] = addField(document, { [key]: '' })
  }

  for (const field of [
    'name',
    'propertyType',
    'propertyNumber',
    'address',
    'description',
    'notes',
  ]) {
    elements[`input-${field}`] = addField(document, {
      propertyInput: field,
    })
    elements[`error-${field}`] = addField(document, {
      propertyFieldError: field,
    })
  }

  return { document, view, elements }
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'property-1',
    name: 'Main Shop',
    propertyType: 'shop',
    propertyNumber: 'S-1',
    address: 'Market Road',
    description: null,
    notes: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  }
}

function makeReceipt(property: Property): ReceiptSummary {
  return {
    id: 'receipt-1',
    receiptNumber: 'RCP-2026-0001',
    receiptType: 'rent',
    customerId: 'customer-1',
    customerName: 'Asha Rao',
    propertyId: property.id,
    propertyName: property.name,
    receiptDate: '2026-11-02',
    paymentPeriod: null,
    amountPaise: 100000,
    paymentMethod: 'cash',
    referenceNumber: null,
    description: null,
    notes: null,
    createdAt: '2026-11-02T10:00:00.000Z',
    updatedAt: '2026-11-02T10:00:00.000Z',
  }
}

function makeDetail(property: Property, receiptCount: number): PropertyDetail {
  const customers: PropertyCustomerSummary[] =
    receiptCount > 0
      ? [
          {
            id: 'customer-1',
            fullName: 'Asha Rao',
            receiptCount,
            totalPaise: receiptCount * 100000,
          },
        ]
      : []

  return {
    property,
    receiptCount,
    totalPaise: receiptCount * 100000,
    customers,
    recentReceipts: receiptCount > 0 ? [makeReceipt(property)] : [],
  }
}

function makeResult(property: Property | null): ListResult<Property> {
  return {
    items: property ? [property] : [],
    total: property ? 1 : 0,
    limit: 25,
    offset: 0,
  }
}

function createPage(
  fixture: ReturnType<typeof createFixture>,
  deps: PropertyPageDeps,
) {
  const page = createPropertyPage(fixture.document as unknown as Document, deps)
  controllers.push(page)
  return page
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the property page to update.')
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

afterEach(() => {
  for (const controller of controllers) {
    controller.destroy()
  }

  controllers.length = 0
})

describe('Property page', () => {
  it('warns and blocks deletion when receipts are linked', async () => {
    const fixture = createFixture()
    const property = makeProperty()
    const removed: string[] = []
    const page = createPage(fixture, {
      load: async () => makeResult(property),
      getDetail: async () => makeDetail(property, 3),
      remove: async (id) => {
        removed.push(id)
      },
    })

    await page.refresh()

    const actions = fixture.elements.propertyRows?.children[0]?.children[5]
    actions?.children[2]?.click()

    await waitFor(
      () =>
        fixture.elements.propertyDeleteMessage?.textContent.includes(
          '3 linked receipts',
        ) === true,
    )

    expect(fixture.elements.propertyDeletePanel?.hidden).toBe(false)
    expect(fixture.elements.propertyDeleteConfirm?.disabled).toBe(true)

    fixture.elements.propertyDeleteConfirm?.click()
    expect(removed).toEqual([])
  })

  it('opens a detail view with linked customers and receipts', async () => {
    const fixture = createFixture()
    const property = makeProperty()
    const page = createPage(fixture, {
      load: async () => makeResult(property),
      getDetail: async () => makeDetail(property, 1),
    })

    await page.refresh()

    const actions = fixture.elements.propertyRows?.children[0]?.children[5]
    actions?.children[0]?.click()

    await waitFor(() => fixture.elements.propertyDetailPanel?.hidden === false)

    expect(fixture.elements.propertyDetailName?.textContent).toBe('Main Shop')
    expect(fixture.elements.propertyDetailName?.focused).toBe(true)
    expect(
      fixture.elements.propertyDetailStats?.children.map(
        (stat) => stat.children[0]?.textContent,
      ),
    ).toEqual(['1', '₹1,000.00', '1'])
    expect(fixture.elements.propertyDetailCustomers?.children).toHaveLength(1)
    expect(
      fixture.elements.propertyDetailReceipts?.children[0]?.children.map(
        (cell) => cell.textContent,
      ),
    ).toEqual(['RCP-2026-0001', '02 Nov 2026', 'Asha Rao', '₹1,000.00'])
    expect(fixture.elements.propertyDetailEmpty?.hidden).toBe(true)
  })

  it('focuses the first field when the add form opens', () => {
    const fixture = createFixture()
    const page = createPage(fixture, {
      load: async () => makeResult(null),
    })

    page.openAdd()

    expect(fixture.elements['input-name']?.focused).toBe(true)
  })

  it('deletes a property after a safe confirmation', async () => {
    const fixture = createFixture()
    const property = makeProperty()
    const removed: string[] = []
    const page = createPage(fixture, {
      load: async () => makeResult(property),
      getDetail: async () => makeDetail(property, 0),
      remove: async (id) => {
        removed.push(id)
      },
    })

    await page.refresh()

    const actions = fixture.elements.propertyRows?.children[0]?.children[5]
    actions?.children[2]?.click()

    await waitFor(
      () =>
        fixture.elements.propertyDeleteMessage?.textContent.includes(
          'cannot be undone',
        ) === true,
    )

    fixture.elements.propertyDeleteConfirm?.click()
    await waitFor(() => removed.length === 1)

    expect(removed).toEqual([property.id])
    expect(fixture.elements.propertyNotice?.textContent).toBe(
      'Property deleted.',
    )
  })

  it('validates the form before creating a property', async () => {
    const fixture = createFixture()
    const created: PropertyInput[] = []
    createPage(fixture, {
      load: async () => makeResult(null),
      create: async (input) => {
        created.push(input)
        return makeProperty({ name: input.name })
      },
    })

    fixture.elements.propertyAdd?.click()
    fixture.elements['input-propertyType']!.value = ''
    fixture.elements.propertyForm?.dispatch('submit')

    expect(fixture.elements['error-name']?.textContent).toBe(
      'This field is required.',
    )
    expect(fixture.elements['error-propertyType']?.textContent).toBe(
      'Choose a property type.',
    )
    expect(created).toEqual([])

    fixture.elements['input-name']!.value = 'Lake House'
    fixture.elements['input-propertyType']!.value = 'house'
    fixture.elements.propertyForm?.dispatch('submit')

    await waitFor(() => created.length === 1)

    expect(created[0]).toMatchObject({
      name: 'Lake House',
      propertyType: 'house',
    })
    expect(fixture.elements.propertyFormPanel?.hidden).toBe(true)
  })
})
