import type {
  Customer,
  CustomerListOptions,
  CustomerSortField,
  ListResult,
  SortDirection,
} from '../db/types.ts'
import { listCustomers, type CustomerLoader } from '../services/customers.ts'
import { formatDate } from '../utils/format.ts'

const DEFAULT_PAGE_SIZE = 25
const DEFAULT_DEBOUNCE_MS = 200

export interface CustomerListController {
  refresh(): Promise<void>
  destroy(): void
}

export interface CustomerListConfig {
  debounceMs?: number
  load?: CustomerLoader
  pageSize?: number
  onView?: (customer: Customer) => void
  onEdit?: (customer: Customer) => void
  onDelete?: (customer: Customer) => void
}

function parseSort(value: string): {
  sortBy: CustomerSortField
  sortDirection: SortDirection
} {
  const [field, direction] = value.split(':')
  const sortBy =
    field === 'name' || field === 'createdAt' || field === 'updatedAt'
      ? field
      : 'name'
  const sortDirection = direction === 'desc' ? 'desc' : 'asc'

  return { sortBy, sortDirection }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export function createCustomerList(
  doc: Document,
  config: CustomerListConfig = {},
): CustomerListController {
  const view = doc.defaultView
  const list = doc.querySelector<HTMLElement>('[data-customer-list]')
  const searchInput = doc.querySelector<HTMLInputElement>('[data-customer-search]')
  const sortSelect = doc.querySelector<HTMLSelectElement>('[data-customer-sort]')
  const status = doc.querySelector<HTMLElement>('[data-customer-status]')
  const table = doc.querySelector<HTMLElement>('[data-customer-table]')
  const rows = doc.querySelector<HTMLTableSectionElement>('[data-customer-rows]')
  const empty = doc.querySelector<HTMLElement>('[data-customer-empty]')
  const emptyTitle = doc.querySelector<HTMLElement>('[data-customer-empty-title]')
  const emptyMessage = doc.querySelector<HTMLElement>('[data-customer-empty-message]')
  const errorCard = doc.querySelector<HTMLElement>('[data-customer-error]')
  const errorText = doc.querySelector<HTMLElement>('[data-customer-error-message]')
  const retry = doc.querySelector<HTMLButtonElement>('[data-customer-retry]')
  const pagination = doc.querySelector<HTMLElement>('[data-customer-pagination]')
  const previous = doc.querySelector<HTMLButtonElement>('[data-customer-previous]')
  const next = doc.querySelector<HTMLButtonElement>('[data-customer-next]')
  const pageLabel = doc.querySelector<HTMLElement>('[data-customer-page]')

  if (
    !list ||
    !searchInput ||
    !sortSelect ||
    !status ||
    !table ||
    !rows ||
    !empty ||
    !errorCard ||
    !pagination ||
    !previous ||
    !next ||
    !pageLabel
  ) {
    throw new Error('Customer list markup is incomplete.')
  }

  const load = config.load ?? listCustomers
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const initialSort = parseSort(sortSelect.value)

  let search = ''
  let sortBy = initialSort.sortBy
  let sortDirection = initialSort.sortDirection
  let offset = 0
  let requestId = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  sortSelect.value = `${sortBy}:${sortDirection}`

  function isActiveRoute(): boolean {
    const path = (view?.location.hash ?? '').replace(/^#/, '').split('?')[0]
    return path === '/customers'
  }

  function setBusy(busy: boolean) {
    if (busy) {
      list?.setAttribute('aria-busy', 'true')
    } else {
      list?.removeAttribute('aria-busy')
    }
  }

  function hideError() {
    errorCard!.hidden = true
  }

  function renderRows(items: Customer[]) {
    rows!.replaceChildren()
    const showActions = Boolean(
      config.onView || config.onEdit || config.onDelete,
    )

    for (const customer of items) {
      const row = doc.createElement('tr')

      const name = doc.createElement('td')
      name.className = 'table-cell-primary'
      name.textContent = customer.fullName

      const phone = doc.createElement('td')
      phone.className = 'table-cell-muted'
      phone.textContent = customer.phone || '—'

      const email = doc.createElement('td')
      email.className = 'table-cell-muted'
      email.textContent = customer.email || '—'

      const address = doc.createElement('td')
      address.className = 'table-cell-muted'
      address.textContent = customer.address || '—'

      const updated = doc.createElement('td')
      updated.className = 'table-cell-muted'
      updated.textContent = formatDate(customer.updatedAt)

      row.append(name, phone, email, address, updated)

      if (showActions) {
        row.append(createActions(customer))
      }

      rows!.append(row)
    }
  }

  function createActions(customer: Customer): HTMLTableCellElement {
    const cell = doc.createElement('td')
    cell.className = 'table-cell-actions'

    function addAction(
      label: string,
      action: 'view' | 'edit' | 'delete',
      handler: (customer: Customer) => void,
    ) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'button button-small button-secondary'
      button.textContent = label
      button.dataset.customerAction = action
      button.dataset.customerId = customer.id
      button.addEventListener('click', () => handler(customer))
      cell.append(button)
    }

    if (config.onView) {
      addAction('View', 'view', config.onView)
    }

    if (config.onEdit) {
      addAction('Edit', 'edit', config.onEdit)
    }

    if (config.onDelete) {
      addAction('Delete', 'delete', config.onDelete)
    }

    return cell
  }

  function render(result: ListResult<Customer>) {
    const total = result.total
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(Math.floor(offset / pageSize) + 1, totalPages)
    const start = total === 0 ? 0 : offset + 1
    const end = offset + result.items.length

    renderRows(result.items)

    table!.hidden = result.items.length === 0
    empty!.hidden = total > 0 && result.items.length > 0
    errorCard!.hidden = true

    if (total === 0) {
      if (emptyTitle) {
        emptyTitle.textContent = search ? 'No matching customers' : 'No customers yet'
      }

      if (emptyMessage) {
        emptyMessage.textContent = search
          ? 'Try a different name, phone number, or email address.'
          : 'Customer records will appear here once you add them.'
      }

      status!.textContent = search
        ? `No customers match "${search}".`
        : 'No customers yet.'
    } else {
      status!.textContent = `Showing ${start}-${end} of ${total} customer${total === 1 ? '' : 's'}.`
    }

    pagination!.hidden = total <= pageSize
    previous!.disabled = currentPage <= 1
    next!.disabled = currentPage >= totalPages
    pageLabel!.textContent = `Page ${currentPage} of ${totalPages}`
  }

  function renderError(error: unknown) {
    table!.hidden = true
    empty!.hidden = true
    pagination!.hidden = true
    errorCard!.hidden = false

    if (errorText) {
      errorText.textContent = errorMessage(error)
    }

    status!.textContent = 'Customers could not be loaded.'
  }

  async function refresh(): Promise<void> {
    const currentRequest = ++requestId

    setBusy(true)
    hideError()

    try {
      const result = await load({
        search: search || null,
        sortBy,
        sortDirection,
        limit: pageSize,
        offset,
      } satisfies CustomerListOptions)

      if (destroyed || currentRequest !== requestId) {
        return
      }

      if (result.items.length === 0 && result.total > 0 && offset > 0) {
        offset = Math.max(0, Math.floor((result.total - 1) / pageSize) * pageSize)
        await refresh()
        return
      }

      render(result)
    } catch (error) {
      if (destroyed || currentRequest !== requestId) {
        return
      }

      renderError(error)
    } finally {
      if (!destroyed && currentRequest === requestId) {
        setBusy(false)
      }
    }
  }

  function scheduleRefresh() {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void refresh()
    }, debounceMs)
  }

  function onSearch() {
    search = searchInput!.value.trim()
    offset = 0
    scheduleRefresh()
  }

  function onSort() {
    const parsed = parseSort(sortSelect!.value)
    sortBy = parsed.sortBy
    sortDirection = parsed.sortDirection
    offset = 0
    void refresh()
  }

  function onPrevious() {
    offset = Math.max(0, offset - pageSize)
    void refresh()
  }

  function onNext() {
    offset += pageSize
    void refresh()
  }

  function onRouteChange() {
    if (isActiveRoute()) {
      void refresh()
    }
  }

  searchInput.addEventListener('input', onSearch)
  sortSelect.addEventListener('change', onSort)
  previous.addEventListener('click', onPrevious)
  next.addEventListener('click', onNext)
  retry?.addEventListener('click', () => void refresh())
  view?.addEventListener('hashchange', onRouteChange)

  if (isActiveRoute()) {
    void refresh()
  }

  return {
    refresh,
    destroy() {
      destroyed = true
      requestId += 1

      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
        debounceTimer = undefined
      }

      searchInput.removeEventListener('input', onSearch)
      sortSelect.removeEventListener('change', onSort)
      previous.removeEventListener('click', onPrevious)
      next.removeEventListener('click', onNext)
      view?.removeEventListener('hashchange', onRouteChange)
    },
  }
}
