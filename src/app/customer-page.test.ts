import { afterEach, describe, expect, it } from '@guchho/test'

import type {
  Customer,
  CustomerDetail,
  CustomerInput,
  ListResult,
  ReceiptSummary,
} from '../db/types.ts'
import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import {
  createCustomerPage,
  type CustomerPageController,
  type CustomerPageDeps,
} from './customer-page.ts'

const controllers: CustomerPageController[] = []

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
  view.location.hash = '#/customers'
  const document = new FakeDocument(view)
  const elements: Record<string, FakeElement> = {}

  const names = [
    ['customerList', 'customerList'],
    ['customerAdd', 'customerAdd'],
    ['customerFormPanel', 'customerFormPanel'],
    ['customerFormTitle', 'customerFormTitle'],
    ['customerForm', 'customerForm'],
    ['customerSave', 'customerSave'],
    ['customerCancel', 'customerCancel'],
    ['customerDetailPanel', 'customerDetailPanel'],
    ['customerDetailName', 'customerDetailName'],
    ['customerDetailMeta', 'customerDetailMeta'],
    ['customerDetailInfo', 'customerDetailInfo'],
    ['customerDetailStats', 'customerDetailStats'],
    ['customerDetailReceipts', 'customerDetailReceipts'],
    ['customerDetailEmpty', 'customerDetailEmpty'],
    ['customerDetailEdit', 'customerDetailEdit'],
    ['customerDetailDelete', 'customerDetailDelete'],
    ['customerDetailClose', 'customerDetailClose'],
    ['customerDeletePanel', 'customerDeletePanel'],
    ['customerDeleteMessage', 'customerDeleteMessage'],
    ['customerDeleteConfirm', 'customerDeleteConfirm'],
    ['customerDeleteCancel', 'customerDeleteCancel'],
    ['customerNotice', 'customerNotice'],
    ['customerSearch', 'customerSearch'],
    ['customerSort', 'customerSort'],
    ['customerStatus', 'customerStatus'],
    ['customerTable', 'customerTable'],
    ['customerRows', 'customerRows'],
    ['customerEmpty', 'customerEmpty'],
    ['customerEmptyTitle', 'customerEmptyTitle'],
    ['customerEmptyMessage', 'customerEmptyMessage'],
    ['customerError', 'customerError'],
    ['customerErrorMessage', 'customerErrorMessage'],
    ['customerRetry', 'customerRetry'],
    ['customerPagination', 'customerPagination'],
    ['customerPrevious', 'customerPrevious'],
    ['customerNext', 'customerNext'],
    ['customerPage', 'customerPage'],
    ['customerFormError', 'customerFormError'],
  ] as const

  for (const [key, datasetKey] of names) {
    elements[key] = addField(document, { [datasetKey]: '' })
  }

  for (const field of ['fullName', 'phone', 'email', 'address', 'notes']) {
    elements[`input-${field}`] = addField(document, {
      customerInput: field,
    })
    elements[`error-${field}`] = addField(document, {
      customerFieldError: field,
    })
  }

  return { document, view, elements }
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    fullName: 'Asha Rao',
    phone: '9876543210',
    email: 'asha@example.com',
    address: null,
    notes: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  }
}

