import type {
  Customer,
  CustomerInput,
  Property,
  PropertyInput,
  Receipt,
} from '../db/types.ts'
import {
  findCategory,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RECEIPT_CATEGORIES,
} from '../domain/receipt-categories.ts'
import {
  buildReceiptInput,
  itemsTotalPaise,
  parsePositiveAmount,
  validateReceiptForm,
  type ReceiptFormValues,
  type ReceiptItemFormValue,
} from '../domain/receipt-form.ts'
import {
  nextStatuses,
  RECEIPT_STATUS_LABELS,
  type ReceiptStatus,
} from '../domain/receipt-status.ts'
import { amountInWords } from '../domain/words.ts'
import type { CustomerLoader } from '../services/customers.ts'
import type { PropertyLoader } from '../services/properties.ts'
import { getAppPreferences } from '../services/preferences.ts'
import { formatCurrency, formatDate, formatLabel } from '../utils/format.ts'

import {
  clearFormErrors,
  focusElement,
  focusFirstField,
  readFormValues,
  setFormValues,
  showFormError,
  showFormErrors,
} from './form-dom.ts'
import {
  clearReceiptDraft,
  loadReceiptDraft,
  saveReceiptDraft,
} from './receipt-draft.ts'

const DRAFT_DELAY_MS = 500

export interface ReceiptFormDeps {
  loadCustomers?: CustomerLoader
  loadProperties?: PropertyLoader
  createCustomer?: (input: CustomerInput) => Promise<Customer>
  createProperty?: (input: PropertyInput) => Promise<Property>
  onCreate?: (input: ReturnType<typeof buildReceiptInput>) => Promise<Receipt>
  onUpdate?: (
    id: string,
    input: ReturnType<typeof buildReceiptInput>,
  ) => Promise<Receipt>
  onSaved?: (message: string) => void
  onCancel?: () => void
}

export interface ReceiptFormController {
  openAdd(prefill?: PrefillValues, notice?: string): void
  openEdit(receipt: Receipt): void
  openDuplicate(receipt: Receipt): void
  getEditingId(): string | null
  isOpen(): boolean
  readValues(): ReceiptFormValues
  totalPaise(): number
  refreshOptions(): Promise<void>
  reset(): void
  destroy(): void
}

export interface PrefillValues {
  receiptType?: string
  customerId?: string
  propertyId?: string
  status?: ReceiptStatus
}

interface FormElements {
  panel: HTMLElement
  title: HTMLElement
  form: HTMLFormElement
  save: HTMLButtonElement
  cancel: HTMLButtonElement
  category: HTMLSelectElement
  customer: HTMLSelectElement
  property: HTMLSelectElement
  date: HTMLInputElement
  amount: HTMLInputElement
  paymentMethod: HTMLSelectElement
  status: HTMLSelectElement
  details: HTMLElement
  items: HTMLElement
  addItem: HTMLButtonElement
  subtotal: HTMLElement | null
  discount: HTMLElement | null
  total: HTMLElement | null
  words: HTMLElement | null
  draftStatus: HTMLElement | null
  notice: HTMLElement | null
  customerNew: HTMLButtonElement | null
  customerPanel: HTMLElement | null
  customerName: HTMLInputElement | null
  customerPhone: HTMLInputElement | null
  customerSave: HTMLButtonElement | null
  customerCancel: HTMLButtonElement | null
  customerError: HTMLElement | null
  propertyNew: HTMLButtonElement | null
  propertyPanel: HTMLElement | null
  propertyName: HTMLInputElement | null
  propertyType: HTMLSelectElement | null
  propertySave: HTMLButtonElement | null
  propertyCancel: HTMLButtonElement | null
  propertyError: HTMLElement | null
}

