import {
  parseBackup,
  serializeBackup,
  type BackupFile,
  type RestoreMode,
  type RestoreSummary,
} from '../domain/backup.ts'
import * as backupService from '../services/backup.ts'
import { pinService } from '../services/pin.ts'
import { listReceipts } from '../services/receipts.ts'
import { downloadTextFile, timestampedFilename, toCsv } from '../utils/csv.ts'
import { formatBytes, formatDate } from '../utils/format.ts'

const MAX_BACKUP_BYTES = 50 * 1024 * 1024

export interface BackupDeps {
  exportBackup?: typeof backupService.exportBackup
  restoreBackup?: typeof backupService.restoreBackup
  deleteAllData?: typeof backupService.deleteAllData
  verifyPin?: (pin: string) => Promise<boolean>
}

export interface BackupController {
  refresh(): Promise<void>
  destroy(): void
}

interface BackupElements {
  root: HTMLElement
  exportButton: HTMLButtonElement
  exportStatus: HTMLElement
  exportError: HTMLElement
  fileInput: HTMLInputElement
  fileLabel: HTMLElement
  dropZone: HTMLElement
  preview: HTMLElement
  previewName: HTMLElement
  previewMeta: HTMLElement
  previewCounts: HTMLElement
  mode: NodeListOf<HTMLInputElement>
  restoreButton: HTMLButtonElement
  clearButton: HTMLButtonElement | null
  deleteAllButton: HTMLButtonElement | null
  notice: HTMLElement
  error: HTMLElement
  errorPanel: HTMLElement
  errorMessage: HTMLElement
  statusLine: HTMLElement
  csvButton: HTMLButtonElement | null
  pinModal: HTMLElement
  pinForm: HTMLFormElement
  pinInput: HTMLInputElement
  pinError: HTMLElement
  pinSubmit: HTMLButtonElement
  pinCancel: HTMLButtonElement
  deleteModal: HTMLElement
  deleteForm: HTMLFormElement
  deleteInput: HTMLInputElement
  deleteError: HTMLElement
  deleteSubmit: HTMLButtonElement
  deleteCancel: HTMLButtonElement
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The backup action could not be completed.'
}

function queryElements(doc: Document): BackupElements {
  const elements: BackupElements = {
    root: doc.querySelector<HTMLElement>('[data-backup]')!,
    exportButton: doc.querySelector<HTMLButtonElement>('[data-backup-export]')!,
    exportStatus: doc.querySelector<HTMLElement>('[data-backup-export-status]')!,
    exportError: doc.querySelector<HTMLElement>('[data-backup-export-error]')!,
    fileInput: doc.querySelector<HTMLInputElement>('[data-backup-file]')!,
    fileLabel: doc.querySelector<HTMLElement>('[data-backup-file-label]')!,
    dropZone: doc.querySelector<HTMLElement>('[data-backup-dropzone]')!,
    preview: doc.querySelector<HTMLElement>('[data-backup-preview]')!,
    previewName: doc.querySelector<HTMLElement>('[data-backup-preview-name]')!,
    previewMeta: doc.querySelector<HTMLElement>('[data-backup-preview-meta]')!,
    previewCounts: doc.querySelector<HTMLElement>('[data-backup-preview-counts]')!,
    mode: doc.querySelectorAll<HTMLInputElement>('[data-backup-mode]'),
    restoreButton: doc.querySelector<HTMLButtonElement>('[data-backup-restore]')!,
    clearButton: doc.querySelector<HTMLButtonElement>('[data-backup-clear]'),
    deleteAllButton: doc.querySelector<HTMLButtonElement>('[data-backup-delete-all]'),
    notice: doc.querySelector<HTMLElement>('[data-backup-notice]')!,
    error: doc.querySelector<HTMLElement>('[data-backup-error]')!,
    errorPanel: doc.querySelector<HTMLElement>('[data-backup-error-panel]')!,
    errorMessage: doc.querySelector<HTMLElement>('[data-backup-error-message]')!,
    statusLine: doc.querySelector<HTMLElement>('[data-backup-status-line]')!,
    csvButton: doc.querySelector<HTMLButtonElement>('[data-backup-csv]'),
    pinModal: doc.querySelector<HTMLElement>('[data-backup-pin-modal]')!,
    pinForm: doc.querySelector<HTMLFormElement>('[data-backup-pin-form]')!,
    pinInput: doc.querySelector<HTMLInputElement>('[data-backup-pin-input]')!,
    pinError: doc.querySelector<HTMLElement>('[data-backup-pin-error]')!,
    pinSubmit: doc.querySelector<HTMLButtonElement>('[data-backup-pin-submit]')!,
    pinCancel: doc.querySelector<HTMLButtonElement>('[data-backup-pin-cancel]')!,
    deleteModal: doc.querySelector<HTMLElement>('[data-backup-delete-modal]')!,
    deleteForm: doc.querySelector<HTMLFormElement>('[data-backup-delete-form]')!,
    deleteInput: doc.querySelector<HTMLInputElement>('[data-backup-delete-input]')!,
    deleteError: doc.querySelector<HTMLElement>('[data-backup-delete-error]')!,
    deleteSubmit: doc.querySelector<HTMLButtonElement>('[data-backup-delete-submit]')!,
    deleteCancel: doc.querySelector<HTMLButtonElement>('[data-backup-delete-cancel]')!,
  }

  for (const [name, value] of Object.entries(elements)) {
    if (!value) {
      throw new Error(`Backup markup is incomplete: ${name}.`)
    }
  }

  return elements
}

