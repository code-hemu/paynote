import {
  findCategory,
  RECEIPT_CATEGORIES,
} from '../domain/receipt-categories.ts'
import {
  localDateString,
  normalizeFilters,
  rangeForPreset,
  type ReportBreakdownRow,
  type ReportFilters,
  type ReportPreset,
  type ReportSummary,
} from '../domain/reports.ts'
import {
  RECEIPT_STATUS_LABELS,
  type ReceiptStatus,
} from '../domain/receipt-status.ts'
import type { CustomerLoader } from '../services/customers.ts'
import type { PropertyLoader } from '../services/properties.ts'
import * as reportService from '../services/reports.ts'
import { downloadTextFile, timestampedFilename, toCsv } from '../utils/csv.ts'
import { formatCurrency, formatDate, formatLabel } from '../utils/format.ts'

export interface ReportsDeps {
  summary?: typeof reportService.getReportSummary
  loadCustomers?: CustomerLoader
  loadProperties?: PropertyLoader
}

export interface ReportsController {
  refresh(): Promise<void>
  destroy(): void
}

type BreakdownKey =
  | 'day'
  | 'month'
  | 'year'
  | 'category'
  | 'payment'
  | 'customer'
  | 'property'

interface ReportElements {
  root: HTMLElement
  preset: HTMLSelectElement
  from: HTMLInputElement
  to: HTMLInputElement
  category: HTMLSelectElement
  status: HTMLSelectElement
  customer: HTMLSelectElement
  property: HTMLSelectElement
  search: HTMLInputElement
  apply: HTMLButtonElement
  clear: HTMLButtonElement
  exportCsv: HTMLButtonElement
  print: HTMLButtonElement
  statusLine: HTMLElement
  error: HTMLElement
  errorMessage: HTMLElement
  retry: HTMLButtonElement
  total: HTMLElement
  count: HTMLElement
  average: HTMLElement
  cancelled: HTMLElement
  chart: HTMLElement
  chartEmpty: HTMLElement
  printArea: HTMLElement
  rows: Record<BreakdownKey, HTMLTableSectionElement>
  empties: Record<BreakdownKey, HTMLElement>
  tables: Record<BreakdownKey, HTMLElement>
}

const BREAKDOWNS: Array<[BreakdownKey, string, string]> = [
  ['day', 'day', 'Daily totals'],
  ['month', 'month', 'Monthly totals'],
  ['year', 'year', 'Yearly totals'],
  ['category', 'category', 'By category'],
  ['payment', 'payment', 'By payment method'],
  ['customer', 'customer', 'By customer'],
  ['property', 'property', 'By property'],
]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The report could not be loaded.'
}

