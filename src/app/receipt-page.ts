import type {
  Customer,
  CustomerInput,
  Property,
  PropertyInput,
  Receipt,
  ReceiptInput,
  ReceiptItem,
} from '../db/types.ts'
import { buildPrintableReceipt, type PrintableReceipt } from '../domain/print.ts'
import {
  findCategory,
  paymentMethodLabel,
} from '../domain/receipt-categories.ts'
import {
  RECEIPT_STATUS_LABELS,
  nextStatuses,
  type ReceiptStatus,
} from '../domain/receipt-status.ts'
import {
  businessProfileFromSettings,
  type BusinessProfile,
} from '../domain/settings.ts'
import { amountInWords } from '../domain/words.ts'
import type { CustomerLoader } from '../services/customers.ts'
import * as customerService from '../services/customers.ts'
import type { PropertyLoader } from '../services/properties.ts'
import * as propertyService from '../services/properties.ts'
import * as receiptService from '../services/receipts.ts'
import { getAppPreferences } from '../services/preferences.ts'
import { readSettings } from '../services/settings.ts'
import { formatCurrency, formatDate, formatLabel } from '../utils/format.ts'

import { createReceiptForm, type ReceiptFormController } from './receipt-form.ts'
import {
  createReceiptList,
  statusVariant,
  type ReceiptListController,
} from './receipts.ts'

export interface ReceiptPageDeps {
  list?: typeof receiptService.listReceipts
  get?: typeof receiptService.getReceipt
  create?: typeof receiptService.createReceipt
  update?: typeof receiptService.updateReceipt
  remove?: typeof receiptService.deleteReceipt
  loadCustomers?: CustomerLoader
  loadProperties?: PropertyLoader
  createCustomer?: (input: CustomerInput) => Promise<Customer>
  createProperty?: (input: PropertyInput) => Promise<Property>
  loadBusiness?: () => Promise<BusinessProfile>
}

export interface ReceiptPageController {
  refresh(): Promise<void>
  openAdd(): void
  openEdit(id: string): Promise<void>
  openDetail(id: string): Promise<void>
  destroy(): void
}

