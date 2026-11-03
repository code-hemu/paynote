import type { ReceiptSummary } from '../db/types.ts'
import { RECEIPT_STATUS_LABELS } from '../domain/receipt-status.ts'
import { rangeForPreset, type ReportSummary } from '../domain/reports.ts'
import type { ReceiptLoader } from '../services/receipts.ts'
import * as receiptService from '../services/receipts.ts'
import * as reportService from '../services/reports.ts'
import { formatCurrency, formatDate, formatLabel } from '../utils/format.ts'

import { statusVariant } from './receipts.ts'

export interface DashboardDeps {
  summary?: typeof reportService.getReportSummary
  list?: ReceiptLoader
}

export interface DashboardController {
  refresh(): Promise<void>
  destroy(): void
}

interface DashboardElements {
  root: HTMLElement
  todayTotal: HTMLElement
  todayCount: HTMLElement
  monthTotal: HTMLElement
  monthCount: HTMLElement
  yearTotal: HTMLElement
  yearCount: HTMLElement
  allTotal: HTMLElement
  allCount: HTMLElement
  average: HTMLElement
  cancelled: HTMLElement
  recent: HTMLTableSectionElement
  recentEmpty: HTMLElement
  recentTable: HTMLElement
  error: HTMLElement
  errorMessage: HTMLElement
  retry: HTMLButtonElement
  newReceipt: HTMLButtonElement | null
  status: HTMLElement
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The dashboard could not be loaded.'
}

function queryElements(doc: Document): DashboardElements {
  return {
    root: doc.querySelector<HTMLElement>('[data-dashboard]')!,
    todayTotal: doc.querySelector<HTMLElement>('[data-dashboard-today-total]')!,
    todayCount: doc.querySelector<HTMLElement>('[data-dashboard-today-count]')!,
    monthTotal: doc.querySelector<HTMLElement>('[data-dashboard-month-total]')!,
    monthCount: doc.querySelector<HTMLElement>('[data-dashboard-month-count]')!,
    yearTotal: doc.querySelector<HTMLElement>('[data-dashboard-year-total]')!,
    yearCount: doc.querySelector<HTMLElement>('[data-dashboard-year-count]')!,
    allTotal: doc.querySelector<HTMLElement>('[data-dashboard-all-total]')!,
    allCount: doc.querySelector<HTMLElement>('[data-dashboard-all-count]')!,
    average: doc.querySelector<HTMLElement>('[data-dashboard-average]')!,
    cancelled: doc.querySelector<HTMLElement>('[data-dashboard-cancelled]')!,
    recent: doc.querySelector<HTMLTableSectionElement>('[data-dashboard-recent]')!,
    recentEmpty: doc.querySelector<HTMLElement>('[data-dashboard-recent-empty]')!,
    recentTable: doc.querySelector<HTMLElement>('[data-dashboard-recent-table]')!,
    error: doc.querySelector<HTMLElement>('[data-dashboard-error-panel]')!,
    errorMessage: doc.querySelector<HTMLElement>('[data-dashboard-error-message]')!,
    retry: doc.querySelector<HTMLButtonElement>('[data-dashboard-retry]')!,
    newReceipt: doc.querySelector<HTMLButtonElement>('[data-dashboard-new]'),
    status: doc.querySelector<HTMLElement>('[data-dashboard-status]')!,
  }
}