function queryElements(doc: Document): ReportElements {
  const rows = {} as Record<BreakdownKey, HTMLTableSectionElement>
  const empties = {} as Record<BreakdownKey, HTMLElement>
  const tables = {} as Record<BreakdownKey, HTMLElement>

  for (const [key] of BREAKDOWNS) {
    rows[key] = doc.querySelector<HTMLTableSectionElement>(
      `[data-report-rows="${key}"]`,
    )!
    empties[key] = doc.querySelector<HTMLElement>(
      `[data-report-empty="${key}"]`,
    )!
    tables[key] = doc.querySelector<HTMLElement>(
      `[data-report-table="${key}"]`,
    )!
  }

  const elements: ReportElements = {
    root: doc.querySelector<HTMLElement>('[data-reports]')!,
    preset: doc.querySelector<HTMLSelectElement>('[data-report-preset]')!,
    from: doc.querySelector<HTMLInputElement>('[data-report-from]')!,
    to: doc.querySelector<HTMLInputElement>('[data-report-to]')!,
    category: doc.querySelector<HTMLSelectElement>('[data-report-category]')!,
    status: doc.querySelector<HTMLSelectElement>('[data-report-status]')!,
    customer: doc.querySelector<HTMLSelectElement>('[data-report-customer]')!,
    property: doc.querySelector<HTMLSelectElement>('[data-report-property]')!,
    search: doc.querySelector<HTMLInputElement>('[data-report-search]')!,
    apply: doc.querySelector<HTMLButtonElement>('[data-report-apply]')!,
    clear: doc.querySelector<HTMLButtonElement>('[data-report-clear]')!,
    exportCsv: doc.querySelector<HTMLButtonElement>('[data-report-export]')!,
    print: doc.querySelector<HTMLButtonElement>('[data-report-print]')!,
    statusLine: doc.querySelector<HTMLElement>('[data-report-status-line]')!,
    error: doc.querySelector<HTMLElement>('[data-report-error]')!,
    errorMessage: doc.querySelector<HTMLElement>('[data-report-error-message]')!,
    retry: doc.querySelector<HTMLButtonElement>('[data-report-retry]')!,
    total: doc.querySelector<HTMLElement>('[data-report-total]')!,
    count: doc.querySelector<HTMLElement>('[data-report-count]')!,
    average: doc.querySelector<HTMLElement>('[data-report-average]')!,
    cancelled: doc.querySelector<HTMLElement>('[data-report-cancelled]')!,
    chart: doc.querySelector<HTMLElement>('[data-report-chart]')!,
    chartEmpty: doc.querySelector<HTMLElement>('[data-report-chart-empty]')!,
    printArea: doc.querySelector<HTMLElement>('[data-print-report]')!,
    rows,
    empties,
    tables,
  }

  for (const [name, value] of Object.entries(elements)) {
    if (!value) {
      throw new Error(`Reports markup is incomplete: ${name}.`)
    }
  }

  return elements
}

