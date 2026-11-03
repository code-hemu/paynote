import { afterEach, describe, expect, it } from '@guchho/test'

import type {
  ListResult,
  ReceiptListOptions,
  ReceiptSummary,
} from '../db/types.ts'
import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import {
  createReceiptList,
  type ReceiptListController,
  statusVariant,
} from './receipts.ts'

interface Fixture {
  document: FakeDocument
  view: FakeWindow
  list: FakeElement
  search: FakeElement
  type: FakeElement
  status: FakeElement
  customer: FakeElement
  property: FakeElement
  from: FakeElement
  to: FakeElement
  clear: FakeElement
  exportButton: FakeElement
  statusLine: FakeElement
  table: FakeElement
  rows: FakeElement
  empty: FakeElement
  emptyTitle: FakeElement
  emptyMessage: FakeElement
  errorCard: FakeElement
  errorText: FakeElement
  retry: FakeElement
  pagination: FakeElement
  previous: FakeElement
  next: FakeElement
  pageLabel: FakeElement
}

const controllers: ReceiptListController[] = []

function createFixture(): Fixture {
  const view = new FakeWindow()
  view.location.hash = '#/receipts'
  const document = new FakeDocument(view)

  return {
    document,
    view,
    list: document.add(new FakeElement({ receiptList: '' })),
    search: document.add(new FakeElement({ receiptSearch: '' })),
    type: document.add(new FakeElement({ receiptType: '' })),
    status: document.add(new FakeElement({ receiptStatus: '' })),
    customer: document.add(new FakeElement({ receiptCustomer: '' })),
    property: document.add(new FakeElement({ receiptProperty: '' })),
    from: document.add(new FakeElement({ receiptFrom: '' })),
    to: document.add(new FakeElement({ receiptTo: '' })),
    clear: document.add(new FakeElement({ receiptClearFilters: '' })),
    exportButton: document.add(new FakeElement({ receiptExport: '' })),
    statusLine: document.add(new FakeElement({ receiptListStatus: '' })),
    table: document.add(new FakeElement({ receiptTable: '' })),
    rows: document.add(new FakeElement({ receiptRows: '' })),
    empty: document.add(new FakeElement({ receiptEmpty: '' })),
    emptyTitle: document.add(new FakeElement({ receiptEmptyTitle: '' })),
    emptyMessage: document.add(new FakeElement({ receiptEmptyMessage: '' })),
    errorCard: document.add(new FakeElement({ receiptListError: '' })),
    errorText: document.add(new FakeElement({ receiptListErrorMessage: '' })),
    retry: document.add(new FakeElement({ receiptListRetry: '' })),
    pagination: document.add(new FakeElement({ receiptPagination: '' })),
    previous: document.add(new FakeElement({ receiptPrevious: '' })),
    next: document.add(new FakeElement({ receiptNext: '' })),
    pageLabel: document.add(new FakeElement({ receiptPage: '' })),
  }
}

function makeReceipt(index: number, overrides: Partial<ReceiptSummary> = {}): ReceiptSummary {
  return {
    id: `receipt-${index}`,
    receiptNumber: `PN-2026-000${index}`,
    receiptType: 'rent',
    customerId: 'customer-1',
    customerName: 'Asha Rao',
    propertyId: null,
    propertyName: null,
    receiptDate: '2026-11-03',
    paymentPeriod: null,
    amountPaise: 125000,
    paymentMethod: 'cash',
    status: 'issued',
    referenceNumber: null,
    description: null,
    notes: null,
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  }
}

function makeResult(
  items: ReceiptSummary[],
  total: number,
  options?: ReceiptListOptions,
): ListResult<ReceiptSummary> {
  return {
    items,
    total,
    limit: options?.limit ?? 25,
    offset: options?.offset ?? 0,
  }
}

