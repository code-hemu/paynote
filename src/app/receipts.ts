import {
  RECEIPT_STATUS_LABELS,
  type ReceiptStatus,
} from '../domain/receipt-status.ts'
import type {
  ListResult,
  ReceiptListOptions,
  ReceiptSummary,
} from '../db/types.ts'
import { listReceipts, type ReceiptLoader } from '../services/receipts.ts'
import { downloadTextFile, timestampedFilename, toCsv } from '../utils/csv.ts'
import { formatCurrency, formatDate, formatLabel } from '../utils/format.ts'
import { paymentMethodLabel } from '../domain/receipt-categories.ts'

const DEFAULT_PAGE_SIZE = 25
const DEFAULT_DEBOUNCE_MS = 200

export interface ReceiptListController {
  refresh(): Promise<void>
  exportCsv(): Promise<void>
  destroy(): void
}

export interface ReceiptListConfig {
  debounceMs?: number
  load?: ReceiptLoader
  pageSize?: number
  onView?: (receipt: ReceiptSummary) => void
  onEdit?: (receipt: ReceiptSummary) => void
  onDelete?: (receipt: ReceiptSummary) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export function createReceiptList(
  doc: Document,
  config: ReceiptListConfig = {},
): ReceiptListController {
  const view = doc.defaultView
  const list = doc.querySelector<HTMLElement>('[data-receipt-list]')
  const searchInput = doc.querySelector<HTMLInputElement>('[data-receipt-search]')
  const typeSelect = doc.querySelector<HTMLSelectElement>('[data-receipt-type]')
  const statusSelect = doc.querySelector<HTMLSelectElement>('[data-receipt-status]')
  const customerSelect = doc.querySelector<HTMLSelectElement>('[data-receipt-customer]')
  const propertySelect = doc.querySelector<HTMLSelectElement>('[data-receipt-property]')
  const fromInput = doc.querySelector<HTMLInputElement>('[data-receipt-from]')
  const toInput = doc.querySelector<HTMLInputElement>('[data-receipt-to]')
  const clearButton = doc.querySelector<HTMLButtonElement>('[data-receipt-clear-filters]')
  const exportButton = doc.querySelector<HTMLButtonElement>('[data-receipt-export]')
  const status = doc.querySelector<HTMLElement>('[data-receipt-list-status]')
  const table = doc.querySelector<HTMLElement>('[data-receipt-table]')
  const rows = doc.querySelector<HTMLTableSectionElement>('[data-receipt-rows]')
  const empty = doc.querySelector<HTMLElement>('[data-receipt-empty]')
  const emptyTitle = doc.querySelector<HTMLElement>('[data-receipt-empty-title]')
  const emptyMessage = doc.querySelector<HTMLElement>('[data-receipt-empty-message]')
  const errorCard = doc.querySelector<HTMLElement>('[data-receipt-list-error]')
  const errorText = doc.querySelector<HTMLElement>('[data-receipt-list-error-message]')
  const retry = doc.querySelector<HTMLButtonElement>('[data-receipt-list-retry]')
  const pagination = doc.querySelector<HTMLElement>('[data-receipt-pagination]')
  const previous = doc.querySelector<HTMLButtonElement>('[data-receipt-previous]')
  const next = doc.querySelector<HTMLButtonElement>('[data-receipt-next]')
  const pageLabel = doc.querySelector<HTMLElement>('[data-receipt-page]')

  if (
    !list ||
    !searchInput ||
    !typeSelect ||
    !statusSelect ||
    !customerSelect ||
    !propertySelect ||
    !fromInput ||
    !toInput ||
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
    throw new Error('Receipt list markup is incomplete.')
  }

  const load = config.load ?? listReceipts
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE
  const debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS

  let search = ''
  let offset = 0
  let requestId = 0
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  function currentFilters(): ReceiptListOptions {
    return {
      search: search || null,
      receiptType: typeSelect!.value || null,
      status: (statusSelect!.value || null) as ReceiptStatus | null,
      customerId: customerSelect!.value || null,
      propertyId: propertySelect!.value || null,
      fromDate: fromInput!.value || null,
      toDate: toInput!.value || null,
      limit: pageSize,
      offset,
    }
  }

  function hasActiveFilters(): boolean {
    return Boolean(
      search ||
        typeSelect!.value ||
        statusSelect!.value ||
        customerSelect!.value ||
        propertySelect!.value ||
        fromInput!.value ||
        toInput!.value,
    )
  }

  function isActiveRoute(): boolean {
    const path = (view?.location.hash ?? '').replace(/^#/, '').split('?')[0]
    return path === '/receipts'
  }

  function setBusy(busy: boolean) {
    if (busy) {
      list?.setAttribute('aria-busy', 'true')
    } else {
      list?.removeAttribute('aria-busy')
    }
  }

  function createActions(receipt: ReceiptSummary): HTMLTableCellElement {
    const cell = doc.createElement('td')
    cell.className = 'table-cell-actions'

    function addAction(
      label: string,
      action: 'view' | 'edit' | 'delete',
      handler: (receipt: ReceiptSummary) => void,
    ) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'button button-small button-secondary'
      button.textContent = label
      button.dataset.receiptAction = action
      button.dataset.receiptId = receipt.id
      button.addEventListener('click', () => handler(receipt))
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

  function renderRows(items: ReceiptSummary[]) {
    rows!.replaceChildren()
    const showActions = Boolean(config.onView || config.onEdit || config.onDelete)

    for (const receipt of items) {
      const row = doc.createElement('tr')

      const number = doc.createElement('td')
      number.className = 'table-cell-primary'
      number.textContent = receipt.receiptNumber

      const date = doc.createElement('td')
      date.className = 'table-cell-muted'
      date.textContent = formatDate(receipt.receiptDate)

      const customer = doc.createElement('td')
      customer.className = 'table-cell-muted'
      customer.textContent = receipt.customerName || '—'

      const property = doc.createElement('td')
      property.className = 'table-cell-muted'
      property.textContent = receipt.propertyName || '—'

      const type = doc.createElement('td')
      type.className = 'table-cell-muted'
      type.textContent = formatLabel(receipt.receiptType)

      const amount = doc.createElement('td')
      amount.textContent = formatCurrency(receipt.amountPaise)

      const statusCell = doc.createElement('td')
      const badge = doc.createElement('span')
      badge.className = `badge badge-${statusVariant(receipt.status)}`
      badge.textContent = RECEIPT_STATUS_LABELS[receipt.status]
      statusCell.append(badge)

      row.append(number, date, customer, property, type, amount, statusCell)

      if (showActions) {
        row.append(createActions(receipt))
      }

      rows!.append(row)
    }
  }

  function render(result: ListResult<ReceiptSummary>) {
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
        emptyTitle.textContent = hasActiveFilters()
          ? 'No matching receipts'
          : 'No receipts yet'
      }

      if (emptyMessage) {
        emptyMessage.textContent = hasActiveFilters()
          ? 'Try a different search term, date range, or filter.'
          : 'Create your first receipt to see it here.'
      }

      status!.textContent = hasActiveFilters()
        ? 'No receipts match the current filters.'
        : 'No receipts yet.'
    } else {
      status!.textContent = `Showing ${start}-${end} of ${total} receipt${total === 1 ? '' : 's'}.`
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

    status!.textContent = 'Receipts could not be loaded.'
  }

  async function refresh(): Promise<void> {
    const currentRequest = ++requestId

    setBusy(true)
    errorCard!.hidden = true

    try {
      const result = await load(currentFilters())

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

  async function exportCsv(): Promise<void> {
    if (exportButton) {
      exportButton.disabled = true
    }

    try {
      const items: ReceiptSummary[] = []
      let pageOffset = 0

      for (;;) {
        const page = await load({
          ...currentFilters(),
          offset: pageOffset,
        })

        items.push(...page.items)

        if (page.items.length === 0 || items.length >= page.total) {
          break
        }

        pageOffset += page.items.length
      }

      const csv = toCsv(
        [
          'Receipt number',
          'Date',
          'Customer',
          'Property',
          'Category',
          'Amount (INR)',
          'Payment method',
          'Status',
          'Reference',
        ],
        items.map((receipt) => [
          receipt.receiptNumber,
          receipt.receiptDate,
          receipt.customerName ?? '',
          receipt.propertyName ?? '',
          formatLabel(receipt.receiptType),
          (receipt.amountPaise / 100).toFixed(2),
          paymentMethodLabel(receipt.paymentMethod),
          RECEIPT_STATUS_LABELS[receipt.status],
          receipt.referenceNumber ?? '',
        ]),
      )

      downloadTextFile(
        timestampedFilename('paynote-receipts', 'csv'),
        csv,
        'text/csv;charset=utf-8',
      )
    } catch (error) {
      renderError(error)
    } finally {
      if (exportButton) {
        exportButton.disabled = false
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

  function onFilterChange() {
    offset = 0
    void refresh()
  }

  function onFromChange() {
    offset = 0
    void refresh()
  }

  function onClearFilters() {
    searchInput!.value = ''
    typeSelect!.value = ''
    statusSelect!.value = ''
    customerSelect!.value = ''
    propertySelect!.value = ''
    fromInput!.value = ''
    toInput!.value = ''
    search = ''
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
  typeSelect.addEventListener('change', onFilterChange)
  statusSelect.addEventListener('change', onFilterChange)
  customerSelect.addEventListener('change', onFilterChange)
  propertySelect.addEventListener('change', onFilterChange)
  fromInput.addEventListener('change', onFromChange)
  toInput.addEventListener('change', onFromChange)
  clearButton?.addEventListener('click', onClearFilters)
  exportButton?.addEventListener('click', () => void exportCsv())
  previous.addEventListener('click', onPrevious)
  next.addEventListener('click', onNext)
  retry?.addEventListener('click', () => void refresh())
  view?.addEventListener('hashchange', onRouteChange)

  if (isActiveRoute()) {
    void refresh()
  }

  return {
    refresh,
    exportCsv,
    destroy() {
      destroyed = true
      requestId += 1

      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
        debounceTimer = undefined
      }

      searchInput.removeEventListener('input', onSearch)
      typeSelect.removeEventListener('change', onFilterChange)
      statusSelect.removeEventListener('change', onFilterChange)
      customerSelect.removeEventListener('change', onFilterChange)
      propertySelect.removeEventListener('change', onFilterChange)
      fromInput.removeEventListener('change', onFromChange)
      toInput.removeEventListener('change', onFromChange)
      clearButton?.removeEventListener('click', onClearFilters)
      previous.removeEventListener('click', onPrevious)
      next.removeEventListener('click', onNext)
      view?.removeEventListener('hashchange', onRouteChange)
    },
  }
}

export function statusVariant(status: ReceiptStatus): string {
  switch (status) {
    case 'paid':
      return 'success'
    case 'cancelled':
      return 'danger'
    case 'draft':
      return 'neutral'
    case 'issued':
    default:
      return 'brand'
  }
}