export function createReports(
  doc: Document,
  deps: ReportsDeps = {},
): ReportsController {
  const view = doc.defaultView
  const elements = queryElements(doc)
  const summary = deps.summary ?? reportService.getReportSummary
  let currentSummary: ReportSummary | null = null
  let currentFilters: ReportFilters = {
    fromDate: null,
    toDate: null,
    receiptType: null,
    customerId: null,
    propertyId: null,
    status: null,
  }
  let requestId = 0
  let destroyed = false

  function fillCategoryOptions() {
    elements.category.replaceChildren()

    const all = doc.createElement('option')
    all.value = ''
    all.textContent = 'All categories'
    elements.category.append(all)

    for (const category of RECEIPT_CATEGORIES) {
      const option = doc.createElement('option')
      option.value = category.value
      option.textContent = category.label
      elements.category.append(option)
    }
  }

  function fillStatusOptions() {
    elements.status.replaceChildren()

    const all = doc.createElement('option')
    all.value = ''
    all.textContent = 'All statuses'
    elements.status.append(all)

    for (const status of ['draft', 'issued', 'paid', 'cancelled'] as ReceiptStatus[]) {
      const option = doc.createElement('option')
      option.value = status
      option.textContent = RECEIPT_STATUS_LABELS[status]
      elements.status.append(option)
    }
  }

  function fillEntityOptions(
    select: HTMLSelectElement,
    placeholder: string,
    items: Array<{ id: string; label: string }>,
  ) {
    select.replaceChildren()
    const all = doc.createElement('option')
    all.value = ''
    all.textContent = placeholder
    select.append(all)

    for (const item of items) {
      const option = doc.createElement('option')
      option.value = item.id
      option.textContent = item.label
      select.append(option)
    }
  }

  async function loadOptions() {
    const [customers, properties] = await Promise.all([
      deps.loadCustomers
        ? deps.loadCustomers({ limit: 200, offset: 0 })
        : Promise.resolve({ items: [], total: 0, limit: 0, offset: 0 }),
      deps.loadProperties
        ? deps.loadProperties({ limit: 200, offset: 0 })
        : Promise.resolve({ items: [], total: 0, limit: 0, offset: 0 }),
    ])

    fillEntityOptions(
      elements.customer,
      'All customers',
      customers.items.map((customer) => ({
        id: customer.id,
        label: customer.fullName,
      })),
    )
    fillEntityOptions(
      elements.property,
      'All properties',
      properties.items.map((property) => ({
        id: property.id,
        label: property.name,
      })),
    )
  }

  function readFilters(): ReportFilters {
    return normalizeFilters({
      fromDate: elements.from.value,
      toDate: elements.to.value,
      receiptType: elements.category.value,
      status: (elements.status.value || null) as ReceiptStatus | null,
      customerId: elements.customer.value,
      propertyId: elements.property.value,
    })
  }

  function applyPreset(preset: ReportPreset) {
    const range = rangeForPreset(preset)

    if (preset === 'custom') {
      return
    }

    elements.from.value = range.fromDate ?? ''
    elements.to.value = range.toDate ?? ''
  }

  function breakdownRows(
    key: BreakdownKey,
  ): ReportBreakdownRow[] {
    if (!currentSummary) {
      return []
    }

    switch (key) {
      case 'day':
        return currentSummary.byDay
      case 'month':
        return currentSummary.byMonth
      case 'year':
        return currentSummary.byYear
      case 'category':
        return currentSummary.byCategory
      case 'payment':
        return currentSummary.byPaymentMethod
      case 'customer':
        return currentSummary.byCustomer
      case 'property':
        return currentSummary.byProperty
    }
  }

  function labelForBreakdown(key: BreakdownKey, row: ReportBreakdownRow): string {
    switch (key) {
      case 'day':
      case 'month':
      case 'year':
        return formatPeriod(key, row.key)
      case 'category':
        return findCategory(row.key)?.label ?? formatLabel(row.label)
      case 'payment':
        return formatLabel(row.label)
      default:
        return row.label || '—'
    }
  }

  function renderBreakdowns(value: ReportSummary) {
    const max = Math.max(
      1,
      ...BREAKDOWNS.flatMap(([key]) =>
        breakdownRows(key).map((row) => row.totalPaise),
      ),
    )

    for (const [key, , title] of BREAKDOWNS) {
      const rows = breakdownRows(key)
      const body = elements.rows[key]
      body.replaceChildren()
      elements.tables[key].hidden = rows.length === 0
      elements.empties[key].hidden = rows.length > 0

      for (const row of rows) {
        const tr = doc.createElement('tr')

        const label = doc.createElement('td')
        label.className = 'table-cell-primary'
        label.textContent = labelForBreakdown(key, row)

        const count = doc.createElement('td')
        count.className = 'table-cell-muted'
        count.textContent = String(row.count)

        const total = doc.createElement('td')
        total.textContent = formatCurrency(row.totalPaise)

        const share = doc.createElement('td')
        const bar = doc.createElement('div')
        bar.className = 'report-bar'
        const fill = doc.createElement('span')
        fill.style.width = `${Math.max(2, Math.round((row.totalPaise / max) * 100))}%`
        fill.setAttribute('aria-hidden', 'true')
        bar.append(fill)
        const sr = doc.createElement('span')
        sr.className = 'sr-only'
        sr.textContent = `${Math.round((row.totalPaise / value.totalPaise) * 100)}% of total`
        share.append(bar, sr)

        tr.append(label, count, total, share)
        tr.setAttribute(
          'aria-label',
          `${labelForBreakdown(key, row)}: ${formatCurrency(row.totalPaise)} across ${row.count} receipt${row.count === 1 ? '' : 's'}`,
        )
        body.append(tr)
      }

      elements.tables[key].setAttribute('aria-label', title)
    }

    renderChart(value)
  }

  function renderChart(value: ReportSummary) {
    elements.chart.replaceChildren()
    const rows = value.byMonth.slice(-12)
    elements.chartEmpty.hidden = rows.length > 0

    if (rows.length === 0) {
      return
    }

    const max = Math.max(1, ...rows.map((row) => row.totalPaise))

    for (const row of rows) {
      const item = doc.createElement('div')
      item.className = 'chart-row'

      const label = doc.createElement('span')
      label.className = 'chart-label'
      label.textContent = formatPeriod('month', row.key)

      const bar = doc.createElement('span')
      bar.className = 'chart-bar'
      const fill = doc.createElement('span')
      fill.style.height = `${Math.max(4, Math.round((row.totalPaise / max) * 100))}%`
      bar.append(fill)

      const amount = doc.createElement('span')
      amount.className = 'chart-value'
      amount.textContent = formatCurrency(row.totalPaise)

      item.append(label, bar, amount)
      item.setAttribute(
        'aria-label',
        `${formatPeriod('month', row.key)}: ${formatCurrency(row.totalPaise)}`,
      )
      elements.chart.append(item)
    }
  }

  function render(value: ReportSummary) {
    currentSummary = value
    elements.total.textContent = formatCurrency(value.totalPaise)
    elements.count.textContent = String(value.receiptCount)
    elements.average.textContent = formatCurrency(value.averagePaise)
    elements.cancelled.textContent = String(value.cancelledCount)
    renderBreakdowns(value)

    const range = describeRange(currentFilters)
    elements.statusLine.textContent =
      value.receiptCount === 0
        ? `No active receipts ${range}.`
        : `${value.receiptCount} active receipt${value.receiptCount === 1 ? '' : 's'} ${range}.`
  }

  async function refresh(): Promise<void> {
    const current = ++requestId
    elements.error.hidden = true
    elements.root.setAttribute('aria-busy', 'true')

    try {
      currentFilters = readFilters()
      applyFiltersToPreset()
      const value = await summary(currentFilters)

      if (destroyed || current !== requestId) {
        return
      }

      render(value)
    } catch (error) {
      if (destroyed || current !== requestId) {
        return
      }

      elements.error.hidden = false
      elements.errorMessage.textContent = errorMessage(error)
      elements.statusLine.textContent = 'Report could not be loaded.'
    } finally {
      if (!destroyed && current === requestId) {
        elements.root.removeAttribute('aria-busy')
      }
    }
  }

  function applyFiltersToPreset() {
    if (elements.preset.value !== 'custom') {
      return
    }
  }

  function exportCsv() {
    if (!currentSummary) {
      return
    }

    const rows: Array<Array<string | number>> = []

    for (const [key, , title] of BREAKDOWNS) {
      rows.push([title, '', '', ''])

      for (const row of breakdownRows(key)) {
        rows.push([
          labelForBreakdown(key, row),
          row.count,
          (row.totalPaise / 100).toFixed(2),
          '',
        ])
      }

      rows.push(['', '', '', ''])
    }

    const csv = toCsv(
      ['Report', 'Receipts', 'Amount (INR)', 'Notes'],
      [
        ['Summary', currentSummary.receiptCount, (currentSummary.totalPaise / 100).toFixed(2), describeRange(currentFilters)],
        ['Average', '', (currentSummary.averagePaise / 100).toFixed(2), ''],
        ['Cancelled receipts', currentSummary.cancelledCount, '', ''],
        ...rows,
      ],
    )

    downloadTextFile(
      timestampedFilename('paynote-report', 'csv'),
      csv,
      'text/csv;charset=utf-8',
    )
  }

  function printReport() {
    if (!currentSummary) {
      return
    }

    elements.printArea.replaceChildren()
    const article = doc.createElement('article')
    article.className = 'report-sheet'

    const title = doc.createElement('h1')
    title.textContent = 'PayNote report'

    const meta = doc.createElement('p')
    meta.textContent = [
      describeRange(currentFilters),
      elements.category.value
        ? findCategory(elements.category.value)?.label ?? elements.category.value
        : 'All categories',
      elements.status.value
        ? RECEIPT_STATUS_LABELS[elements.status.value as ReceiptStatus]
        : 'All statuses',
    ].join(' · ')

    const totals = doc.createElement('dl')
    totals.className = 'receipt-sheet-meta'
    appendRow(totals, 'Total collected', formatCurrency(currentSummary.totalPaise))
    appendRow(totals, 'Receipts', String(currentSummary.receiptCount))
    appendRow(totals, 'Average', formatCurrency(currentSummary.averagePaise))
    appendRow(totals, 'Cancelled', String(currentSummary.cancelledCount))

    article.append(title, meta, totals)

    for (const [key, , heading] of BREAKDOWNS) {
      const rows = breakdownRows(key)

      if (rows.length === 0) {
        continue
      }

      const sectionTitle = doc.createElement('h2')
      sectionTitle.textContent = heading
      const table = doc.createElement('table')
      table.className = 'receipt-sheet-table'
      const head = doc.createElement('thead')
      const headRow = doc.createElement('tr')

      for (const label of ['Period', 'Receipts', 'Amount']) {
        const cell = doc.createElement('th')
        cell.textContent = label
        headRow.append(cell)
      }

      head.append(headRow)
      const body = doc.createElement('tbody')

      for (const row of rows) {
        const tr = doc.createElement('tr')
        for (const value of [
          labelForBreakdown(key, row),
          String(row.count),
          formatCurrency(row.totalPaise),
        ]) {
          const cell = doc.createElement('td')
          cell.textContent = value
          tr.append(cell)
        }
        body.append(tr)
      }

      table.append(head, body)
      article.append(sectionTitle, table)
    }

    elements.printArea.append(article)
    view?.print?.()
  }

  function handleApply() {
    elements.preset.value = 'custom'
    void refresh()
  }

  function handlePresetChange() {
    const preset = elements.preset.value as ReportPreset
    applyPreset(preset)
    void refresh()
  }

  function handleClear() {
    elements.preset.value = 'month'
    applyPreset('month')
    elements.category.value = ''
    elements.status.value = ''
    elements.customer.value = ''
    elements.property.value = ''
    elements.search.value = ''
    void refresh()
  }

  function handleRetry() {
    void refresh()
  }

  elements.apply.addEventListener('click', handleApply)
  elements.preset.addEventListener('change', handlePresetChange)
  elements.clear.addEventListener('click', handleClear)
  elements.exportCsv.addEventListener('click', exportCsv)
  elements.print.addEventListener('click', printReport)
  elements.retry.addEventListener('click', handleRetry)
  elements.from.addEventListener('change', handleApply)
  elements.to.addEventListener('change', handleApply)

  fillCategoryOptions()
  fillStatusOptions()
  elements.preset.value = 'month'
  applyPreset('month')
  currentFilters = normalizeFilters({
    fromDate: elements.from.value,
    toDate: elements.to.value,
  })
  void loadOptions().catch(() => undefined)

  const page = elements.root.closest<HTMLElement>('[data-route]')

  function onRouteChange() {
    const path = (view?.location.hash ?? '').replace(/^#/, '').split('?')[0]

    if (path === '/reports') {
      void loadOptions().catch(() => undefined)
      void refresh()
    }
  }

  view?.addEventListener('hashchange', onRouteChange)

  if (page?.hidden !== true) {
    void refresh()
  }

  return {
    refresh,
    destroy() {
      destroyed = true
      requestId += 1
      view?.removeEventListener('hashchange', onRouteChange)
    },
  }
}

function appendRow(list: HTMLElement, label: string, value: string) {
  const term = list.ownerDocument.createElement('dt')
  term.textContent = label
  const description = list.ownerDocument.createElement('dd')
  description.textContent = value
  list.append(term, description)
}

function describeRange(filters: ReportFilters): string {
  if (filters.fromDate && filters.toDate) {
    return `from ${formatDate(filters.fromDate)} to ${formatDate(filters.toDate)}`
  }

  if (filters.fromDate) {
    return `from ${formatDate(filters.fromDate)}`
  }

  if (filters.toDate) {
    return `up to ${formatDate(filters.toDate)}`
  }

  return 'across all dates'
}

function formatPeriod(kind: BreakdownKey, key: string): string {
  if (kind === 'year') {
    return key
  }

  if (kind === 'month') {
    const [year, month] = key.split('-')
    const date = new Date(Number(year), Number(month) - 1, 1)

    if (Number.isNaN(date.getTime())) {
      return key
    }

    return new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      year: 'numeric',
    }).format(date)
  }

  return formatDate(key)
}

export function reportRangeLabel(preset: ReportPreset): string {
  const range = rangeForPreset(preset)

  if (!range.fromDate || !range.toDate) {
    return 'All dates'
  }

  return `${range.fromDate === range.toDate ? '' : `${range.fromDate} to `}${range.toDate}`
}

export function todayString(now: Date = new Date()): string {
  return localDateString(now)
}