export function createBackupPage(
  doc: Document,
  deps: BackupDeps = {},
): BackupController {
  const view = doc.defaultView
  const elements = queryElements(doc)
  const exportBackup = deps.exportBackup ?? backupService.exportBackup
  const restoreBackup = deps.restoreBackup ?? backupService.restoreBackup
  const deleteAllData = deps.deleteAllData ?? backupService.deleteAllData
  const verifyPin = deps.verifyPin ?? pinService.verifyPin

  let selected: BackupFile | null = null
  let selectedName = ''
  let selectedText = ''
  let selectedBytes = 0
  let busy = false

  function setNotice(message: string) {
    elements.notice.textContent = message
    elements.notice.hidden = message === ''
  }

  function setError(message: string) {
    elements.error.hidden = message === ''
    elements.errorPanel.hidden = message === ''
    elements.errorMessage.textContent = message
  }

  function setExportError(message: string) {
    elements.exportError.hidden = message === ''
    elements.exportError.textContent = message
  }

  function setBusy(value: boolean) {
    busy = value
    elements.exportButton.disabled = value
    elements.restoreButton.disabled = value || selected === null
    elements.fileInput.disabled = value
    if (elements.deleteAllButton) {
      elements.deleteAllButton.disabled = value
    }
    elements.root.setAttribute('aria-busy', value ? 'true' : 'false')
  }

  function selectedMode(): RestoreMode {
    return ([...elements.mode].find((input) => input.checked)?.value ?? 'merge') as RestoreMode
  }

  function setPinError(message: string) {
    elements.pinError.hidden = message === ''
    elements.pinError.textContent = message
  }

  function setPinBusy(value: boolean) {
    elements.pinInput.disabled = value
    elements.pinSubmit.disabled = value
    elements.pinCancel.disabled = value
  }

  function openPinDialog() {
    if (busy) {
      return
    }

    elements.pinInput.value = ''
    setPinError('')
    setPinBusy(false)
    elements.pinModal.hidden = false
    elements.pinInput.focus()
  }

  function closePinDialog() {
    elements.pinModal.hidden = true
    elements.pinInput.value = ''
    setPinError('')
    setPinBusy(false)
  }

  async function downloadBackup() {
    setBusy(true)
    setError('')
    setExportError('')
    setNotice('')

    try {
      const backup = await exportBackup()
      downloadTextFile(
        timestampedFilename('paynote-backup', 'json'),
        serializeBackup(backup),
        'application/json;charset=utf-8',
      )
      elements.exportStatus.textContent = `Backup created ${formatDate(backup.manifest.createdAt)} with ${backup.receipts.length} receipt${backup.receipts.length === 1 ? '' : 's'}.`
      setNotice('Backup downloaded. Store it somewhere safe.')
    } catch (error) {
      setExportError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function handlePinSubmit(event?: Event) {
    event?.preventDefault()

    if (busy) {
      return
    }

    const pin = elements.pinInput.value

    if (!pin) {
      setPinError('Enter your PIN.')
      elements.pinInput.focus()
      return
    }

    setPinBusy(true)
    setPinError('')

    try {
      if (!(await verifyPin(pin))) {
        setPinError('Incorrect PIN. Try again.')
        elements.pinInput.value = ''
        elements.pinInput.focus()
        return
      }

      closePinDialog()
      await downloadBackup()
    } catch (error) {
      setPinError(errorMessage(error))
    } finally {
      setPinBusy(false)
    }
  }

  async function readFile(file: File) {
    if (file.size > MAX_BACKUP_BYTES) {
      setError(`Backup files must be smaller than ${formatBytes(MAX_BACKUP_BYTES)}.`)
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const text = await file.text()

      if (text.length > MAX_BACKUP_BYTES) {
        throw new Error(`Backup files must be smaller than ${formatBytes(MAX_BACKUP_BYTES)}.`)
      }

      selectedText = text
      selectedName = file.name
      selectedBytes = file.size
      await loadSelected()
    } catch (error) {
      resetSelection()
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function loadSelected() {
    if (!selectedText) {
      return
    }

    try {
      selected = parseBackup(selectedText)
      renderPreview(selected, selectedBytes)
      setNotice('Backup file looks valid. Review the summary before restoring.')
      setError('')
    } catch (error) {
      selected = null
      elements.fileLabel.textContent = selectedName || 'Choose a backup file'
      elements.preview.hidden = true
      elements.restoreButton.disabled = true
      setError(errorMessage(error))
    }
  }

  function resetSelection() {
    selected = null
    selectedName = ''
    selectedText = ''
    selectedBytes = 0
    elements.preview.hidden = true
    elements.restoreButton.disabled = true
  }

  function renderPreview(backup: BackupFile, size?: number) {
    elements.preview.hidden = false
    elements.previewName.textContent = selectedName || 'Backup file'
    elements.previewMeta.textContent = [
      `Created ${formatDate(backup.manifest.createdAt)}`,
      `Format v${backup.manifest.formatVersion}`,
      `Schema v${backup.manifest.schemaVersion}`,
      size === undefined ? null : formatBytes(size),
    ]
      .filter(Boolean)
      .join(' · ')

    elements.previewCounts.replaceChildren()

    const counts: Array<[string, number]> = [
      ['Customers', backup.manifest.counts.customers],
      ['Properties', backup.manifest.counts.properties],
      ['Receipts', backup.manifest.counts.receipts],
      ['Settings', backup.manifest.counts.settings],
    ]

    for (const [label, count] of counts) {
      const item = doc.createElement('div')
      item.className = 'stat'
      const value = doc.createElement('span')
      value.className = 'stat-value'
      value.textContent = String(count)
      const caption = doc.createElement('span')
      caption.className = 'stat-label'
      caption.textContent = label
      item.append(value, caption)
      elements.previewCounts.append(item)
    }

    elements.restoreButton.disabled = false
    elements.fileLabel.textContent = selectedName || 'Choose another file'
  }

  async function handleRestore() {
    if (!selected || busy) {
      return
    }

    const mode = selectedMode()
    const warning =
      mode === 'replace'
        ? 'Replace mode deletes every existing customer, property, and receipt before restoring. This cannot be undone. Continue?'
        : 'Merge mode overwrites records with matching IDs and adds new records. Continue?'

    if (!globalThis.confirm(warning)) {
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const result: RestoreSummary = await restoreBackup(selected, mode)
      setNotice(
        `Restore complete: ${result.customers} customers, ${result.properties} properties, ${result.receipts} receipts, ${result.settings} settings (${result.mode} mode).`,
      )
      elements.statusLine.textContent = 'Data restored. Reloading values from storage.'
      resetSelection()
      elements.fileInput.value = ''
      elements.fileLabel.textContent = 'Choose a backup file'
      view?.dispatchEvent(new CustomEvent('paynote:data-changed'))
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function setDeletePinError(message: string) {
    elements.deleteError.hidden = message === ''
    elements.deleteError.textContent = message
  }

  function setDeletePinBusy(value: boolean) {
    elements.deleteInput.disabled = value
    elements.deleteSubmit.disabled = value
    elements.deleteCancel.disabled = value
  }

  function openDeleteDialog() {
    if (busy) {
      return
    }

    elements.deleteInput.value = ''
    setDeletePinError('')
    setDeletePinBusy(false)
    elements.deleteModal.hidden = false
    elements.deleteInput.focus()
  }

  function closeDeleteDialog() {
    elements.deleteModal.hidden = true
    elements.deleteInput.value = ''
    setDeletePinError('')
    setDeletePinBusy(false)
  }

  async function deleteWorkspace() {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await deleteAllData()
      resetSelection()
      elements.fileInput.value = ''
      elements.fileLabel.textContent = 'Choose a backup file'
      elements.statusLine.textContent = 'No backup selected.'
      setNotice('All data has been deleted.')
      view?.dispatchEvent(new CustomEvent('paynote:data-changed'))
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeletePinSubmit(event?: Event) {
    event?.preventDefault()

    if (busy) {
      return
    }

    const pin = elements.deleteInput.value

    if (!pin) {
      setDeletePinError('Enter your PIN.')
      elements.deleteInput.focus()
      return
    }

    setDeletePinBusy(true)
    setDeletePinError('')

    try {
      if (!(await verifyPin(pin))) {
        setDeletePinError('Incorrect PIN. Try again.')
        elements.deleteInput.value = ''
        elements.deleteInput.focus()
        return
      }

      closeDeleteDialog()
      await deleteWorkspace()
    } catch (error) {
      setDeletePinError(errorMessage(error))
    } finally {
      setDeletePinBusy(false)
    }
  }

  function handleFileChange() {
    const file = elements.fileInput.files?.[0]

    if (file) {
      void readFile(file)
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    elements.dropZone.classList.remove('is-dragging')
    const file = event.dataTransfer?.files?.[0]

    if (file) {
      void readFile(file)
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    elements.dropZone.classList.add('is-dragging')
  }

  function handleDragLeave() {
    elements.dropZone.classList.remove('is-dragging')
  }

  function handleClear() {
    resetSelection()
    elements.fileInput.value = ''
    elements.fileLabel.textContent = 'Choose a backup file'
    setError('')
    setNotice('')
  }

  function handleProfileChanged() {
    handleClear()
    void refresh()
  }

  const handlePinSubmitEvent = (event: Event) => {
    void handlePinSubmit(event)
  }
  const handlePinInput = () => {
    setPinError('')
  }
  const handleDeletePinSubmitEvent = (event: Event) => {
    void handleDeletePinSubmit(event)
  }
  const handleDeletePinInput = () => {
    setDeletePinError('')
  }

  elements.exportButton.addEventListener('click', openPinDialog)
  elements.pinForm.addEventListener('submit', handlePinSubmitEvent)
  elements.pinInput.addEventListener('input', handlePinInput)
  elements.pinCancel.addEventListener('click', closePinDialog)
  elements.fileInput.addEventListener('change', handleFileChange)
  elements.restoreButton.addEventListener('click', () => void handleRestore())
  elements.clearButton?.addEventListener('click', handleClear)
  const handleDeleteAllClick = () => openDeleteDialog()
  elements.deleteAllButton?.addEventListener('click', handleDeleteAllClick)
  elements.deleteForm.addEventListener('submit', handleDeletePinSubmitEvent)
  elements.deleteInput.addEventListener('input', handleDeletePinInput)
  elements.deleteCancel.addEventListener('click', closeDeleteDialog)
  elements.dropZone.addEventListener('dragover', handleDragOver)
  elements.dropZone.addEventListener('dragleave', handleDragLeave)
  elements.dropZone.addEventListener('drop', handleDrop)

  async function handleCsv() {
    if (busy) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const items = []
      let offset = 0

      for (;;) {
        const page = await listReceipts({ limit: 200, offset })
        items.push(...page.items)

        if (page.items.length === 0 || items.length >= page.total) {
          break
        }

        offset += page.items.length
      }

      const csv = toCsv(
        ['Receipt number', 'Date', 'Customer', 'Property', 'Category', 'Amount (INR)', 'Payment method', 'Status', 'Reference'],
        items.map((receipt) => [
          receipt.receiptNumber,
          receipt.receiptDate,
          receipt.customerName ?? '',
          receipt.propertyName ?? '',
          receipt.receiptType,
          (receipt.amountPaise / 100).toFixed(2),
          receipt.paymentMethod,
          receipt.status,
          receipt.referenceNumber ?? '',
        ]),
      )

      downloadTextFile(
        timestampedFilename('paynote-receipts', 'csv'),
        csv,
        'text/csv;charset=utf-8',
      )
      setNotice('Receipt CSV downloaded.')
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  elements.csvButton?.addEventListener('click', () => void handleCsv())
  view?.addEventListener('paynote:profile-changed', handleProfileChanged)

  setBusy(false)

  async function refresh() {
    elements.exportStatus.textContent = 'Exports include customers, properties, receipts, a receipt CSV, settings, and receipt numbering. You will be asked for your PIN to download a backup.'
    return Promise.resolve()
  }

  return {
    refresh,
    destroy() {
      elements.exportButton.removeEventListener('click', openPinDialog)
      elements.pinForm.removeEventListener('submit', handlePinSubmitEvent)
      elements.pinInput.removeEventListener('input', handlePinInput)
      elements.pinCancel.removeEventListener('click', closePinDialog)
      elements.deleteForm.removeEventListener('submit', handleDeletePinSubmitEvent)
      elements.deleteInput.removeEventListener('input', handleDeletePinInput)
      elements.deleteCancel.removeEventListener('click', closeDeleteDialog)
      elements.fileInput.removeEventListener('change', handleFileChange)
      elements.dropZone.removeEventListener('dragover', handleDragOver)
      elements.dropZone.removeEventListener('dragleave', handleDragLeave)
      elements.dropZone.removeEventListener('drop', handleDrop)
      elements.deleteAllButton?.removeEventListener('click', handleDeleteAllClick)
      view?.removeEventListener('paynote:profile-changed', handleProfileChanged)
    },
  }
}
