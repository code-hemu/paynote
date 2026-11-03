import { afterEach, describe, expect, it } from '@guchho/test'

import type {
  ListResult,
  Property,
  PropertyListOptions,
} from '../db/types.ts'
import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'

import {
  createPropertyList,
  type PropertyListController,
} from './properties.ts'

interface Fixture {
  document: FakeDocument
  view: FakeWindow
  list: FakeElement
  search: FakeElement
  type: FakeElement
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

const controllers: PropertyListController[] = []

function createFixture(): Fixture {
  const view = new FakeWindow()
  view.location.hash = '#/'

  const document = new FakeDocument(view)

  return {
    document,
    view,
    list: document.add(new FakeElement({ propertyList: '' })),
    search: document.add(new FakeElement({ propertySearch: '' })),
    type: document.add(new FakeElement({ propertyType: '' })),
    sort: document.add(new FakeElement({ propertySort: '' })),
    status: document.add(new FakeElement({ propertyStatus: '' })),
    table: document.add(new FakeElement({ propertyTable: '' })),
    rows: document.add(new FakeElement({ propertyRows: '' })),
    empty: document.add(new FakeElement({ propertyEmpty: '' })),
    emptyTitle: document.add(new FakeElement({ propertyEmptyTitle: '' })),
    emptyMessage: document.add(new FakeElement({ propertyEmptyMessage: '' })),
    errorCard: document.add(new FakeElement({ propertyError: '' })),
    errorText: document.add(new FakeElement({ propertyErrorMessage: '' })),
    retry: document.add(new FakeElement({ propertyRetry: '' })),
    pagination: document.add(new FakeElement({ propertyPagination: '' })),
    previous: document.add(new FakeElement({ propertyPrevious: '' })),
    next: document.add(new FakeElement({ propertyNext: '' })),
    pageLabel: document.add(new FakeElement({ propertyPage: '' })),
  }
}

function makeProperty(
  index: number,
  overrides: Partial<Property> = {},
): Property {
  return {
    id: `property-${index}`,
    name: `Property ${index}`,
    propertyType: 'shop',
    propertyNumber: null,
    address: null,
    description: null,
    notes: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  }
}

function makeResult(
  items: Property[],
  total: number,
  options?: PropertyListOptions,
): ListResult<Property> {
  return {
    items,
    total,
    limit: options?.limit ?? 25,
    offset: options?.offset ?? 0,
  }
}

function createList(
  fixture: Fixture,
  load: (options?: PropertyListOptions) => Promise<ListResult<Property>>,
  config: Parameters<typeof createPropertyList>[1] = {},
) {
  const controller = createPropertyList(
    fixture.document as unknown as Document,
    {
      debounceMs: 0,
      load,
      pageSize: 25,
      ...config,
    },
  )

  controllers.push(controller)
  return controller
}

async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000

  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the property list to update.')
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

describe('Property list', () => {
  it('renders properties and reports the total', async () => {
    const fixture = createFixture()
    const calls: Array<PropertyListOptions | undefined> = []
    const properties = [
      makeProperty(1, {
        name: 'Main Shop',
        propertyNumber: 'S-1',
        address: 'Market Road',
      }),
      makeProperty(2, { name: 'North Godown', propertyType: 'godown' }),
    ]
    const controller = createList(fixture, async (options) => {
      calls.push(options)
      return makeResult(properties, 2, options)
    })

    await controller.refresh()

    expect(calls[0]).toMatchObject({
      search: null,
      propertyType: null,
      sortBy: 'name',
      sortDirection: 'asc',
      limit: 25,
      offset: 0,
    })
    expect(fixture.table.hidden).toBe(false)
    expect(fixture.empty.hidden).toBe(true)
    expect(fixture.status.textContent).toBe('Showing 1-2 of 2 properties.')
    expect(fixture.rows.children).toHaveLength(2)
    expect(fixture.rows.children[0]?.children.map((cell) => cell.textContent)).toEqual([
      'Main Shop',
      'Shop',
      'S-1',
      'Market Road',
      '03 Nov 2026',
    ])
  })

  it('filters by type and sorts through the loader', async () => {
    const fixture = createFixture()
    const calls: Array<PropertyListOptions | undefined> = []
    const controller = createList(fixture, async (options) => {
      calls.push(options)
      return makeResult([makeProperty(1)], 1, options)
    })

    await controller.refresh()

    fixture.type.value = 'godown'
    fixture.type.dispatch('change')
    await waitFor(() => calls.length === 2)

    expect(calls[1]).toMatchObject({ propertyType: 'godown', offset: 0 })

    fixture.sort.value = 'updatedAt:desc'
    fixture.sort.dispatch('change')
    await waitFor(() => calls.length === 3)

    expect(calls[2]).toMatchObject({
      propertyType: 'godown',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    })
  })

  it('searches properties and shows a matching empty state', async () => {
    const fixture = createFixture()
    const controller = createList(fixture, async (options) =>
      makeResult([], 0, options),
    )

    await controller.refresh()

    expect(fixture.emptyTitle.textContent).toBe('No properties yet')

    fixture.search.value = 'missing'
    fixture.search.dispatch('input')
    await waitFor(
      () => fixture.emptyTitle.textContent === 'No matching properties',
    )

    expect(fixture.status.textContent).toBe('No properties match "missing".')
  })

  it('shows a load error and retries', async () => {
    const fixture = createFixture()
    let attempts = 0
    const controller = createList(fixture, async (options) => {
      attempts += 1

      if (attempts === 1) {
        throw new Error('Database is unavailable.')
      }

      return makeResult([makeProperty(1)], 1, options)
    })

    await controller.refresh()

    expect(fixture.errorCard.hidden).toBe(false)
    expect(fixture.errorText.textContent).toBe('Database is unavailable.')

    fixture.retry.click()
    await waitFor(() => attempts === 2 && !fixture.table.hidden)

    expect(attempts).toBe(2)
  })

  it('invokes row actions when configured', async () => {
    const fixture = createFixture()
    const property = makeProperty(1, { name: 'Main Shop' })
    const deleted: string[] = []
    const controller = createList(
      fixture,
      async (options) => makeResult([property], 1, options),
      {
        onDelete: (item) => deleted.push(item.id),
      },
    )

    await controller.refresh()

    const actions = fixture.rows.children[0]?.children[5]
    expect(actions?.children).toHaveLength(1)

    actions?.children[0]?.click()
    expect(deleted).toEqual([property.id])
  })

  it('loads when the property route becomes active', async () => {
    const fixture = createFixture()
    let calls = 0
    createList(fixture, async (options) => {
      calls += 1
      return makeResult([], 0, options)
    })

    expect(calls).toBe(0)

    fixture.view.location.hash = '#/properties'
    fixture.view.dispatch('hashchange')
    await waitFor(() => calls === 1)

    expect(calls).toBe(1)
  })
})