function queryElements(doc: Document): FormElements {
  const elements: FormElements = {
    panel: doc.querySelector<HTMLElement>('[data-receipt-form-panel]')!,
    title: doc.querySelector<HTMLElement>('[data-receipt-form-title]')!,
    form: doc.querySelector<HTMLFormElement>('[data-receipt-form]')!,
    save: doc.querySelector<HTMLButtonElement>('[data-receipt-save]')!,
    cancel: doc.querySelector<HTMLButtonElement>('[data-receipt-cancel]')!,
    category: doc.querySelector<HTMLSelectElement>('[data-receipt-input="receiptType"]')!,
    customer: doc.querySelector<HTMLSelectElement>('[data-receipt-input="customerId"]')!,
    property: doc.querySelector<HTMLSelectElement>('[data-receipt-input="propertyId"]')!,
    date: doc.querySelector<HTMLInputElement>('[data-receipt-input="receiptDate"]')!,
    amount: doc.querySelector<HTMLInputElement>('[data-receipt-input="amount"]')!,
    paymentMethod: doc.querySelector<HTMLSelectElement>('[data-receipt-input="paymentMethod"]')!,
    status: doc.querySelector<HTMLSelectElement>('[data-receipt-input="status"]')!,
    details: doc.querySelector<HTMLElement>('[data-receipt-details]')!,
    items: doc.querySelector<HTMLElement>('[data-receipt-items]')!,
    addItem: doc.querySelector<HTMLButtonElement>('[data-receipt-add-item]')!,
    subtotal: doc.querySelector<HTMLElement>('[data-receipt-subtotal]'),
    discount: doc.querySelector<HTMLElement>('[data-receipt-discount]'),
    total: doc.querySelector<HTMLElement>('[data-receipt-total]'),
    words: doc.querySelector<HTMLElement>('[data-receipt-words]'),
    draftStatus: doc.querySelector<HTMLElement>('[data-receipt-draft-status]'),
    notice: doc.querySelector<HTMLElement>('[data-receipt-form-notice]'),
    customerNew: doc.querySelector<HTMLButtonElement>('[data-receipt-customer-new]'),
    customerPanel: doc.querySelector<HTMLElement>('[data-receipt-customer-panel]'),
    customerName: doc.querySelector<HTMLInputElement>('[data-receipt-customer-name]'),
    customerPhone: doc.querySelector<HTMLInputElement>('[data-receipt-customer-phone]'),
    customerSave: doc.querySelector<HTMLButtonElement>('[data-receipt-customer-save]'),
    customerCancel: doc.querySelector<HTMLButtonElement>('[data-receipt-customer-cancel]'),
    customerError: doc.querySelector<HTMLElement>('[data-receipt-customer-error]'),
    propertyNew: doc.querySelector<HTMLButtonElement>('[data-receipt-property-new]'),
    propertyPanel: doc.querySelector<HTMLElement>('[data-receipt-property-panel]'),
    propertyName: doc.querySelector<HTMLInputElement>('[data-receipt-property-name]'),
    propertyType: doc.querySelector<HTMLSelectElement>('[data-receipt-property-type]'),
    propertySave: doc.querySelector<HTMLButtonElement>('[data-receipt-property-save]'),
    propertyCancel: doc.querySelector<HTMLButtonElement>('[data-receipt-property-cancel]'),
    propertyError: doc.querySelector<HTMLElement>('[data-receipt-property-error]'),
  }

  const required: Array<[keyof FormElements, unknown]> = [
    ['panel', elements.panel],
    ['title', elements.title],
    ['form', elements.form],
    ['save', elements.save],
    ['cancel', elements.cancel],
    ['category', elements.category],
    ['customer', elements.customer],
    ['property', elements.property],
    ['date', elements.date],
    ['amount', elements.amount],
    ['paymentMethod', elements.paymentMethod],
    ['status', elements.status],
    ['details', elements.details],
    ['items', elements.items],
    ['addItem', elements.addItem],
  ]

  for (const [name, value] of required) {
    if (!value) {
      throw new Error(`Receipt form markup is incomplete: ${String(name)}.`)
    }
  }

  return elements
}