function makeReceipt(customer: Customer): ReceiptSummary {
  return {
    id: 'receipt-1',
    receiptNumber: 'RCP-2026-0001',
    receiptType: 'rent',
    customerId: customer.id,
    customerName: customer.fullName,
    propertyId: null,
    propertyName: null,
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

function makeDetail(
  customer: Customer,
  receiptCount: number,
): CustomerDetail {
  return {
    customer,
    receiptCount,
    totalPaise: receiptCount * 100000,
    recentReceipts:
      receiptCount > 0 ? [makeReceipt(customer)] : [],
  }
}

function makeResult(customer: Customer | null): ListResult<Customer> {
  return {
    items: customer ? [customer] : [],
    total: customer ? 1 : 0,
    limit: 25,
    offset: 0,
  }
}

function createPage(
  fixture: ReturnType<typeof createFixture>,
  deps: CustomerPageDeps,
) {
  const page = createCustomerPage(fixture.document as unknown as Document, deps)
  controllers.push(page)
  return page
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the customer page to update.')
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

describe('Customer page', () => {
  it('warns and blocks deletion when receipts are linked', async () => {
    const fixture = createFixture()
    const customer = makeCustomer()
    const removed: string[] = []
    const page = createPage(fixture, {
      load: async () => makeResult(customer),
      getDetail: async () => makeDetail(customer, 2),
      remove: async (id) => {
        removed.push(id)
      },
    })

    await page.refresh()

    const actions = fixture.elements.customerRows?.children[0]?.children[5]
    actions?.children[2]?.click()

    await waitFor(
      () =>
        fixture.elements.customerDeleteMessage?.textContent.includes(
          '2 linked receipts',
        ) === true,
    )

    expect(fixture.elements.customerDeletePanel?.hidden).toBe(false)
    expect(fixture.elements.customerDeleteConfirm?.disabled).toBe(true)

    fixture.elements.customerDeleteConfirm?.click()
    expect(removed).toEqual([])
  })

  it('deletes a customer after a safe confirmation', async () => {
    const fixture = createFixture()
    const customer = makeCustomer()
    const removed: string[] = []
    const page = createPage(fixture, {
      load: async () => makeResult(customer),
      getDetail: async () => makeDetail(customer, 0),
      remove: async (id) => {
        removed.push(id)
      },
    })

    await page.refresh()

    const actions = fixture.elements.customerRows?.children[0]?.children[5]
    actions?.children[2]?.click()

    await waitFor(
      () =>
        fixture.elements.customerDeleteMessage?.textContent.includes(
          'cannot be undone',
        ) === true,
    )

    expect(fixture.elements.customerDeleteConfirm?.disabled).toBe(false)

    fixture.elements.customerDeleteConfirm?.click()

    await waitFor(() => removed.length === 1)

    expect(removed).toEqual([customer.id])
    expect(fixture.elements.customerNotice?.textContent).toBe(
      'Customer deleted.',
    )
    expect(fixture.elements.customerDeletePanel?.hidden).toBe(true)
  })

  it('validates the form before creating a customer', async () => {
    const fixture = createFixture()
    const created: CustomerInput[] = []
    createPage(fixture, {
      load: async () => makeResult(null),
      nameTaken: async () => false,
      create: async (input) => {
        created.push(input)
        return makeCustomer({ fullName: input.fullName })
      },
    })

    fixture.elements.customerAdd?.click()
    fixture.elements.customerForm?.dispatch('submit')

    expect(fixture.elements['error-fullName']?.textContent).toBe(
      'This field is required.',
    )
    expect(created).toEqual([])

    fixture.elements['input-fullName']!.value = 'Asha Rao'
    fixture.elements.customerForm?.dispatch('submit')

    await waitFor(() => created.length === 1)

    expect(created[0]?.fullName).toBe('Asha Rao')
    expect(fixture.elements.customerFormPanel?.hidden).toBe(true)
  })

  it('opens a detail view with totals and linked receipts', async () => {
    const fixture = createFixture()
    const customer = makeCustomer()
    const page = createPage(fixture, {
      load: async () => makeResult(customer),
      getDetail: async () => makeDetail(customer, 1),
    })

    await page.refresh()

    const actions = fixture.elements.customerRows?.children[0]?.children[5]
    actions?.children[0]?.click()

    await waitFor(() => fixture.elements.customerDetailPanel?.hidden === false)

    expect(fixture.elements.customerDetailName?.textContent).toBe('Asha Rao')
    expect(fixture.elements.customerDetailName?.focused).toBe(true)
    expect(
      fixture.elements.customerDetailStats?.children.map(
        (stat) => stat.children[0]?.textContent,
      ),
    ).toEqual(['1', '₹1,000.00'])
    expect(fixture.elements.customerDetailReceipts?.children).toHaveLength(1)
    expect(
      fixture.elements.customerDetailReceipts?.children[0]?.children.map(
        (cell) => cell.textContent,
      ),
    ).toEqual(['RCP-2026-0001', '02 Nov 2026', 'Rent', '₹1,000.00'])
    expect(fixture.elements.customerDetailEmpty?.hidden).toBe(true)
  })

  it('focuses the first field when the add form opens', () => {
    const fixture = createFixture()
    const page = createPage(fixture, {
      load: async () => makeResult(null),
    })

    page.openAdd()

    expect(fixture.elements['input-fullName']?.focused).toBe(true)
  })

  it('reports duplicate names on the name field', async () => {
    const fixture = createFixture()
    let created = 0
    createPage(fixture, {
      load: async () => makeResult(null),
      nameTaken: async () => true,
      create: async () => {
        created += 1
        return makeCustomer()
      },
    })

    fixture.elements.customerAdd?.click()
    fixture.elements['input-fullName']!.value = 'Asha Rao'
    fixture.elements.customerForm?.dispatch('submit')

    await waitFor(
      () =>
        fixture.elements['error-fullName']?.textContent.includes(
          'already exists',
        ) === true,
    )

    expect(created).toBe(0)
  })
})
