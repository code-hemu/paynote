import {
  PROPERTY_TYPES,
  type ListResult,
  type Property,
  type PropertyListOptions,
  type PropertySortField,
  type PropertyType,
  type SortDirection,
} from '../db/types.ts'
import { listProperties, type PropertyLoader } from '../services/properties.ts'
import { formatDate, formatLabel } from '../utils/format.ts'

const DEFAULT_PAGE_SIZE = 25
const DEFAULT_DEBOUNCE_MS = 200

export interface PropertyListController {
  refresh(): Promise<void>
  destroy(): void
}

export interface PropertyListConfig {
  debounceMs?: number
  load?: PropertyLoader
  pageSize?: number
  onView?: (property: Property) => void
  onEdit?: (property: Property) => void
  onDelete?: (property: Property) => void
}

function parseSort(value: string): {
  sortBy: PropertySortField
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

function parseType(value: string): PropertyType | null {
  return (PROPERTY_TYPES as readonly string[]).includes(value)
    ? (value as PropertyType)
    : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export function createPropertyList(
  doc: Document,
  config: PropertyListConfig = {},
): PropertyListController {
  const view = doc.defaultView
  const list = doc.querySelector<HTMLElement>('[data-property-list]')
  const searchInput = doc.querySelector<HTMLInputElement>('[data-property-search]')
  const typeSelect = doc.querySelector<HTMLSelectElement>('[data-property-type]')
  const sortSelect = doc.querySelector<HTMLSelectElement>('[data-property-sort]')
  const status = doc.querySelector<HTMLElement>('[data-property-status]')
  const table = doc.querySelector<HTMLElement>('[data-property-table]')
  const rows = doc.querySelector<HTMLTableSectionElement>('[data-property-rows]')
  const empty = doc.querySelector<HTMLElement>('[data-property-empty]')
  const emptyTitle = doc.querySelector<HTMLElement>('[data-property-empty-title]')
  const emptyMessage = doc.querySelector<HTMLElement>(
    '[data-property-empty-message]',
  )
  const errorCard = doc.querySelector<HTMLElement>('[data-property-error]')
  const errorText = doc.querySelector<HTMLElement>('[data-property-error-message]')
  const retry = doc.querySelector<HTMLButtonElement>('[data-property-retry]')
  const pagination = doc.querySelector<HTMLElement>('[data-property-pagination]')
  const previous = doc.querySelector<HTMLButtonElement>('[data-property-previous]')
  const next = doc.querySelector<HTMLButtonElement>('[data-property-next]')
  const pageLabel = doc.querySelector<HTMLElement>('[data-property-page]')

  if (
    !list ||
    !searchInput ||
    !typeSelect ||
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
    throw new Error('Property list markup is incomplete.')
  }

  const load = config.load ?? listProperties
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const initialSort = parseSort(sortSelect.value)

  let search = ''
  let propertyType = parseType(typeSelect.value)
  let sortBy = initialSort.sortBy
  let sortDirection = initialSort.sortDirection
  let offset = 0
  let requestId = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  sortSelect.value = `${sortBy}:${sortDirection}`

  function isActiveRoute(): boolean {
    const path = (view?.location.hash ?? '').replace(/^#/, '').split('?')[0]
    return path === '/properties'
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

  function createActions(property: Property): HTMLTableCellElement {
    const cell = doc.createElement('td')
    cell.className = 'table-cell-actions'

    function addAction(
      label: string,
      action: 'view' | 'edit' | 'delete',
      handler: (property: Property) => void,
    ) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'button button-small button-secondary'
      button.textContent = label
      button.dataset.propertyAction = action
      button.dataset.propertyId = property.id
      button.addEventListener('click', () => handler(property))
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

  function renderRows(items: Property[]) {
    rows!.replaceChildren()
    const showActions = Boolean(
      config.onView || config.onEdit || config.onDelete,
    )

    for (const property of items) {
      const row = doc.createElement('tr')

      const name = doc.createElement('td')
      name.className = 'table-cell-primary'
      name.textContent = property.name

      const type = doc.createElement('td')
      type.className = 'table-cell-muted'
      type.textContent = formatLabel(property.propertyType)

      const number = doc.createElement('td')
      number.className = 'table-cell-muted'
      number.textContent = property.propertyNumber || '—'

      const address = doc.createElement('td')
      address.className = 'table-cell-muted'
      address.textContent = property.address || '—'

      const updated = doc.createElement('td')
      updated.className = 'table-cell-muted'
      updated.textContent = formatDate(property.updatedAt)

      row.append(name, type, number, address, updated)

      if (showActions) {
        row.append(createActions(property))
      }

      rows!.append(row)
    }
  }

  function render(result: ListResult<Property>) {
    const total = result.total
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(Math.floor(offset / pageSize) + 1, totalPages)
    const start = total === 0 ? 0 : offset + 1
    const end = offset + result.items.length
    const filtering = Boolean(search || propertyType)

    renderRows(result.items)

    table!.hidden = result.items.length === 0
    empty!.hidden = total > 0 && result.items.length > 0
    errorCard!.hidden = true

    if (total === 0) {
      if (emptyTitle) {
        emptyTitle.textContent = filtering
          ? 'No matching properties'
          : 'No properties yet'
      }

      if (emptyMessage) {
        emptyMessage.textContent = filtering
          ? 'Try a different search term or property type.'
          : 'Property records will appear here once you add them.'
      }

      status!.textContent = search
        ? `No properties match "${search}".`
        : 'No properties yet.'
    } else {
      status!.textContent = `Showing ${start}-${end} of ${total} propert${total === 1 ? 'y' : 'ies'}.`
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

    status!.textContent = 'Properties could not be loaded.'
  }

  async function refresh(): Promise<void> {
    const currentRequest = ++requestId

    setBusy(true)
    hideError()

    try {
      const result = await load({
        search: search || null,
        propertyType,
        sortBy,
        sortDirection,
        limit: pageSize,
        offset,
      } satisfies PropertyListOptions)

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

  function onType() {
    propertyType = parseType(typeSelect!.value)
    offset = 0
    void refresh()
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
  typeSelect.addEventListener('change', onType)
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
      typeSelect.removeEventListener('change', onType)
      sortSelect.removeEventListener('change', onSort)
      previous.removeEventListener('click', onPrevious)
      next.removeEventListener('click', onNext)
      view?.removeEventListener('hashchange', onRouteChange)
    },
  }
}