interface PageElements {
  listContainer: HTMLElement
  addButton: HTMLButtonElement
  emptyAdd: HTMLButtonElement | null
  notice: HTMLElement | null
  formPanel: HTMLElement
  detailPanel: HTMLElement
  detailNumber: HTMLElement
  detailStatus: HTMLElement
  detailMeta: HTMLElement
  detailCategory: HTMLElement
  detailCustomer: HTMLElement
  detailProperty: HTMLElement
  detailAmount: HTMLElement
  detailWords: HTMLElement
  detailInfo: HTMLElement
  detailFields: HTMLElement
  detailFieldsSection: HTMLElement
  detailItems: HTMLTableSectionElement
  detailItemsEmpty: HTMLElement
  detailItemsTable: HTMLElement
  detailDescription: HTMLElement
  detailDescriptionSection: HTMLElement
  detailNotes: HTMLElement
  detailNotesSection: HTMLElement
  statusActions: HTMLElement
  detailEdit: HTMLButtonElement
  detailDuplicate: HTMLButtonElement
  detailDelete: HTMLButtonElement
  detailPrint: HTMLButtonElement
  detailClose: HTMLButtonElement
  deletePanel: HTMLElement
  deleteMessage: HTMLElement
  deleteConfirm: HTMLButtonElement
  deleteCancel: HTMLButtonElement
  printArea: HTMLElement
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function queryElements(doc: Document): PageElements {
  const elements: PageElements = {
    listContainer: doc.querySelector<HTMLElement>('[data-receipt-list]')!,
    addButton: doc.querySelector<HTMLButtonElement>('[data-receipt-add]')!,
    emptyAdd: doc.querySelector<HTMLButtonElement>('[data-receipt-empty-add]'),
    notice: doc.querySelector<HTMLElement>('[data-receipt-notice]'),
    formPanel: doc.querySelector<HTMLElement>('[data-receipt-form-panel]')!,
    detailPanel: doc.querySelector<HTMLElement>('[data-receipt-detail-panel]')!,
    detailNumber: doc.querySelector<HTMLElement>('[data-receipt-detail-number]')!,
    detailStatus: doc.querySelector<HTMLElement>('[data-receipt-detail-status]')!,
    detailMeta: doc.querySelector<HTMLElement>('[data-receipt-detail-meta]')!,
    detailCategory: doc.querySelector<HTMLElement>('[data-receipt-detail-category]')!,
    detailCustomer: doc.querySelector<HTMLElement>('[data-receipt-detail-customer]')!,
    detailProperty: doc.querySelector<HTMLElement>('[data-receipt-detail-property]')!,
    detailAmount: doc.querySelector<HTMLElement>('[data-receipt-detail-amount]')!,
    detailWords: doc.querySelector<HTMLElement>('[data-receipt-detail-words]')!,
    detailInfo: doc.querySelector<HTMLElement>('[data-receipt-detail-info]')!,
    detailFields: doc.querySelector<HTMLElement>('[data-receipt-detail-fields]')!,
    detailFieldsSection: doc.querySelector<HTMLElement>('[data-receipt-detail-fields-section]')!,
    detailItems: doc.querySelector<HTMLTableSectionElement>('[data-receipt-detail-items]')!,
    detailItemsEmpty: doc.querySelector<HTMLElement>('[data-receipt-detail-items-empty]')!,
    detailItemsTable: doc.querySelector<HTMLElement>('[data-receipt-detail-items-table]')!,
    detailDescription: doc.querySelector<HTMLElement>('[data-receipt-detail-description]')!,
    detailDescriptionSection: doc.querySelector<HTMLElement>(
      '[data-receipt-detail-description-section]',
    )!,
    detailNotes: doc.querySelector<HTMLElement>('[data-receipt-detail-notes]')!,
    detailNotesSection: doc.querySelector<HTMLElement>('[data-receipt-detail-notes-section]')!,
    statusActions: doc.querySelector<HTMLElement>('[data-receipt-status-actions]')!,
    detailEdit: doc.querySelector<HTMLButtonElement>('[data-receipt-detail-edit]')!,
    detailDuplicate: doc.querySelector<HTMLButtonElement>('[data-receipt-detail-duplicate]')!,
    detailDelete: doc.querySelector<HTMLButtonElement>('[data-receipt-detail-delete]')!,
    detailPrint: doc.querySelector<HTMLButtonElement>('[data-receipt-detail-print]')!,
    detailClose: doc.querySelector<HTMLButtonElement>('[data-receipt-detail-close]')!,
    deletePanel: doc.querySelector<HTMLElement>('[data-receipt-delete-panel]')!,
    deleteMessage: doc.querySelector<HTMLElement>('[data-receipt-delete-message]')!,
    deleteConfirm: doc.querySelector<HTMLButtonElement>('[data-receipt-delete-confirm]')!,
    deleteCancel: doc.querySelector<HTMLButtonElement>('[data-receipt-delete-cancel]')!,
    printArea: doc.querySelector<HTMLElement>('[data-print-receipt]')!,
  }

  for (const [name, value] of Object.entries(elements)) {
    if (value === null && name !== 'emptyAdd' && name !== 'notice') {
      throw new Error(`Receipt page markup is incomplete: ${name}.`)
    }
  }

  return elements
}

export function createReceiptPage(
  doc: Document,
  deps: ReceiptPageDeps = {},
): ReceiptPageController {
  const view = doc.defaultView
  const elements = queryElements(doc)
  const get = deps.get ?? receiptService.getReceipt
  const create = deps.create ?? receiptService.createReceipt
  const update = deps.update ?? receiptService.updateReceipt
  const remove = deps.remove ?? receiptService.deleteReceipt
  const loadCustomers = deps.loadCustomers ?? customerService.listCustomers
  const loadProperties = deps.loadProperties ?? propertyService.listProperties

  let detailId: string | null = null
  let detailReceipt: Receipt | null = null
  let deletingId: string | null = null
  let business: BusinessProfile | null = null

  const list: ReceiptListController = createReceiptList(doc, {
    load: deps.list,
    onView: (receipt) => {
      void openDetail(receipt.id)
    },
    onEdit: (receipt) => {
      void openEdit(receipt.id)
    },
    onDelete: (receipt) => {
      void confirmDelete(receipt.id)
    },
  })

  const form: ReceiptFormController = createReceiptForm(doc, {
    loadCustomers,
    loadProperties,
    createCustomer: deps.createCustomer,
    createProperty: deps.createProperty,
    onCreate: create,
    onUpdate: update,
    onSaved: (message) => {
      setNotice(message)
      showView('list')
      void list.refresh()
      view?.dispatchEvent(new CustomEvent('paynote:data-changed'))
    },
    onCancel: () => {
      showView('list')
    },
  })

  function setNotice(message: string) {
    if (!elements.notice) {
      return
    }

    elements.notice.textContent = message
    elements.notice.hidden = message === ''
  }

  async function loadListOptions() {
    try {
      const [customers, properties] = await Promise.all([
        loadCustomers({ limit: 200, offset: 0 }),
        loadProperties({ limit: 200, offset: 0 }),
      ])

      populateFilter(
        doc.querySelector<HTMLSelectElement>('[data-receipt-customer]'),
        'All customers',
        customers.items.map((customer) => ({
          value: customer.id,
          label: customer.fullName,
        })),
      )
      populateFilter(
        doc.querySelector<HTMLSelectElement>('[data-receipt-property]'),
        'All properties',
        properties.items.map((property) => ({
          value: property.id,
          label: property.name,
        })),
      )
    } catch {
      return
    }
  }

  function showView(next: 'list' | 'form' | 'detail') {
    elements.listContainer.hidden = next !== 'list'
    elements.formPanel.hidden = next !== 'form'
    elements.detailPanel.hidden = next !== 'detail'
    elements.deletePanel.hidden = true
    deletingId = null
  }

  function openAdd() {
    setNotice('')
    showView('form')
    form.openAdd()
    void form.refreshOptions()
  }

  async function openEdit(id: string) {
    try {
      const receipt = await get(id)
      setNotice('')
      showView('form')
      await form.refreshOptions()
      form.openEdit(receipt)
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function receiptToInput(receipt: Receipt, status: ReceiptStatus): ReceiptInput {
    return {
      receiptType: receipt.receiptType,
      customerId: receipt.customerId,
      propertyId: receipt.propertyId,
      receiptDate: receipt.receiptDate,
      paymentPeriod: receipt.paymentPeriod,
      amountPaise: receipt.amountPaise,
      paymentMethod: receipt.paymentMethod,
      referenceNumber: receipt.referenceNumber,
      description: receipt.description,
      notes: receipt.notes,
      status,
      details: receipt.details.map((detail) => ({
        fieldKey: detail.fieldKey,
        fieldValue: detail.fieldValue,
      })),
      items: receipt.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        ratePaise: item.ratePaise,
        discountPaise: item.discountPaise,
      })),
    }
  }