function createList(
  fixture: Fixture,
  load: (options?: ReceiptListOptions) => Promise<ListResult<ReceiptSummary>>,
  config: Parameters<typeof createReceiptList>[1] = {},
) {
  const controller = createReceiptList(fixture.document as unknown as Document, {
    debounceMs: 0,
    load,
    pageSize: 25,
    ...config,
  })

  controllers.push(controller)
  return controller
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the receipt list to update.')
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

describe('Receipt list', () => {
  it('renders statuses, totals, and row actions', async () => {
    const fixture = createFixture()
    const viewed: string[] = []
    const controller = createList(
      fixture,
      async (options) =>
        makeResult(
          [
            makeReceipt(1, { status: 'paid' }),
            makeReceipt(2, { status: 'cancelled', propertyName: 'Main Shop' }),
          ],
          2,
          options,
        ),
      { onView: (receipt) => viewed.push(receipt.id) },
    )

    await controller.refresh()

    expect(fixture.statusLine.textContent).toBe('Showing 1-2 of 2 receipts.')
    expect(fixture.table.hidden).toBe(false)
    expect(fixture.empty.hidden).toBe(true)
    expect(fixture.rows.children).toHaveLength(2)
    expect(fixture.rows.children[0]?.children[0]?.textContent).toBe('PN-2026-0001')
    expect(fixture.rows.children[0]?.children[5]?.textContent).toContain('1,250.00')
    expect(fixture.rows.children[1]?.children[4]?.textContent).toBe('Rent')

    const actions = fixture.rows.children[0]?.children[7]
    const viewButton = actions?.children[0]
    viewButton?.click()

    expect(viewed).toEqual(['receipt-1'])
  })

  it('searches, filters, paginates, and clears filters', async () => {
    const fixture = createFixture()
    const calls: Array<ReceiptListOptions | undefined> = []
    createList(fixture, async (options) => {
      calls.push(options)
      return makeResult([makeReceipt(1)], 30, options)
    })

    await waitFor(() => calls.length >= 1)

    fixture.search.value = ' Asha '
    fixture.search.dispatch('input')
    await waitFor(() => calls[calls.length - 1]?.search === 'Asha')
    expect(calls[calls.length - 1]).toMatchObject({ search: 'Asha', offset: 0 })

    fixture.type.value = 'rent'
    fixture.type.dispatch('change')
    await waitFor(() => calls[calls.length - 1]?.receiptType === 'rent')
    expect(calls[calls.length - 1]).toMatchObject({ search: 'Asha', receiptType: 'rent' })

    fixture.next.click()
    await waitFor(() => calls[calls.length - 1]?.offset === 25)
    expect(calls[calls.length - 1]).toMatchObject({ offset: 25 })
    expect(fixture.pageLabel.textContent).toBe('Page 2 of 2')

    fixture.clear.click()
    await waitFor(() => calls[calls.length - 1]?.search === null && calls[calls.length - 1]?.offset === 0)
    expect(calls[calls.length - 1]).toMatchObject({
      search: null,
      receiptType: null,
      offset: 0,
    })
  })

  it('shows empty and error states', async () => {
    const fixture = createFixture()
    let fail = false
    const controller = createList(fixture, async (options) => {
      if (fail) {
        throw new Error('Database unavailable')
      }

      return makeResult([], 0, options)
    })

    await controller.refresh()
    expect(fixture.empty.hidden).toBe(false)
    expect(fixture.emptyTitle.textContent).toBe('No receipts yet')

    fixture.search.value = 'missing'
    fixture.search.dispatch('input')
    await waitFor(() => fixture.statusLine.textContent === 'No receipts match the current filters.')
    expect(fixture.emptyTitle.textContent).toBe('No matching receipts')

    fail = true
    await controller.refresh()
    expect(fixture.errorCard.hidden).toBe(false)
    expect(fixture.errorText.textContent).toBe('Database unavailable')
    expect(fixture.statusLine.textContent).toBe('Receipts could not be loaded.')
  })

  it('maps statuses to badge variants', () => {
    expect(statusVariant('paid')).toBe('success')
    expect(statusVariant('cancelled')).toBe('danger')
    expect(statusVariant('draft')).toBe('neutral')
    expect(statusVariant('issued')).toBe('brand')
  })
})
