import { afterEach, describe, expect, it } from '@guchho/test'

import type {
  Customer,
  CustomerListOptions,
  ListResult,
} from '../db/types.ts'
import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import {
  createCustomerList,
  type CustomerListController,
} from './customers.ts'

interface Fixture {
  document: FakeDocument
  view: FakeWindow
  list: FakeElement
  search: FakeElement
  sort: FakeElement
  status: FakeElement
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

const controllers: CustomerListController[] = []

function createFixture(): Fixture {
  const view = new FakeWindow()
  view.location.hash = '#/'

  const document = new FakeDocument(view)

  return {
    document,
    view,
    list: document.add(new FakeElement({ customerList: '' })),
    search: document.add(new FakeElement({ customerSearch: '' })),
    sort: document.add(new FakeElement({ customerSort: '' })),
    status: document.add(new FakeElement({ customerStatus: '' })),
    table: document.add(new FakeElement({ customerTable: '' })),
    rows: document.add(new FakeElement({ customerRows: '' })),
    empty: document.add(new FakeElement({ customerEmpty: '' })),
    emptyTitle: document.add(new FakeElement({ customerEmptyTitle: '' })),
    emptyMessage: document.add(new FakeElement({ customerEmptyMessage: '' })),
    errorCard: document.add(new FakeElement({ customerError: '' })),
    errorText: document.add(new FakeElement({ customerErrorMessage: '' })),
    retry: document.add(new FakeElement({ customerRetry: '' })),
    pagination: document.add(new FakeElement({ customerPagination: '' })),
    previous: document.add(new FakeElement({ customerPrevious: '' })),
    next: document.add(new FakeElement({ customerNext: '' })),
    pageLabel: document.add(new FakeElement({ customerPage: '' })),
  }
}

function makeCustomer(index: number, overrides: Partial<Customer> = {}): Customer {
  return {
    id: `customer-${index}`,
    fullName: `Customer ${index}`,
    phone: '',
    email: null,
    address: null,
    notes: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  }
}

function makeResult(
  items: Customer[],
  total: number,
  options?: CustomerListOptions,
): ListResult<Customer> {
  return {
    items,
    total,
    limit: options?.limit ?? 25,
    offset: options?.offset ?? 0,
  }
}

function createList(
  fixture: Fixture,
  load: (options?: CustomerListOptions) => Promise<ListResult<Customer>>,
) {
  const controller = createCustomerList(
    fixture.document as unknown as Document,
    {
      debounceMs: 0,
      load,
      pageSize: 25,
    },
  )

  controllers.push(controller)
  return controller
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the customer list to update.')
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

describe('Customer list', () => {
  it('renders customers and reports the total', async () => {
    const fixture = createFixture()
    const calls: Array<CustomerListOptions | undefined> = []
    const customers = [
      makeCustomer(1, {
        fullName: 'Asha Rao',
        phone: '9876543210',
        email: 'asha@example.com',
      }),
      makeCustomer(2, { fullName: 'Zara Khan', address: '12 Lake Road' }),
    ]
    const controller = createList(fixture, async (options) => {
      calls.push(options)
      return makeResult(customers, 2, options)
    })

    await controller.refresh()

    expect(calls[0]).toMatchObject({
      search: null,
      sortBy: 'name',
      sortDirection: 'asc',
      limit: 25,
      offset: 0,
    })
    expect(fixture.table.hidden).toBe(false)
    expect(fixture.empty.hidden).toBe(true)
    expect(fixture.pagination.hidden).toBe(true)
    expect(fixture.status.textContent).toBe('Showing 1-2 of 2 customers.')
    expect(fixture.rows.children).toHaveLength(2)
    expect(fixture.rows.children[0]?.children.map((cell) => cell.textContent)).toEqual([
      'Asha Rao',
      '9876543210',
      'asha@example.com',
      '—',
      '03 Nov 2026',
    ])
  })

  it('searches and sorts through the loader', async () => {
    const fixture = createFixture()
    const calls: Array<CustomerListOptions | undefined> = []
    const controller = createList(fixture, async (options) => {
      calls.push(options)
      return makeResult([makeCustomer(1)], 1, options)
    })

    await controller.refresh()

    fixture.search.value = ' Asha '
    fixture.search.dispatch('input')
    await waitFor(() => calls.length === 2)

    expect(calls[1]).toMatchObject({ search: 'Asha', offset: 0 })

    fixture.sort.value = 'updatedAt:desc'
    fixture.sort.dispatch('change')
    await waitFor(() => calls.length === 3)

    expect(calls[2]).toMatchObject({
      search: 'Asha',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    })
  })

  it('shows the correct empty state for no records and no matches', async () => {
    const fixture = createFixture()
    const controller = createList(fixture, async (options) =>
      makeResult([], 0, options),
    )

    await controller.refresh()

    expect(fixture.table.hidden).toBe(true)
    expect(fixture.empty.hidden).toBe(false)
    expect(fixture.emptyTitle.textContent).toBe('No customers yet')
    expect(fixture.status.textContent).toBe('No customers yet.')

    fixture.search.value = 'missing'
    fixture.search.dispatch('input')
    await waitFor(() => fixture.emptyTitle.textContent === 'No matching customers')

    expect(fixture.status.textContent).toBe('No customers match "missing".')
  })

  it('paginates through customers', async () => {
    const fixture = createFixture()
    const calls: Array<CustomerListOptions | undefined> = []
    const controller = createList(fixture, async (options) => {
      calls.push(options)
      const offset = options?.offset ?? 0
      const count = offset === 0 ? 25 : 5

      return makeResult(
        Array.from({ length: count }, (_value, index) =>
          makeCustomer(offset + index + 1),
        ),
        30,
        options,
      )
    })

    await controller.refresh()

    expect(fixture.pagination.hidden).toBe(false)
    expect(fixture.pageLabel.textContent).toBe('Page 1 of 2')
    expect(fixture.previous.disabled).toBe(true)
    expect(fixture.next.disabled).toBe(false)

    fixture.next.click()
    await waitFor(() => calls.length === 2)

    expect(calls[1]?.offset).toBe(25)
    expect(fixture.pageLabel.textContent).toBe('Page 2 of 2')
    expect(fixture.previous.disabled).toBe(false)
    expect(fixture.next.disabled).toBe(true)
  })

  it('shows a load error and retries', async () => {
    const fixture = createFixture()
    let attempts = 0
    const controller = createList(fixture, async (options) => {
      attempts += 1

      if (attempts === 1) {
        throw new Error('Database is unavailable.')
      }

      return makeResult([makeCustomer(1)], 1, options)
    })

    await controller.refresh()

    expect(fixture.errorCard.hidden).toBe(false)
    expect(fixture.errorText.textContent).toBe('Database is unavailable.')
    expect(fixture.status.textContent).toBe('Customers could not be loaded.')

    fixture.retry.click()
    await waitFor(() => attempts === 2 && !fixture.table.hidden)

    expect(attempts).toBe(2)
    expect(fixture.table.hidden).toBe(false)
  })

  it('loads when the customer route becomes active', async () => {
    const fixture = createFixture()
    let calls = 0
    createList(fixture, async (options) => {
      calls += 1
      return makeResult([], 0, options)
    })

    expect(calls).toBe(0)

    fixture.view.location.hash = '#/customers'
    fixture.view.dispatch('hashchange')
    await waitFor(() => calls === 1)

    expect(calls).toBe(1)
  })
})