export function createReceiptForm(
  doc: Document,
  deps: ReceiptFormDeps,
): ReceiptFormController {
  const view = doc.defaultView
  const elements = queryElements(doc)

  let editingId: string | null = null
  let dirty = false
  let draftTimer: ReturnType<typeof setTimeout> | undefined
  let submitting = false
  let open = false
  let customers: Customer[] = []
  let properties: Property[] = []

  function setNotice(message: string) {
    if (elements.notice) {
      elements.notice.textContent = message
      elements.notice.hidden = message === ''
    }
  }

  function setDraftStatus(message: string) {
    if (elements.draftStatus) {
      elements.draftStatus.textContent = message
      elements.draftStatus.hidden = message === ''
    }
  }

  function populateSelect(
    select: HTMLSelectElement,
    options: Array<{ value: string; label: string }>,
    placeholder: string,
    selected?: string,
  ) {
    const desired = selected ?? select.value
    select.replaceChildren()

    const empty = doc.createElement('option')
    empty.value = ''
    empty.textContent = placeholder
    select.append(empty)

    for (const option of options) {
      const element = doc.createElement('option')
      element.value = option.value
      element.textContent = option.label
      select.append(element)
    }

    if (desired && options.some((option) => option.value === desired)) {
      select.value = desired
    } else {
      select.value = ''
    }
  }

  async function refreshOptions(): Promise<void> {
    const [customerResult, propertyResult] = await Promise.all([
      deps.loadCustomers
        ? deps.loadCustomers({ limit: 200, offset: 0 })
        : Promise.resolve({ items: [], total: 0, limit: 0, offset: 0 }),
      deps.loadProperties
        ? deps.loadProperties({ limit: 200, offset: 0 })
        : Promise.resolve({ items: [], total: 0, limit: 0, offset: 0 }),
    ])

    customers = customerResult.items
    properties = propertyResult.items

    populateSelect(
      elements.customer,
      customers.map((customer) => ({
        value: customer.id,
        label: customer.phone
          ? `${customer.fullName} · ${customer.phone}`
          : customer.fullName,
      })),
      'No customer',
    )
    populateSelect(
      elements.property,
      properties.map((property) => ({
        value: property.id,
        label: `${property.name} (${formatLabel(property.propertyType)})`,
      })),
      'No property',
    )
  }

  function renderCategoryFields(details: Record<string, string> = {}) {
    elements.details.replaceChildren()
    const category = findCategory(elements.category.value)

    if (!category || category.fields.length === 0) {
      const empty = doc.createElement('p')
      empty.className = 'field-hint'
      empty.textContent = category
        ? 'No extra fields are needed for this category.'
        : 'Choose a category to see its fields.'
      elements.details.append(empty)
      return
    }

    for (const field of category.fields) {
      const label = doc.createElement('label')
      label.className = field.type === 'textarea' ? 'field span-2' : 'field'

      const labelText = doc.createElement('span')
      labelText.className = 'field-label'
      labelText.textContent = field.required ? `${field.label} *` : field.label

      const input =
        field.type === 'textarea'
          ? doc.createElement('textarea')
          : doc.createElement('input')

      input.className = field.type === 'textarea' ? 'input input-textarea' : 'input'
      input.dataset.receiptDetail = field.key
      input.value = details[field.key] ?? ''

      if (input instanceof doc.defaultView!.HTMLInputElement) {
        input.type = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'
        if (field.placeholder) {
          input.placeholder = field.placeholder
        }
        if (field.maxLength) {
          input.maxLength = field.maxLength
        }
      }

      const error = doc.createElement('span')
      error.className = 'field-error'
      error.dataset.receiptDetailError = field.key
      error.hidden = true

      label.append(labelText, input, error)
      elements.details.append(label)
    }
  }

  function createItemRow(item?: ReceiptItemFormValue): HTMLElement {
    const row = doc.createElement('div')
    row.className = 'line-item-row'
    row.dataset.receiptItem = ''

    const fields: Array<[keyof ReceiptItemFormValue, string, string, string]> = [
      ['description', 'Description', 'text', 'Item description'],
      ['quantity', 'Qty', 'number', '1'],
      ['rate', 'Rate', 'number', '0.00'],
      ['discount', 'Discount', 'number', '0.00'],
    ]

    for (const [key, labelText, type, placeholder] of fields) {
      const label = doc.createElement('label')
      label.className = key === 'description' ? 'field field-grow' : 'field field-compact'

      const labelSpan = doc.createElement('span')
      labelSpan.className = 'field-label'
      labelSpan.textContent = labelText

      const input = doc.createElement('input')
      input.className = 'input'
      input.type = type
      input.placeholder = placeholder
      input.value = item?.[key] ?? ''
      input.dataset.receiptItemField = key

      if (type === 'number') {
        input.step = key === 'quantity' ? '0.001' : '0.01'
        input.min = '0'
      }

      input.addEventListener('input', () => {
        markDirty()
        updateTotals()
      })

      label.append(labelSpan, input)
      row.append(label)
    }

    const actions = doc.createElement('div')
    actions.className = 'line-item-actions'

    const up = doc.createElement('button')
    up.type = 'button'
    up.className = 'button button-small button-secondary'
    up.textContent = '↑'
    up.setAttribute('aria-label', 'Move item up')
    up.addEventListener('click', () => {
      const previous = row.previousElementSibling

      if (previous) {
        elements.items.insertBefore(row, previous)
        markDirty()
        updateTotals()
      }
    })

    const down = doc.createElement('button')
    down.type = 'button'
    down.className = 'button button-small button-secondary'
    down.textContent = '↓'
    down.setAttribute('aria-label', 'Move item down')
    down.addEventListener('click', () => {
      const next = row.nextElementSibling

      if (next) {
        elements.items.insertBefore(next, row)
        markDirty()
        updateTotals()
      }
    })

    const remove = doc.createElement('button')
    remove.type = 'button'
    remove.className = 'button button-small button-secondary'
    remove.textContent = 'Remove'
    remove.addEventListener('click', () => {
      row.remove()
      markDirty()
      updateTotals()
    })

    actions.append(up, down, remove)
    row.append(actions)

    return row
  }

  function renderItems(items: ReceiptItemFormValue[] = []) {
    elements.items.replaceChildren()

    for (const item of items) {
      elements.items.append(createItemRow(item))
    }
  }

  function readItems(): ReceiptItemFormValue[] {
    const items: ReceiptItemFormValue[] = []

    for (const row of elements.items.querySelectorAll<HTMLElement>('[data-receipt-item]')) {
      const value = (field: keyof ReceiptItemFormValue): string =>
        row.querySelector<HTMLInputElement>(`[data-receipt-item-field="${field}"]`)?.value ?? ''

      items.push({
        description: value('description'),
        quantity: value('quantity'),
        rate: value('rate'),
        discount: value('discount'),
      })
    }

    return items
  }

  function readDetails(): Record<string, string> {
    const details: Record<string, string> = {}

    for (const element of elements.details.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      '[data-receipt-detail]',
    )) {
      const key = element.dataset.receiptDetail

      if (key) {
        details[key] = element.value
      }
    }

    return details
  }

  function currentTotal(): number {
    const items = readItems().filter(
      (item) =>
        item.description.trim() !== '' ||
        item.quantity.trim() !== '' ||
        item.rate.trim() !== '' ||
        item.discount.trim() !== '',
    )

    if (items.length > 0) {
      return itemsTotalPaise(items)
    }

    return parsePositiveAmount(elements.amount.value) || 0
  }

  function updateTotals() {
    const items = readItems().filter(
      (item) =>
        item.description.trim() !== '' ||
        item.quantity.trim() !== '' ||
        item.rate.trim() !== '' ||
        item.discount.trim() !== '',
    )
    const usingItems = items.length > 0
    const total = usingItems ? itemsTotalPaise(items) : parsePositiveAmount(elements.amount.value) || 0

    if (usingItems) {
      elements.amount.value = (total / 100).toFixed(2)
      elements.amount.readOnly = true
    } else {
      elements.amount.readOnly = false
    }

    const computed = usingItems
      ? items.reduce(
          (totals, item) => {
            const quantity = Number(item.quantity) || 0
            const rate = parsePositiveAmount(item.rate) || 0
            const discount = parsePositiveAmount(item.discount) || 0
            const gross = Math.round(quantity * rate)
            totals.subtotal += gross
            totals.discount += discount
            return totals
          },
          { subtotal: 0, discount: 0 },
        )
      : { subtotal: total, discount: 0 }

    if (elements.subtotal) {
      elements.subtotal.textContent = formatCurrency(computed.subtotal)
    }

    if (elements.discount) {
      elements.discount.textContent = formatCurrency(computed.discount)
    }

    if (elements.total) {
      elements.total.textContent = formatCurrency(total)
    }

    if (elements.words) {
      elements.words.textContent = amountInWords(total)
    }
  }

  function markDirty() {
    dirty = true
    scheduleDraft()
  }

  function scheduleDraft() {
    if (editingId || !open) {
      return
    }

    if (draftTimer !== undefined) {
      clearTimeout(draftTimer)
    }

    draftTimer = setTimeout(() => {
      draftTimer = undefined
      saveReceiptDraft(readValues())
      setDraftStatus('Draft saved automatically.')
    }, DRAFT_DELAY_MS)
  }

  function statusOptions(status?: ReceiptStatus) {
    const statuses = status ? nextStatuses(status) : (['draft', 'issued', 'paid'] as ReceiptStatus[])
    elements.status.replaceChildren()

    for (const value of statuses) {
      const option = doc.createElement('option')
      option.value = value
      option.textContent = RECEIPT_STATUS_LABELS[value]
      elements.status.append(option)
    }

    elements.status.value = status ?? 'issued'
  }

  function resetForm() {
    editingId = null
    dirty = false
    setFormValues(doc, 'receipt', {
      receiptType: 'rent',
      customerId: '',
      propertyId: '',
      receiptDate: formatDateInput(new Date()),
      paymentPeriod: '',
      paymentMethod: getAppPreferences().defaultPaymentMethod,
      referenceNumber: '',
      description: '',
      notes: '',
      status: 'issued',
      amount: '',
    })
    statusOptions()
    renderCategoryFields()
    renderItems()
    clearFormErrors(doc, 'receipt')
    updateTotals()
    elements.save.disabled = false
    elements.customerPanel && (elements.customerPanel.hidden = true)
    elements.propertyPanel && (elements.propertyPanel.hidden = true)
  }

  function applyValues(values: Partial<ReceiptFormValues>) {
    setFormValues(doc, 'receipt', {
      receiptType: values.receiptType ?? 'rent',
      customerId: values.customerId ?? '',
      propertyId: values.propertyId ?? '',
      receiptDate: values.receiptDate ?? formatDateInput(new Date()),
      paymentPeriod: values.paymentPeriod ?? '',
      paymentMethod: values.paymentMethod ?? getAppPreferences().defaultPaymentMethod,
      referenceNumber: values.referenceNumber ?? '',
      description: values.description ?? '',
      notes: values.notes ?? '',
      status: values.status ?? 'issued',
      amount: values.amount ?? '',
    })

    if (values.receiptType) {
      elements.category.value = values.receiptType
    }

    renderCategoryFields(values.details)
    renderItems(values.items)
    updateTotals()

    if (values.customerId) {
      elements.customer.value = values.customerId
    }

    if (values.propertyId) {
      elements.property.value = values.propertyId
    }
  }

  function openAdd(prefill: PrefillValues = {}, notice = '') {
    open = true
    resetForm()
    elements.panel.hidden = false
    elements.title.textContent = 'New receipt'
    elements.save.textContent = 'Save receipt'
    setNotice(notice)

    if (prefill.receiptType) {
      elements.category.value = prefill.receiptType
      renderCategoryFields()
    }

    if (prefill.customerId) {
      elements.customer.value = prefill.customerId
    }

    if (prefill.propertyId) {
      elements.property.value = prefill.propertyId
    }

    statusOptions(prefill.status)

    const draft = notice === '' ? loadReceiptDraft() : null

    if (draft) {
      applyValues(draft.values)
      setDraftStatus(`Recovered a draft saved ${formatDate(draft.savedAt)}.`)
      setNotice('A saved draft was restored. Review it before saving.')
    } else {
      setDraftStatus('')
    }

    dirty = false
    focusFirstField(doc, 'receiptType', 'receipt')
  }

  function openEdit(receipt: Receipt) {
    open = true
    resetForm()
    editingId = receipt.id
    elements.panel.hidden = false
    elements.title.textContent = `Edit ${receipt.receiptNumber}`
    elements.save.textContent = 'Save changes'
    setNotice('The receipt number stays the same when you edit.')
    setDraftStatus('')
    statusOptions(receipt.status)
    applyValues({
      receiptType: receipt.receiptType,
      customerId: receipt.customerId ?? '',
      propertyId: receipt.propertyId ?? '',
      receiptDate: receipt.receiptDate,
      paymentPeriod: receipt.paymentPeriod ?? '',
      paymentMethod: receipt.paymentMethod,
      referenceNumber: receipt.referenceNumber ?? '',
      description: receipt.description ?? '',
      notes: receipt.notes ?? '',
      status: receipt.status,
      amount: (receipt.amountPaise / 100).toFixed(2),
      details: Object.fromEntries(
        receipt.details.map((detail) => [detail.fieldKey, detail.fieldValue]),
      ),
      items: receipt.items.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        rate: (item.ratePaise / 100).toFixed(2),
        discount: (item.discountPaise / 100).toFixed(2),
      })),
    })
    elements.customer.value = receipt.customerId ?? ''
    elements.property.value = receipt.propertyId ?? ''
    dirty = false
    focusFirstField(doc, 'receiptType', 'receipt')
  }

  function openDuplicate(receipt: Receipt) {
    openAdd(
      {
        receiptType: receipt.receiptType,
        customerId: receipt.customerId ?? '',
        propertyId: receipt.propertyId ?? '',
        status: 'draft',
      },
      `Duplicated from ${receipt.receiptNumber}. Saving creates a new receipt number.`,
    )
    applyValues({
      receiptType: receipt.receiptType,
      customerId: receipt.customerId ?? '',
      propertyId: receipt.propertyId ?? '',
      receiptDate: formatDateInput(new Date()),
      paymentPeriod: receipt.paymentPeriod ?? '',
      paymentMethod: receipt.paymentMethod,
      referenceNumber: receipt.referenceNumber ?? '',
      description: receipt.description ?? '',
      notes: receipt.notes ?? '',
      status: 'draft',
      amount: (receipt.amountPaise / 100).toFixed(2),
      details: Object.fromEntries(
        receipt.details.map((detail) => [detail.fieldKey, detail.fieldValue]),
      ),
      items: receipt.items.map((item) => ({
        description: item.description,
        quantity: String(item.quantity),
        rate: (item.ratePaise / 100).toFixed(2),
        discount: (item.discountPaise / 100).toFixed(2),
      })),
    })
    elements.status.value = 'draft'
    dirty = true
  }

  function readValues(): ReceiptFormValues {
    const values = readFormValues(doc, 'receipt')

    return {
      receiptType: values.receiptType ?? '',
      customerId: values.customerId ?? '',
      propertyId: values.propertyId ?? '',
      receiptDate: values.receiptDate ?? '',
      paymentPeriod: values.paymentPeriod ?? '',
      paymentMethod: values.paymentMethod ?? '',
      referenceNumber: values.referenceNumber ?? '',
      description: values.description ?? '',
      notes: values.notes ?? '',
      status: values.status ?? '',
      amount: values.amount ?? '',
      details: readDetails(),
      items: readItems(),
    }
  }

  function handleSubmit(event?: Event) {
    event?.preventDefault()

    if (submitting) {
      return
    }

    const values = readValues()
    const total = currentTotal()
    const errors = validateReceiptForm(values, total)

    if (Object.keys(errors).length > 0) {
      showFormErrors(doc, 'receipt', errors)

      for (const [key, message] of Object.entries(errors)) {
        if (key.startsWith('detail.')) {
          const field = key.slice('detail.'.length)
          const element = elements.details.querySelector<HTMLElement>(
            `[data-receipt-detail-error="${field}"]`,
          )

          if (element) {
            element.textContent = message
            element.hidden = false
          }
        }
      }

      focusFirstField(doc, Object.keys(errors)[0] ?? 'receiptType', 'receipt')
      return
    }

    submitting = true
    elements.save.disabled = true
    clearFormErrors(doc, 'receipt')
    const input = buildReceiptInput(values, total)

    void (async () => {
      try {
        if (editingId) {
          const updated = await deps.onUpdate?.(editingId, input)

          if (!updated) {
            throw new Error('The receipt could not be saved.')
          }

          deps.onSaved?.(`Receipt ${updated.receiptNumber} updated.`)
        } else {
          const created = await deps.onCreate?.(input)

          if (!created) {
            throw new Error('The receipt could not be saved.')
          }

          deps.onSaved?.(`Receipt ${created.receiptNumber} created.`)
        }

        clearReceiptDraft()
        dirty = false
        open = false
        editingId = null
        elements.panel.hidden = true
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'The receipt could not be saved.'
        showFormError(doc, 'receipt', message)
      } finally {
        submitting = false
        elements.save.disabled = false
      }
    })()
  }

  function handleCancel() {
    if (dirty && !globalThis.confirm('Discard the unsaved receipt?')) {
      return
    }

    dirty = false
    open = false
    editingId = null
    elements.panel.hidden = true
    deps.onCancel?.()
  }

  function handleCategoryChange() {
    const values = readDetails()
    renderCategoryFields(values)
    markDirty()
  }

  function handleFieldChange() {
    markDirty()
    updateTotals()
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!dirty || !open) {
      return
    }

    event.preventDefault()
    event.returnValue = ''
  }

  async function saveInlineCustomer() {
    const name = elements.customerName?.value.trim() ?? ''
    const phone = elements.customerPhone?.value.trim() ?? ''

    if (!name) {
      if (elements.customerError) {
        elements.customerError.textContent = 'Customer name is required.'
        elements.customerError.hidden = false
      }
      return
    }

    if (!deps.createCustomer) {
      if (elements.customerError) {
        elements.customerError.textContent = 'Customer creation is unavailable.'
        elements.customerError.hidden = false
      }
      return
    }

    try {
      const customer = await deps.createCustomer({ fullName: name, phone })
      await refreshOptions()
      elements.customer.value = customer.id

      if (elements.customerPanel) {
        elements.customerPanel.hidden = true
      }

      if (elements.customerError) {
        elements.customerError.hidden = true
      }

      markDirty()
    } catch (error) {
      if (elements.customerError) {
        elements.customerError.textContent =
          error instanceof Error ? error.message : 'The customer could not be created.'
        elements.customerError.hidden = false
      }
    }
  }

  async function saveInlineProperty() {
    const name = elements.propertyName?.value.trim() ?? ''
    const propertyType = elements.propertyType?.value ?? 'house'

    if (!name) {
      if (elements.propertyError) {
        elements.propertyError.textContent = 'Property name is required.'
        elements.propertyError.hidden = false
      }
      return
    }

    if (!deps.createProperty) {
      if (elements.propertyError) {
        elements.propertyError.textContent = 'Property creation is unavailable.'
        elements.propertyError.hidden = false
      }
      return
    }

    try {
      const property = await deps.createProperty({
        name,
        propertyType: propertyType as Property['propertyType'],
      })
      await refreshOptions()
      elements.property.value = property.id

      if (elements.propertyPanel) {
        elements.propertyPanel.hidden = true
      }

      if (elements.propertyError) {
        elements.propertyError.hidden = true
      }

      markDirty()
    } catch (error) {
      if (elements.propertyError) {
        elements.propertyError.textContent =
          error instanceof Error ? error.message : 'The property could not be created.'
        elements.propertyError.hidden = false
      }
    }
  }

  elements.category.addEventListener('change', handleCategoryChange)

  for (const element of elements.form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    '[data-receipt-input]',
  )) {
    element.addEventListener('input', handleFieldChange)
    element.addEventListener('change', handleFieldChange)
  }

  elements.amount.addEventListener('input', updateTotals)
  elements.addItem.addEventListener('click', () => {
    elements.items.append(createItemRow())
    markDirty()
    updateTotals()
    const rows = elements.items.querySelectorAll<HTMLElement>('[data-receipt-item]')
    const last = rows[rows.length - 1]
    last?.querySelector<HTMLInputElement>('[data-receipt-item-field="description"]')?.focus()
  })
  elements.form.addEventListener('submit', handleSubmit)
  elements.cancel.addEventListener('click', handleCancel)
  elements.customerNew?.addEventListener('click', () => {
    if (elements.customerPanel) {
      elements.customerPanel.hidden = false
      focusElement(elements.customerName)
    }
  })
  elements.customerCancel?.addEventListener('click', () => {
    if (elements.customerPanel) {
      elements.customerPanel.hidden = true
    }
  })
  elements.customerSave?.addEventListener('click', () => void saveInlineCustomer())
  elements.propertyNew?.addEventListener('click', () => {
    if (elements.propertyPanel) {
      elements.propertyPanel.hidden = false
      focusElement(elements.propertyName)
    }
  })
  elements.propertyCancel?.addEventListener('click', () => {
    if (elements.propertyPanel) {
      elements.propertyPanel.hidden = true
    }
  })
  elements.propertySave?.addEventListener('click', () => void saveInlineProperty())
  view?.addEventListener('beforeunload', handleBeforeUnload)

  renderCategoryFields()
  statusOptions()

  return {
    openAdd,
    openEdit,
    openDuplicate,
    getEditingId: () => editingId,
    isOpen: () => open,
    readValues,
    totalPaise: currentTotal,
    refreshOptions,
    reset: resetForm,
    destroy() {
      if (draftTimer !== undefined) {
        clearTimeout(draftTimer)
      }

      view?.removeEventListener('beforeunload', handleBeforeUnload)
    },
  }
}

function formatDateInput(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function receiptCategoryOptions(): Array<{ value: string; label: string }> {
  return RECEIPT_CATEGORIES.map((category) => ({
    value: category.value,
    label: category.label,
  }))
}

export function paymentMethodOptions(): Array<{ value: string; label: string }> {
  return PAYMENT_METHODS.map((method) => ({
    value: method,
    label: PAYMENT_METHOD_LABELS[method],
  }))
}