export function createDashboard(
  doc: Document,
  deps: DashboardDeps = {},
): DashboardController {
  const elements = queryElements(doc)
  const summary = deps.summary ?? reportService.getReportSummary
  const list = deps.list ?? receiptService.listReceipts
  const view = doc.defaultView
  let requestId = 0
  let destroyed = false

  function setStat(
    total: HTMLElement,
    count: HTMLElement,
    value: ReportSummary,
  ) {
    total.textContent = formatCurrency(value.totalPaise)
    count.textContent = `${value.receiptCount} receipt${value.receiptCount === 1 ? '' : 's'}`
  }

  function renderRecent(items: ReceiptSummary[]) {
    elements.recent.replaceChildren()
    elements.recentTable.hidden = items.length === 0
    elements.recentEmpty.hidden = items.length > 0

    for (const receipt of items) {
      const row = doc.createElement('tr')

      const number = doc.createElement('td')
      number.className = 'table-cell-primary'
      const link = doc.createElement('button')
      link.type = 'button'
      link.className = 'link-button'
      link.textContent = receipt.receiptNumber
      link.addEventListener('click', () => {
        view?.location.assign('#/receipts')
        view?.dispatchEvent(
          new CustomEvent('paynote:open-receipt', { detail: receipt.id }),
        )
      })
      number.append(link)

      const date = doc.createElement('td')
      date.className = 'table-cell-muted'
      date.textContent = formatDate(receipt.receiptDate)

      const customer = doc.createElement('td')
      customer.className = 'table-cell-muted'
      customer.textContent = receipt.customerName ?? '—'

      const type = doc.createElement('td')
      type.className = 'table-cell-muted'
      type.textContent = formatLabel(receipt.receiptType)

      const amount = doc.createElement('td')
      amount.textContent = formatCurrency(receipt.amountPaise)

      const status = doc.createElement('td')
      const badge = doc.createElement('span')
      badge.className = `badge badge-${statusVariant(receipt.status)}`
      badge.textContent = RECEIPT_STATUS_LABELS[receipt.status]
      status.append(badge)

      row.append(number, date, customer, type, amount, status)
      elements.recent.append(row)
    }
  }

  async function refresh(): Promise<void> {
    const current = ++requestId
    elements.error.hidden = true
    elements.status.textContent = 'Loading dashboard…'
    elements.root.setAttribute('aria-busy', 'true')

    try {
      const [today, month, year, all, recent] = await Promise.all([
        summary(rangeForPreset('today')),
        summary(rangeForPreset('month')),
        summary(rangeForPreset('year')),
        summary(),
        list({ limit: 6, offset: 0 }),
      ])

      if (destroyed || current !== requestId) {
        return
      }

      setStat(elements.todayTotal, elements.todayCount, today)
      setStat(elements.monthTotal, elements.monthCount, month)
      setStat(elements.yearTotal, elements.yearCount, year)
      setStat(elements.allTotal, elements.allCount, all)
      elements.average.textContent = formatCurrency(all.averagePaise)
      elements.cancelled.textContent = String(all.cancelledCount)
      renderRecent(recent.items)
      elements.status.textContent = all.receiptCount === 0
        ? 'No receipts yet. Create your first receipt to populate the dashboard.'
        : 'Dashboard up to date.'
    } catch (error) {
      if (destroyed || current !== requestId) {
        return
      }

      elements.error.hidden = false
      elements.errorMessage.textContent = errorMessage(error)
      elements.status.textContent = 'Dashboard could not be loaded.'
    } finally {
      if (!destroyed && current === requestId) {
        elements.root.removeAttribute('aria-busy')
      }
    }
  }

  elements.retry.addEventListener('click', () => {
    void refresh()
  })
  elements.newReceipt?.addEventListener('click', () => {
    view?.location.assign('#/receipts/new')
  })

  function onRouteChange() {
    const path = (view?.location.hash ?? '').replace(/^#/, '').split('?')[0]

    if (path === '/' || path === '') {
      void refresh()
    }
  }

  function onDataChanged() {
    const path = (view?.location.hash ?? '').replace(/^#/, '').split('?')[0]

    if (path === '/' || path === '') {
      void refresh()
    }
  }

  view?.addEventListener('hashchange', onRouteChange)
  view?.addEventListener('paynote:data-changed', onDataChanged)

  if (elements.root.closest<HTMLElement>('[data-route]')?.hidden !== true) {
    void refresh()
  }

  return {
    refresh,
    destroy() {
      destroyed = true
      requestId += 1
      view?.removeEventListener('hashchange', onRouteChange)
      view?.removeEventListener('paynote:data-changed', onDataChanged)
    },
  }
}
