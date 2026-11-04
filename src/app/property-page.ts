import type {
  Property,
  PropertyDetail,
  PropertyInput,
} from '../db/types.ts'
import type { PropertyLoader } from '../services/properties.ts'
import * as propertyService from '../services/properties.ts'
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
  hasErrors,
  validatePropertyForm,
  type PropertyFormValues,
} from './form-validation.ts'
import { createPropertyList } from './properties.ts'

export interface PropertyPageDeps {
  load?: PropertyLoader
  get?: (id: string) => Promise<Property>
  getDetail?: (id: string) => Promise<PropertyDetail>
  create?: (input: PropertyInput) => Promise<Property>
  update?: (id: string, input: PropertyInput) => Promise<Property>
  remove?: (id: string) => Promise<void>
}

export interface PropertyPageController {
  refresh(): Promise<void>
  openAdd(): void
  openEdit(id: string): Promise<void>
  openDetail(id: string): Promise<void>
  destroy(): void
}

interface PropertyPageElements {
  listContainer: HTMLElement
  addButton: HTMLButtonElement
  formPanel: HTMLElement
  formTitle: HTMLElement
  form: HTMLFormElement
  saveButton: HTMLButtonElement
  cancelButton: HTMLButtonElement
  detailPanel: HTMLElement
  detailName: HTMLElement
  detailMeta: HTMLElement
  detailInfo: HTMLElement
  detailStats: HTMLElement
  detailCustomers: HTMLElement
  detailCustomersEmpty: HTMLElement
  detailReceipts: HTMLTableSectionElement
  detailReceiptsEmpty: HTMLElement
  detailEdit: HTMLButtonElement
  detailDelete: HTMLButtonElement
  detailClose: HTMLButtonElement
  deletePanel: HTMLElement
  deleteMessage: HTMLElement
  deleteConfirm: HTMLButtonElement
  deleteCancel: HTMLButtonElement
  emptyAdd: HTMLButtonElement | null
  notice: HTMLElement | null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function queryElements(doc: Document): PropertyPageElements {
  const listContainer = doc.querySelector<HTMLElement>('[data-property-list]')
  const addButton = doc.querySelector<HTMLButtonElement>('[data-property-add]')
  const formPanel = doc.querySelector<HTMLElement>('[data-property-form-panel]')
  const formTitle = doc.querySelector<HTMLElement>('[data-property-form-title]')
  const form = doc.querySelector<HTMLFormElement>('[data-property-form]')
  const saveButton = doc.querySelector<HTMLButtonElement>('[data-property-save]')
  const cancelButton =
    doc.querySelector<HTMLButtonElement>('[data-property-cancel]')
  const detailPanel = doc.querySelector<HTMLElement>(
    '[data-property-detail-panel]',
  )
  const detailName = doc.querySelector<HTMLElement>(
    '[data-property-detail-name]',
  )
  const detailMeta = doc.querySelector<HTMLElement>(
    '[data-property-detail-meta]',
  )
  const detailInfo = doc.querySelector<HTMLElement>(
    '[data-property-detail-info]',
  )
  const detailStats = doc.querySelector<HTMLElement>(
    '[data-property-detail-stats]',
  )
  const detailCustomers = doc.querySelector<HTMLElement>(
    '[data-property-detail-customers]',
  )
  const detailCustomersEmpty = doc.querySelector<HTMLElement>(
    '[data-property-detail-customers-empty]',
  )
  const detailReceipts = doc.querySelector<HTMLTableSectionElement>(
    '[data-property-detail-receipts]',
  )
  const detailReceiptsEmpty = doc.querySelector<HTMLElement>(
    '[data-property-detail-empty]',
  )
  const detailEdit = doc.querySelector<HTMLButtonElement>(
    '[data-property-detail-edit]',
  )
  const detailDelete = doc.querySelector<HTMLButtonElement>(
    '[data-property-detail-delete]',
  )
  const detailClose = doc.querySelector<HTMLButtonElement>(
    '[data-property-detail-close]',
  )
  const deletePanel = doc.querySelector<HTMLElement>(
    '[data-property-delete-panel]',
  )
  const deleteMessage = doc.querySelector<HTMLElement>(
    '[data-property-delete-message]',
  )
  const deleteConfirm = doc.querySelector<HTMLButtonElement>(
    '[data-property-delete-confirm]',
  )
  const deleteCancel = doc.querySelector<HTMLButtonElement>(
    '[data-property-delete-cancel]',
  )

  if (
    !listContainer ||
    !addButton ||
    !formPanel ||
    !formTitle ||
    !form ||
    !saveButton ||
    !cancelButton ||
    !detailPanel ||
    !detailName ||
    !detailMeta ||
    !detailInfo ||
    !detailStats ||
    !detailCustomers ||
    !detailCustomersEmpty ||
    !detailReceipts ||
    !detailReceiptsEmpty ||
    !detailEdit ||
    !detailDelete ||
    !detailClose ||
    !deletePanel ||
    !deleteMessage ||
    !deleteConfirm ||
    !deleteCancel
  ) {
    throw new Error('Property page markup is incomplete.')
  }

  return {
    listContainer,
    addButton,
    formPanel,
    formTitle,
    form,
    saveButton,
    cancelButton,
    detailPanel,
    detailName,
    detailMeta,
    detailInfo,
    detailStats,
    detailCustomers,
    detailCustomersEmpty,
    detailReceipts,
    detailReceiptsEmpty,
    detailEdit,
    detailDelete,
    detailClose,
    deletePanel,
    deleteMessage,
    deleteConfirm,
    deleteCancel,
    emptyAdd: doc.querySelector<HTMLButtonElement>('[data-property-empty-add]'),
    notice: doc.querySelector<HTMLElement>('[data-property-notice]'),
  }
}

export function createPropertyPage(
  doc: Document,
  deps: PropertyPageDeps = {},
): PropertyPageController {
  const view = doc.defaultView
  const elements = queryElements(doc)
  const get = deps.get ?? propertyService.getProperty
  const getDetail = deps.getDetail ?? propertyService.getPropertyDetail
  const create = deps.create ?? propertyService.createProperty
  const update = deps.update ?? propertyService.updateProperty
  const remove = deps.remove ?? propertyService.deleteProperty

  let editingId: string | null = null
  let detailId: string | null = null
  let deletingId: string | null = null
  let submitting = false

  const list = createPropertyList(doc, {
    load: deps.load,
    onView: (property) => {
      void openDetail(property.id)
    },
    onEdit: (property) => {
      void openEdit(property.id)
    },
    onDelete: (property) => {
      void confirmDelete(property.id)
    },
  })

  function setNotice(message: string) {
    if (!elements.notice) {
      return
    }

    elements.notice.textContent = message
    elements.notice.hidden = message === ''
  }

  function showView(view: 'list' | 'form' | 'detail') {
    elements.listContainer.hidden = view !== 'list'
    elements.formPanel.hidden = view !== 'form'
    elements.detailPanel.hidden = view !== 'detail'
    elements.deletePanel.hidden = true
    deletingId = null
  }

  function openAdd() {
    editingId = null
    setNotice('')
    elements.formTitle.textContent = 'Add property'
    elements.saveButton.textContent = 'Save property'
    setFormValues(doc, 'property', {
      name: '',
      propertyType: 'house',
      propertyNumber: '',
      address: '',
      description: '',
      notes: '',
    })
    clearFormErrors(doc, 'property')
    showView('form')
    focusFirstField(doc, 'name', 'property')
  }

  function populateForm(property: Property) {
    editingId = property.id
    setNotice('')
    elements.formTitle.textContent = 'Edit property'
    elements.saveButton.textContent = 'Save changes'
    setFormValues(doc, 'property', {
      name: property.name,
      propertyType: property.propertyType,
      propertyNumber: property.propertyNumber ?? '',
      address: property.address ?? '',
      description: property.description ?? '',
      notes: property.notes ?? '',
    })
    clearFormErrors(doc, 'property')
    showView('form')
    focusFirstField(doc, 'name', 'property')
  }

  async function openEdit(id: string) {
    try {
      populateForm(await get(id))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function renderDetailInfo(detail: PropertyDetail) {
    const { property } = detail

    elements.detailName.textContent = property.name
    elements.detailMeta.textContent = `Added ${formatDate(property.createdAt)} · Updated ${formatDate(property.updatedAt)}`
    elements.detailInfo.replaceChildren()

    const rows: Array<[string, string]> = [
      ['Type', formatLabel(property.propertyType)],
      ['Property number', property.propertyNumber || '—'],
      ['Address', property.address || '—'],
      ['Description', property.description || '—'],
      ['Notes', property.notes || '—'],
    ]

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

  function renderDetailStats(detail: PropertyDetail) {
    elements.detailStats.replaceChildren()

    const stats: Array<[string, string]> = [
      ['Receipts', String(detail.receiptCount)],
      ['Total collected', formatCurrency(detail.totalPaise)],
      ['Customers', String(detail.customers.length)],
    ]

    for (const [label, value] of stats) {
      const stat = doc.createElement('div')
      stat.className = 'stat'
      const statValue = doc.createElement('span')
      statValue.className = 'stat-value'
      statValue.textContent = value
      const statLabel = doc.createElement('span')
      statLabel.className = 'stat-label'
      statLabel.textContent = label
      stat.append(statValue, statLabel)
      elements.detailStats.append(stat)
    }
  }

  function renderLinkedCustomers(detail: PropertyDetail) {
    elements.detailCustomers.replaceChildren()
    elements.detailCustomersEmpty.hidden = detail.customers.length > 0

    for (const customer of detail.customers) {
      const row = doc.createElement('div')
      row.className = 'info-row'
      const term = doc.createElement('dt')
      term.textContent = customer.fullName
      const description = doc.createElement('dd')
      description.textContent = `${customer.receiptCount} receipt${customer.receiptCount === 1 ? '' : 's'} · ${formatCurrency(customer.totalPaise)}`
      row.append(term, description)
      elements.detailCustomers.append(row)
    }
  }

  function renderDetailReceipts(detail: PropertyDetail) {
    elements.detailReceipts.replaceChildren()
    elements.detailReceiptsEmpty.hidden = detail.recentReceipts.length > 0

    for (const receipt of detail.recentReceipts) {
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
      const amount = doc.createElement('td')
      amount.textContent = formatCurrency(receipt.amountPaise)
      row.append(number, date, customer, amount)
      elements.detailReceipts.append(row)
    }
  }

  async function openDetail(id: string) {
    try {
      const detail = await getDetail(id)
      detailId = detail.property.id
      renderDetailInfo(detail)
      renderDetailStats(detail)
      renderLinkedCustomers(detail)
      renderDetailReceipts(detail)
      showView('detail')
      focusElement(elements.detailName)
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function closeDetail() {
    detailId = null
    showView('list')
    focusElement(elements.addButton)
  }

  async function confirmDelete(id: string) {
    deletingId = id
    elements.deleteMessage.textContent = 'Checking linked records…'
    elements.deleteConfirm.disabled = true
    elements.deletePanel.hidden = false
    focusElement(elements.deleteCancel)

    try {
      const detail = await getDetail(id)
      const name = detail.property.name

      if (detail.receiptCount > 0) {
        elements.deleteMessage.textContent = `${name} has ${detail.receiptCount} linked receipt${detail.receiptCount === 1 ? '' : 's'}. Delete or reassign those receipts before deleting this property.`
        elements.deleteConfirm.disabled = true
      } else {
        elements.deleteMessage.textContent = `Delete ${name}? This action cannot be undone.`
        elements.deleteConfirm.disabled = false
      }
    } catch (error) {
      elements.deleteMessage.textContent = errorMessage(error)
      elements.deleteConfirm.disabled = true
    }
  }

  function cancelDelete() {
    deletingId = null
    elements.deletePanel.hidden = true
    focusElement(elements.addButton)
  }

  async function confirmDeleteNow() {
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
        showView('list')
      }

      setNotice('Property deleted.')
      focusElement(elements.addButton)
      await list.refresh()
    } catch (error) {
      elements.deleteMessage.textContent = errorMessage(error)
      elements.deleteConfirm.disabled = false
    }
  }

  function handleSubmit(event?: Event) {
    event?.preventDefault()

    if (submitting) {
      return
    }

    const values = readFormValues(doc, 'property')
    const formValues: PropertyFormValues = {
      name: values.name ?? '',
      propertyType: values.propertyType ?? '',
      propertyNumber: values.propertyNumber ?? '',
      address: values.address ?? '',
      description: values.description ?? '',
      notes: values.notes ?? '',
    }
    const errors = validatePropertyForm(formValues)

    if (hasErrors(errors)) {
      showFormErrors(doc, 'property', errors)
      focusFirstField(doc, Object.keys(errors)[0] ?? 'name', 'property')
      return
    }

    submitting = true
    elements.saveButton.disabled = true
    clearFormErrors(doc, 'property')

    const input: PropertyInput = {
      name: formValues.name,
      propertyType: formValues.propertyType as Property['propertyType'],
      propertyNumber: formValues.propertyNumber,
      address: formValues.address,
      description: formValues.description,
      notes: formValues.notes,
    }

    void (async () => {
      try {
        if (editingId) {
          await update(editingId, input)
          setNotice('Property updated.')
        } else {
          await create(input)
          setNotice('Property created.')
        }

        editingId = null
        showView('list')
        await list.refresh()
      } catch (error) {
        showFormError(doc, 'property', errorMessage(error))
      } finally {
        submitting = false
        elements.saveButton.disabled = false
      }
    })()
  }

  function handleProfileChanged() {
    editingId = null
    detailId = null
    deletingId = null
    submitting = false
    elements.saveButton.disabled = false
    setNotice('')
    showView('list')
    void list.refresh()
  }

  elements.addButton.addEventListener('click', openAdd)
  elements.emptyAdd?.addEventListener('click', openAdd)
  elements.cancelButton.addEventListener('click', () => {
    editingId = null
    showView('list')
    focusElement(elements.addButton)
  })
  elements.form.addEventListener('submit', handleSubmit)
  elements.detailClose.addEventListener('click', closeDetail)
  elements.detailEdit.addEventListener('click', () => {
    if (detailId) {
      void openEdit(detailId)
    }
  })
  elements.detailDelete.addEventListener('click', () => {
    if (detailId) {
      void confirmDelete(detailId)
    }
  })
  elements.deleteCancel.addEventListener('click', cancelDelete)
  elements.deleteConfirm.addEventListener('click', () => {
    void confirmDeleteNow()
  })
  view?.addEventListener('paynote:profile-changed', handleProfileChanged)

  return {
    refresh: () => list.refresh(),
    openAdd,
    openEdit,
    openDetail,
    destroy() {
      list.destroy()
      view?.removeEventListener('paynote:profile-changed', handleProfileChanged)
      elements.addButton.removeEventListener('click', openAdd)
      elements.emptyAdd?.removeEventListener('click', openAdd)
    },
  }
}