  function renderStatus(receipt: Receipt) {
    elements.detailStatus.className = `badge badge-${statusVariant(receipt.status)}`
    elements.detailStatus.textContent = RECEIPT_STATUS_LABELS[receipt.status]
    elements.statusActions.replaceChildren()

    const transitions = nextStatuses(receipt.status).filter(
      (status) => status !== receipt.status,
    )

    for (const status of transitions) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'button button-small button-secondary'
      button.textContent = `Mark ${RECEIPT_STATUS_LABELS[status].toLowerCase()}`
      button.dataset.receiptTransition = status
      button.addEventListener('click', () => {
        void changeStatus(status)
      })
      elements.statusActions.append(button)
    }

    elements.statusActions.hidden = transitions.length === 0
  }

  function renderInfo(receipt: Receipt) {
    const rows: Array<[string, string]> = [
      ['Category', findCategory(receipt.receiptType)?.label ?? formatLabel(receipt.receiptType)],
      ['Customer', receipt.customerName ?? '—'],
      ['Property', receipt.propertyName ?? '—'],
      ['Payment method', paymentMethodLabel(receipt.paymentMethod)],
      ['Receipt date', formatDate(receipt.receiptDate)],
      ['Payment period', receipt.paymentPeriod || '—'],
      ['Reference number', receipt.referenceNumber || '—'],
      ['Created', formatDate(receipt.createdAt)],
      ['Updated', formatDate(receipt.updatedAt)],
    ]

    elements.detailInfo.replaceChildren()

    for (const [label, value] of rows) {
      const row = doc.createElement('div')
      row.className = 'info-row'
      const term = doc.createElement('dt')
      term.textContent = label
      const description = doc.createElement('dd')
      description.textContent = value
      row.append(term, description)
      elements.detailInfo.append(row)
    }
  }

  function renderDetails(receipt: Receipt) {
    const category = findCategory(receipt.receiptType)
    elements.detailFields.replaceChildren()

    for (const detail of receipt.details) {
      const label =
        category?.fields.find((field) => field.key === detail.fieldKey)?.label ??
        formatLabel(detail.fieldKey)

      const row = doc.createElement('div')
      row.className = 'info-row'
      const term = doc.createElement('dt')
      term.textContent = label
      const description = doc.createElement('dd')
      description.textContent = detail.fieldValue
      row.append(term, description)
      elements.detailFields.append(row)
    }

    elements.detailFieldsSection.hidden = receipt.details.length === 0
  }

  function renderItems(receipt: Receipt) {
    elements.detailItems.replaceChildren()
    const items = receipt.items
    elements.detailItemsTable.hidden = items.length === 0
    elements.detailItemsEmpty.hidden = items.length > 0

    for (const item of items) {
      const row = doc.createElement('tr')
      const description = doc.createElement('td')
      description.className = 'table-cell-primary'
      description.textContent = item.description
      const quantity = doc.createElement('td')
      quantity.className = 'table-cell-muted'
      quantity.textContent = formatQuantity(item.quantity)
      const rate = doc.createElement('td')
      rate.textContent = formatCurrency(item.ratePaise)
      const discount = doc.createElement('td')
      discount.textContent = formatCurrency(item.discountPaise)
      const total = doc.createElement('td')
      total.textContent = formatCurrency(item.lineTotalPaise)
      row.append(description, quantity, rate, discount, total)
      elements.detailItems.append(row)
    }
  }

  function renderText(receipt: Receipt) {
    elements.detailDescription.textContent = receipt.description || ''
    elements.detailDescriptionSection.hidden = !receipt.description
    elements.detailNotes.textContent = receipt.notes || ''
    elements.detailNotesSection.hidden = !receipt.notes
  }

  function renderDetail(receipt: Receipt) {
    elements.detailNumber.textContent = receipt.receiptNumber
    elements.detailMeta.textContent = `${formatDate(receipt.receiptDate)} · ${findCategory(receipt.receiptType)?.label ?? formatLabel(receipt.receiptType)}`
    elements.detailCategory.textContent =
      findCategory(receipt.receiptType)?.label ?? formatLabel(receipt.receiptType)
    elements.detailCustomer.textContent = receipt.customerName ?? 'Walk-in'
    elements.detailProperty.textContent = receipt.propertyName ?? 'No property'
    elements.detailAmount.textContent = formatCurrency(receipt.amountPaise)
    elements.detailWords.textContent = amountInWords(receipt.amountPaise)
    renderStatus(receipt)
    renderInfo(receipt)
    renderDetails(receipt)
    renderItems(receipt)
    renderText(receipt)
  }

  async function openDetail(id: string) {
    try {
      const receipt = await get(id)
      detailId = receipt.id
      detailReceipt = receipt
      renderDetail(receipt)
      showView('detail')
      elements.detailNumber.focus?.()
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function closeDetail() {
    detailId = null
    detailReceipt = null
    showView('list')
    elements.addButton.focus?.()
  }

  async function changeStatus(status: ReceiptStatus) {
    if (!detailReceipt) {
      return
    }

    try {
      const updated = await update(
        detailReceipt.id,
        receiptToInput(detailReceipt, status),
      )
      detailReceipt = updated
      detailId = updated.id
      renderDetail(updated)
      setNotice(`Receipt ${updated.receiptNumber} marked ${RECEIPT_STATUS_LABELS[status].toLowerCase()}.`)
      await list.refresh()
      view?.dispatchEvent(new CustomEvent('paynote:data-changed'))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function confirmDelete(id: string) {
    deletingId = id
    elements.deleteMessage.textContent = 'Delete this receipt? This action cannot be undone.'
    elements.deleteConfirm.disabled = false
    elements.deletePanel.hidden = false
    elements.deleteCancel.focus?.()
  }

  function cancelDelete() {
    deletingId = null
    elements.deletePanel.hidden = true
  }

  async function deleteNow() {
    if (!deletingId || elements.deleteConfirm.disabled) {
      return
    }

    const id = deletingId
    elements.deleteConfirm.disabled = true

    try {
      await remove(id)
      deletingId = null
      elements.deletePanel.hidden = true

      if (detailId === id) {
        detailId = null
        detailReceipt = null
        showView('list')
      }

      setNotice('Receipt deleted.')
      await list.refresh()
      view?.dispatchEvent(new CustomEvent('paynote:data-changed'))
    } catch (error) {
      elements.deleteMessage.textContent = errorMessage(error)
      elements.deleteConfirm.disabled = false
    }
  }

  async function loadBusiness(): Promise<BusinessProfile> {
    if (business) {
      return business
    }

    if (deps.loadBusiness) {
      business = await deps.loadBusiness()
    } else {
      try {
        business = businessProfileFromSettings(await readSettings())
      } catch {
        business = { name: '', address: '', phone: '', email: '', logo: '' }
      }
    }

    return business
  }

  async function printReceipt() {
    if (!detailReceipt) {
      return
    }

    try {
      const printable = buildPrintableReceipt(detailReceipt, await loadBusiness())
      renderPrint(printable)
      view?.print?.()
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function renderPrint(printable: PrintableReceipt) {
    elements.printArea.replaceChildren()
    const sheet = doc.createElement('article')
    sheet.className = 'receipt-sheet'

    const header = doc.createElement('header')
    header.className = 'receipt-sheet-header'

    if (printable.business.logo) {
      const logo = doc.createElement('img')
      logo.className = 'receipt-sheet-logo'
      logo.src = printable.business.logo
      logo.alt = ''
      header.append(logo)
    } else if (printable.propertyType) {
      header.append(createPropertyIcon(doc, printable.propertyType))
    }

    const title = doc.createElement('h1')
    title.textContent = 'Receipt'
    const subtitle = doc.createElement('h2')
    subtitle.textContent = printable.category
    const tagline = doc.createElement('p')
    tagline.textContent = 'Official Payment Acknowledgement'

    const meta = doc.createElement('div')
    meta.className = 'receipt-sheet-meta'
    const metaReceipt = doc.createElement('div')
    const metaReceiptLabel = doc.createElement('strong')
    metaReceiptLabel.textContent = 'Receipt No.: '
    metaReceipt.append(metaReceiptLabel, printable.receiptNumber)
    const metaDate = doc.createElement('div')
    const metaDateLabel = doc.createElement('strong')
    metaDateLabel.textContent = 'Date: '
    metaDate.append(metaDateLabel, formatDate(printable.receiptDate))
    meta.append(metaReceipt, metaDate)

    header.append(title, subtitle, tagline, meta)
    sheet.append(header)

    function appendSectionTitle(text: string) {
      const heading = doc.createElement('div')
      heading.className = 'receipt-sheet-section-title'
      heading.textContent = text
      sheet.append(heading)
    }

    function appendDetailLine(container: HTMLElement, text: string) {
      const line = doc.createElement('p')
      line.textContent = text
      container.append(line)
    }

    const parties = doc.createElement('div')
    parties.className = 'receipt-sheet-parties'

    const issuerBox = doc.createElement('section')
    issuerBox.className = 'receipt-sheet-party-box'
    const issuerHeading = doc.createElement('div')
    issuerHeading.className = 'receipt-sheet-box-title'
    issuerHeading.textContent = 'Issued By'
    const issuer = doc.createElement('div')
    issuer.className = 'receipt-sheet-details'
    const issuerName = doc.createElement('strong')
    issuerName.textContent = printable.business.name || 'PayNote'
    issuer.append(issuerName)

    for (const line of [
      printable.business.address,
      [printable.business.phone, printable.business.email].filter(Boolean).join(' · '),
      [printable.business.website, printable.business.taxRegistration]
        .filter(Boolean)
        .join(' · '),
    ].filter(Boolean)) {
      appendDetailLine(issuer, line)
    }

    issuerBox.append(issuerHeading, issuer)

    const receiverBox = doc.createElement('section')
    receiverBox.className = 'receipt-sheet-party-box'
    const receiverHeading = doc.createElement('div')
    receiverHeading.className = 'receipt-sheet-box-title'
    receiverHeading.textContent = 'Received From'
    const receiver = doc.createElement('div')
    receiver.className = 'receipt-sheet-details'
    const receiverName = doc.createElement('strong')
    receiverName.textContent = printable.customerName || 'Walk-in'
    receiver.append(receiverName)

    if (printable.propertyName) {
      appendDetailLine(receiver, `Property: ${printable.propertyName}`)
    }

    receiverBox.append(receiverHeading, receiver)
    parties.append(issuerBox, receiverBox)
    sheet.append(parties)

    appendSectionTitle('Payment Details')
    const table = doc.createElement('table')
    table.className = 'receipt-sheet-table'
    const head = doc.createElement('thead')
    const headRow = doc.createElement('tr')

    for (const label of ['Particulars', 'Details']) {
      const cell = doc.createElement('th')
      cell.textContent = label
      headRow.append(cell)
    }

    head.append(headRow)
    const body = doc.createElement('tbody')
    const skipLabels = new Set<string>()

    function appendPaymentRow(label: string, value: string) {
      const row = doc.createElement('tr')
      const term = doc.createElement('td')
      term.textContent = label
      const description = doc.createElement('td')
      description.textContent = value
      row.append(term, description)
      body.append(row)
      skipLabels.add(label.toLowerCase())
    }

    appendPaymentRow('Amount Received', formatCurrency(printable.totalPaise))
    appendPaymentRow('Amount in Words', printable.amountWords)
    appendPaymentRow('Category', printable.category)

    if (printable.propertyName) {
      appendPaymentRow('Property', printable.propertyName)
    }

    const period = printable.details.find((detail) =>
      detail.label.toLowerCase().includes('period'),
    )

    if (period) {
      appendPaymentRow('Payment Period', period.value)
    }

    appendPaymentRow('Payment Mode', printable.paymentMethod)

    if (printable.referenceNumber) {
      appendPaymentRow('Reference', printable.referenceNumber)
    }

    appendPaymentRow('Payment Status', printable.status)

    for (const detail of printable.details) {
      if (!skipLabels.has(detail.label.toLowerCase())) {
        appendPaymentRow(detail.label, detail.value)
      }
    }

    table.append(head, body)
    sheet.append(table)

    if (printable.items.length > 0) {
      appendSectionTitle('Line Items')
      const itemsTable = doc.createElement('table')
      itemsTable.className = 'receipt-sheet-table receipt-sheet-items-table'
      const itemsHead = doc.createElement('thead')
      const itemsHeadRow = doc.createElement('tr')

      for (const label of ['Description', 'Qty', 'Rate', 'Discount', 'Total']) {
        const cell = doc.createElement('th')
        cell.textContent = label
        itemsHeadRow.append(cell)
      }

      itemsHead.append(itemsHeadRow)
      const itemsBody = doc.createElement('tbody')

      for (const item of printable.items) {
        const row = doc.createElement('tr')
        for (const value of [
          item.description,
          formatQuantity(item.quantity),
          formatCurrency(item.ratePaise),
          formatCurrency(item.discountPaise),
          formatCurrency(item.lineTotalPaise),
        ]) {
          const cell = doc.createElement('td')
          cell.textContent = value
          row.append(cell)
        }
        itemsBody.append(row)
      }

      itemsTable.append(itemsHead, itemsBody)
      sheet.append(itemsTable)
    }

    const amountBox = doc.createElement('div')
    amountBox.className = 'receipt-sheet-amount-box'
    const amount = doc.createElement('div')
    amount.className = 'receipt-sheet-amount'
    amount.textContent = formatCurrency(printable.totalPaise)
    const amountLabel = doc.createElement('p')
    amountLabel.textContent = 'Total Amount Received'
    amountBox.append(amount, amountLabel)
    sheet.append(amountBox)

    function appendNote(label: string, value: string) {
      const block = doc.createElement('section')
      block.className = 'receipt-sheet-note-section'
      const heading = doc.createElement('h3')
      heading.textContent = label
      const text = doc.createElement('p')
      text.textContent = value
      block.append(heading, text)
      sheet.append(block)
    }

    if (printable.description) {
      appendNote('Description', printable.description)
    }

    if (printable.notes) {
      appendNote('Notes', printable.notes)
    }

    const acknowledgement = doc.createElement('div')
    acknowledgement.className = 'receipt-sheet-acknowledgement'
    acknowledgement.textContent = `I hereby acknowledge receipt of the above-mentioned amount from ${
      printable.customerName || 'the customer'
    }${printable.propertyName ? ` for ${printable.propertyName}` : ''} towards ${printable.category.toLowerCase()}.`
    sheet.append(acknowledgement)

    const signature = doc.createElement('div')
    signature.className = 'receipt-sheet-signature'

    if (printable.business.signature) {
      const signatureImage = doc.createElement('img')
      signatureImage.className = 'receipt-sheet-signature-image'
      signatureImage.src = printable.business.signature
      signatureImage.alt = ''
      signature.append(signatureImage)
    }

    const signatureLine = doc.createElement('hr')
    const signatureTitle = doc.createElement('strong')
    signatureTitle.textContent = 'Authorised Signatory'
    signature.append(
      signatureLine,
      signatureTitle,
      doc.createElement('br'),
      printable.business.name || 'PayNote',
    )
    sheet.append(signature)

    const footer = doc.createElement('footer')
    footer.className = 'receipt-sheet-footer'
    footer.textContent =
      getAppPreferences().footerMessage || 'Thank you for your payment.'
    sheet.append(footer)

    elements.printArea.append(sheet)
  }

  function handleAddFromDetail() {
    if (!detailReceipt) {
      openAdd()
      return
    }

    showView('form')
    form.openDuplicate(detailReceipt)
    void form.refreshOptions()
  }

  function handleRouteChange() {
    const path = (view?.location.hash ?? '').replace(/^#/, '').split('?')[0]

    if (path === '/receipts/new') {
      openAdd()
      void loadListOptions()
    } else if (path === '/receipts') {
      void loadListOptions()
      void list.refresh()
    }
  }

  function handleDataChanged() {
    business = null
    void loadListOptions()
    void list.refresh()
  }

  function handleOpenReceipt(event: Event) {
    const id = (event as CustomEvent<string>).detail

    if (id) {
      void openDetail(id)
    }
  }

  elements.addButton.addEventListener('click', openAdd)
  elements.emptyAdd?.addEventListener('click', openAdd)
  elements.detailClose.addEventListener('click', closeDetail)
  elements.detailEdit.addEventListener('click', () => {
    if (detailId) {
      void openEdit(detailId)
    }
  })
  elements.detailDelete.addEventListener('click', () => {
    if (detailId) {
      confirmDelete(detailId)
    }
  })
  elements.detailDuplicate.addEventListener('click', handleAddFromDetail)
  elements.detailPrint.addEventListener('click', () => {
    void printReceipt()
  })
  elements.deleteCancel.addEventListener('click', cancelDelete)
  elements.deleteConfirm.addEventListener('click', () => {
    void deleteNow()
  })
  view?.addEventListener('hashchange', handleRouteChange)
  view?.addEventListener('paynote:data-changed', handleDataChanged)
  view?.addEventListener('paynote:open-receipt', handleOpenReceipt)

  handleRouteChange()
  void loadListOptions()

  return {
    refresh: () => list.refresh(),
    openAdd,
    openEdit,
    openDetail,
    destroy() {
      list.destroy()
      form.destroy()
      view?.removeEventListener('hashchange', handleRouteChange)
      view?.removeEventListener('paynote:data-changed', handleDataChanged)
      view?.removeEventListener('paynote:open-receipt', handleOpenReceipt)
    },
  }
}

function populateFilter(
  select: HTMLSelectElement | null,
  placeholder: string,
  options: Array<{ value: string; label: string }>,
) {
  if (!select) {
    return
  }

  const current = select.value
  select.replaceChildren()
  const empty = select.ownerDocument.createElement('option')
  empty.value = ''
  empty.textContent = placeholder
  select.append(empty)

  for (const option of options) {
    const element = select.ownerDocument.createElement('option')
    element.value = option.value
    element.textContent = option.label
    select.append(element)
  }

  if (current && options.some((option) => option.value === current)) {
    select.value = current
  }
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function createPropertyIcon(doc: Document, propertyType: string): SVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'receipt-sheet-icon')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.6')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')

  const paths =
    propertyType === 'godown'
      ? ['M3 21V9l9-5 9 5v12', 'M7 21v-7h10v7', 'M7 17h10']
      : ['M3 10.5 12 3l9 7.5V21H3z', 'M9 21v-6h6v6']

  for (const d of paths) {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }

  return svg
}

export function receiptStatusOptions(): Array<{ value: ReceiptStatus; label: string }> {
  return (['draft', 'issued', 'paid', 'cancelled'] as ReceiptStatus[]).map(
    (status) => ({ value: status, label: RECEIPT_STATUS_LABELS[status] }),
  )
}

export function receiptItemTotal(item: ReceiptItem): number {
  return item.lineTotalPaise
}
