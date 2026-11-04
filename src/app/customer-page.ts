import type {
  Customer,
  CustomerDetail,
  CustomerInput,
} from '../db/types.ts'
import type { CustomerLoader } from '../services/customers.ts'
import * as customerService from '../services/customers.ts'
import { formatCurrency, formatDate, formatLabel } from '../utils/format.ts'

import { createCustomerList } from './customers.ts'
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
  validateCustomerForm,
  type CustomerFormValues,
} from './form-validation.ts'

export interface CustomerPageDeps {
  load?: CustomerLoader
  get?: (id: string) => Promise<Customer>
  getDetail?: (id: string) => Promise<CustomerDetail>
  nameTaken?: (name: string, excludeId?: string | null) => Promise<boolean>
  create?: (input: CustomerInput) => Promise<Customer>
  update?: (id: string, input: CustomerInput) => Promise<Customer>
  remove?: (id: string) => Promise<void>
}

export interface CustomerPageController {
  refresh(): Promise<void>
  openAdd(): void
  openEdit(id: string): Promise<void>
  openDetail(id: string): Promise<void>
  destroy(): void
}

interface CustomerPageElements {
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
  detailReceipts: HTMLTableSectionElement
  detailEmpty: HTMLElement
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

function queryElements(doc: Document): CustomerPageElements {
  const listContainer = doc.querySelector<HTMLElement>('[data-customer-list]')
  const addButton = doc.querySelector<HTMLButtonElement>('[data-customer-add]')
  const formPanel = doc.querySelector<HTMLElement>('[data-customer-form-panel]')
  const formTitle = doc.querySelector<HTMLElement>('[data-customer-form-title]')
  const form = doc.querySelector<HTMLFormElement>('[data-customer-form]')
  const saveButton = doc.querySelector<HTMLButtonElement>('[data-customer-save]')
  const cancelButton =
    doc.querySelector<HTMLButtonElement>('[data-customer-cancel]')
  const detailPanel = doc.querySelector<HTMLElement>(
    '[data-customer-detail-panel]',
  )
  const detailName = doc.querySelector<HTMLElement>(
    '[data-customer-detail-name]',
  )
  const detailMeta = doc.querySelector<HTMLElement>(
    '[data-customer-detail-meta]',
  )
  const detailInfo = doc.querySelector<HTMLElement>(
    '[data-customer-detail-info]',
  )
  const detailStats = doc.querySelector<HTMLElement>(
    '[data-customer-detail-stats]',
  )
  const detailReceipts = doc.querySelector<HTMLTableSectionElement>(
    '[data-customer-detail-receipts]',
  )
  const detailEmpty = doc.querySelector<HTMLElement>(
    '[data-customer-detail-empty]',
  )
  const detailEdit = doc.querySelector<HTMLButtonElement>(
    '[data-customer-detail-edit]',
  )
  const detailDelete = doc.querySelector<HTMLButtonElement>(
    '[data-customer-detail-delete]',
  )
  const detailClose = doc.querySelector<HTMLButtonElement>(
    '[data-customer-detail-close]',
  )
  const deletePanel = doc.querySelector<HTMLElement>(
    '[data-customer-delete-panel]',
  )
  const deleteMessage = doc.querySelector<HTMLElement>(
    '[data-customer-delete-message]',
  )
  const deleteConfirm = doc.querySelector<HTMLButtonElement>(
    '[data-customer-delete-confirm]',
  )
  const deleteCancel = doc.querySelector<HTMLButtonElement>(
    '[data-customer-delete-cancel]',
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
    !detailReceipts ||
    !detailEmpty ||
    !detailEdit ||
    !detailDelete ||
    !detailClose ||
    !deletePanel ||
    !deleteMessage ||
    !deleteConfirm ||
    !deleteCancel
  ) {
    throw new Error('Customer page markup is incomplete.')
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
    detailReceipts,
    detailEmpty,
    detailEdit,
    detailDelete,
    detailClose,
    deletePanel,
    deleteMessage,
    deleteConfirm,
    deleteCancel,
    emptyAdd: doc.querySelector<HTMLButtonElement>('[data-customer-empty-add]'),
    notice: doc.querySelector<HTMLElement>('[data-customer-notice]'),
  }
}

export function createCustomerPage(
  doc: Document,
  deps: CustomerPageDeps = {},
): CustomerPageController {
  const view = doc.defaultView
  const elements = queryElements(doc)
  const get = deps.get ?? customerService.getCustomer
  const getDetail = deps.getDetail ?? customerService.getCustomerDetail
  const nameTaken = deps.nameTaken ?? customerService.isCustomerNameTaken
  const create = deps.create ?? customerService.createCustomer
  const update = deps.update ?? customerService.updateCustomer
  const remove = deps.remove ?? customerService.deleteCustomer

  let editingId: string | null = null
  let detailId: string | null = null
  let deletingId: string | null = null
  let submitting = false

  const list = createCustomerList(doc, {
    load: deps.load,
    onView: (customer) => {
      void openDetail(customer.id)
    },
    onEdit: (customer) => {
      void openEdit(customer.id)
    },
    onDelete: (customer) => {
      void confirmDelete(customer.id)
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
    elements.formTitle.textContent = 'Add customer'
    elements.saveButton.textContent = 'Save customer'
    setFormValues(doc, 'customer', {
      fullName: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
    })
    clearFormErrors(doc, 'customer')
    showView('form')
    focusFirstField(doc, 'fullName', 'customer')
  }

  function populateForm(customer: Customer) {
    editingId = customer.id
    setNotice('')
    elements.formTitle.textContent = 'Edit customer'
    elements.saveButton.textContent = 'Save changes'
    setFormValues(doc, 'customer', {
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    })
    clearFormErrors(doc, 'customer')
    showView('form')
    focusFirstField(doc, 'fullName', 'customer')
  }

  async function openEdit(id: string) {
    try {
      populateForm(await get(id))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function renderDetailInfo(detail: CustomerDetail) {
    const { customer } = detail

    elements.detailName.textContent = customer.fullName
    elements.detailMeta.textContent = `Added ${formatDate(customer.createdAt)} · Updated ${formatDate(customer.updatedAt)}`
    elements.detailInfo.replaceChildren()

    const rows: Array<[string, string]> = [
      ['Phone', customer.phone || '—'],
      ['Email', customer.email || '—'],
      ['Address', customer.address || '—'],
      ['Notes', customer.notes || '—'],
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

  function renderDetailStats(detail: CustomerDetail) {
    elements.detailStats.replaceChildren()

    const stats: Array<[string, string]> = [
      ['Receipts', String(detail.receiptCount)],
      ['Total paid', formatCurrency(detail.totalPaise)],
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

  function renderDetailReceipts(detail: CustomerDetail) {
    elements.detailReceipts.replaceChildren()
    elements.detailEmpty.hidden = detail.recentReceipts.length > 0

    for (const receipt of detail.recentReceipts) {
      const row = doc.createElement('tr')
      const number = doc.createElement('td')
      number.className = 'table-cell-primary'
      number.textContent = receipt.receiptNumber
      const date = doc.createElement('td')
      date.className = 'table-cell-muted'
      date.textContent = formatDate(receipt.receiptDate)
      const type = doc.createElement('td')
      type.className = 'table-cell-muted'
      type.textContent = formatLabel(receipt.receiptType)
      const amount = doc.createElement('td')
      amount.textContent = formatCurrency(receipt.amountPaise)
      row.append(number, date, type, amount)
      elements.detailReceipts.append(row)
    }
  }

  async function openDetail(id: string) {
    try {
      const detail = await getDetail(id)
      detailId = detail.customer.id
      renderDetailInfo(detail)
      renderDetailStats(detail)
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
      const name = detail.customer.fullName

      if (detail.receiptCount > 0) {
        elements.deleteMessage.textContent = `${name} has ${detail.receiptCount} linked receipt${detail.receiptCount === 1 ? '' : 's'}. Delete or reassign those receipts before deleting this customer.`
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

      setNotice('Customer deleted.')
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

    const values = readFormValues(doc, 'customer')
    const formValues: CustomerFormValues = {
      fullName: values.fullName ?? '',
      phone: values.phone ?? '',
      email: values.email ?? '',
      address: values.address ?? '',
      notes: values.notes ?? '',
    }
    const errors = validateCustomerForm(formValues)

    if (hasErrors(errors)) {
      showFormErrors(doc, 'customer', errors)
      focusFirstField(doc, Object.keys(errors)[0] ?? 'fullName', 'customer')
      return
    }

    submitting = true
    elements.saveButton.disabled = true
    clearFormErrors(doc, 'customer')

    const input: CustomerInput = {
      fullName: formValues.fullName,
      phone: formValues.phone,
      email: formValues.email,
      address: formValues.address,
      notes: formValues.notes,
    }

    void (async () => {
      try {
        const taken = await nameTaken(
          formValues.fullName,
          editingId ?? undefined,
        )

        if (taken) {
          showFormErrors(doc, 'customer', {
            fullName: `A customer named "${formValues.fullName.trim()}" already exists.`,
          })
          return
        }

        if (editingId) {
          await update(editingId, input)
          setNotice('Customer updated.')
        } else {
          await create(input)
          setNotice('Customer created.')
        }

        editingId = null
        showView('list')
        await list.refresh()
      } catch (error) {
        showFormError(doc, 'customer', errorMessage(error))
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
