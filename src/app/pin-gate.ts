import { closeDatabase } from '../services/database.ts'
import { hasStoredDatabase } from '../services/encrypted-store.ts'
import {
  PIN_LENGTH,
  isValidPin,
  pinService,
  type PinService,
} from '../services/pin.ts'
import { clearReceiptDrafts } from './receipt-draft.ts'

import {
  clearFormErrors,
  focusElement,
  focusFirstField,
  showFormError,
  showFormErrors,
} from './form-dom.ts'
import { hasErrors, type FormErrors } from './form-validation.ts'

export interface PinGateDeps {
  service?: PinService
  onUnlocked?: (key: Uint8Array) => void | Promise<void>
  onLocked?: () => void | Promise<void>
  hasExistingData?: () => Promise<boolean>
}

export interface PinGate {
  destroy(): void
}

interface PinElements {
  screen: HTMLElement
  appShell: HTMLElement
  panel: HTMLElement
  title: HTMLElement
  description: HTMLElement
  notice: HTMLElement
  setupForm: HTMLFormElement
  setupSubmit: HTMLButtonElement
  unlockForm: HTMLFormElement
  unlockSubmit: HTMLButtonElement
  forgot: HTMLButtonElement
  resetForm: HTMLFormElement
  resetPanel: HTMLElement
  resetConfirm: HTMLButtonElement
  resetCancel: HTMLButtonElement
  lock: HTMLButtonElement
}

function required<T extends Element>(doc: Document, selector: string): T {
  const element = doc.querySelector<T>(selector)

  if (!element) {
    throw new Error(`PIN markup is incomplete: ${selector}.`)
  }

  return element
}

function queryElements(doc: Document): PinElements {
  return {
    screen: required(doc, '[data-pin-screen]'),
    appShell: required(doc, '[data-app-shell]'),
    panel: required(doc, '[data-pin-panel]'),
    title: required(doc, '[data-pin-title]'),
    description: required(doc, '[data-pin-description]'),
    notice: required(doc, '[data-pin-notice]'),
    setupForm: required(doc, '[data-pin-setup-form]'),
    setupSubmit: required(doc, '[data-pin-setup-submit]'),
    unlockForm: required(doc, '[data-pin-unlock-form]'),
    unlockSubmit: required(doc, '[data-pin-unlock-submit]'),
    forgot: required(doc, '[data-pin-forgot]'),
    resetForm: required(doc, '[data-pin-reset-form]'),
    resetPanel: required(doc, '[data-pin-reset-panel]'),
    resetConfirm: required(doc, '[data-pin-reset-confirm]'),
    resetCancel: required(doc, '[data-pin-reset-cancel]'),
    lock: required(doc, '[data-pin-lock]'),
  }
}

function readValue(
  doc: Document,
  prefix: 'pinsetup' | 'pinunlock' | 'pinreset',
  field: string,
): string {
  return (
    doc.querySelector<HTMLInputElement>(`[data-${prefix}-input="${field}"]`)
      ?.value ?? ''
  )
}

function setBusy(
  doc: Document,
  prefix: 'pinsetup' | 'pinunlock' | 'pinreset',
  button: HTMLButtonElement,
  busy: boolean,
): void {
  button.disabled = busy

  for (const element of doc.querySelectorAll<HTMLElement>(
    `[data-${prefix}-input]`,
  )) {
    ;(element as HTMLInputElement).disabled = busy
  }
}

function focusFirstError(
  doc: Document,
  prefix: 'pinsetup' | 'pinunlock' | 'pinreset',
  errors: FormErrors,
): void {
  const field = Object.keys(errors)[0]

  if (field) {
    focusElement(
      doc.querySelector<HTMLElement>(`[data-${prefix}-input="${field}"]`),
    )
  }
}

export function validatePinSetup(pin: string, confirmPin: string): FormErrors {
  const errors: FormErrors = {}

  if (!pin) {
    errors.pin = 'Enter a PIN.'
  } else if (!isValidPin(pin)) {
    errors.pin = `PIN must be exactly ${PIN_LENGTH} digits.`
  }

  if (!confirmPin) {
    errors.confirmPin = 'Confirm your PIN.'
  } else if (pin !== confirmPin) {
    errors.confirmPin = 'PINs do not match.'
  }

  return errors
}

function validatePinReset(
  oldPin: string,
  newPin: string,
  confirmPin: string,
): FormErrors {
  const errors: FormErrors = {}

  if (!oldPin) {
    errors.oldPin = 'Enter your current PIN.'
  } else if (!isValidPin(oldPin)) {
    errors.oldPin = `PIN must be exactly ${PIN_LENGTH} digits.`
  }

  if (!newPin) {
    errors.newPin = 'Enter a new PIN.'
  } else if (!isValidPin(newPin)) {
    errors.newPin = `PIN must be exactly ${PIN_LENGTH} digits.`
  }

  if (!confirmPin) {
    errors.confirmPin = 'Confirm your new PIN.'
  } else if (newPin !== confirmPin) {
    errors.confirmPin = 'PINs do not match.'
  }

  return errors
}

export function createPinGate(
  doc: Document,
  deps: PinGateDeps = {},
): PinGate {
  const service = deps.service ?? pinService
  const hasExistingData = deps.hasExistingData ?? hasStoredDatabase
  const elements = queryElements(doc)
  let busy = false
  let booted = false

  function setNotice(message: string) {
    elements.notice.textContent = message
    elements.notice.hidden = message === ''
  }

  function showSetup() {
    elements.panel.hidden = false
    elements.setupForm.hidden = false
    elements.unlockForm.hidden = true
    elements.resetPanel.hidden = true
    elements.title.textContent = 'Create a PIN'
    elements.description.textContent =
      'Choose a four-digit PIN to lock this workspace on this device.'
    clearFormErrors(doc, 'pinsetup')
    clearFormErrors(doc, 'pinunlock')
    setNotice('')
    focusFirstField(doc, 'pin', 'pinsetup')
  }

  function showUnlock() {
    elements.panel.hidden = false
    elements.setupForm.hidden = true
    elements.unlockForm.hidden = false
    elements.resetPanel.hidden = true
    elements.title.textContent = 'Enter your PIN'
    elements.description.textContent =
      'Unlock PayNote to reach the records stored on this device.'
    clearFormErrors(doc, 'pinsetup')
    clearFormErrors(doc, 'pinunlock')
    setNotice('')
    focusFirstField(doc, 'pin', 'pinunlock')
  }

  function showReset() {
    elements.panel.hidden = false
    elements.setupForm.hidden = true
    elements.unlockForm.hidden = true
    elements.resetPanel.hidden = false
    elements.title.textContent = 'Reset PIN'
    elements.description.textContent =
      'Enter your current PIN, then choose a new one.'
    clearFormErrors(doc, 'pinsetup')
    clearFormErrors(doc, 'pinunlock')
    clearFormErrors(doc, 'pinreset')
    setNotice('')
    focusFirstField(doc, 'oldPin', 'pinreset')
  }

  function cancelReset() {
    clearInputs('pinreset')
    clearFormErrors(doc, 'pinreset')

    if (service.hasPin()) {
      showUnlock()
    } else {
      showSetup()
    }
  }

  async function handleReset(event?: Event) {
    event?.preventDefault()

    if (busy) {
      return
    }

    const oldPin = readValue(doc, 'pinreset', 'oldPin')
    const newPin = readValue(doc, 'pinreset', 'newPin')
    const confirmPin = readValue(doc, 'pinreset', 'confirmPin')
    const errors = validatePinReset(oldPin, newPin, confirmPin)

    if (hasErrors(errors)) {
      showFormErrors(doc, 'pinreset', errors)
      focusFirstError(doc, 'pinreset', errors)
      return
    }

    clearFormErrors(doc, 'pinreset')
    setNotice('')
    busy = true
    setBusy(doc, 'pinreset', elements.resetConfirm, true)

    try {
      const key = await service.changePin(oldPin, newPin)

      if (!key) {
        showFormError(doc, 'pinreset', 'Current PIN is incorrect.')
        focusFirstField(doc, 'oldPin', 'pinreset')
        return
      }

      clearInputs('pinreset')
      clearInputs('pinunlock')
      await unlock(key)
    } catch (error) {
      showFormError(
        doc,
        'pinreset',
        error instanceof Error ? error.message : 'The PIN could not be reset.',
      )
    } finally {
      busy = false
      setBusy(doc, 'pinreset', elements.resetConfirm, false)
    }
  }

  async function unlock(key: Uint8Array) {
    await deps.onUnlocked?.(key)
    booted = true
    elements.screen.hidden = true
    elements.appShell.hidden = false
    elements.lock.hidden = false
  }

  function lock() {
    elements.screen.hidden = false
    elements.appShell.hidden = true
    elements.lock.hidden = true
    clearInputs('pinunlock')
    clearReceiptDrafts()
    void Promise.resolve(deps.onLocked ?? closeDatabase).catch(() => undefined)

    if (service.hasPin()) {
      showUnlock()
    } else {
      showSetup()
    }
  }

  async function handleSetup(event?: Event) {
    event?.preventDefault()

    if (busy) {

      return
    }

    const pin = readValue(doc, 'pinsetup', 'pin')
    const confirmPin = readValue(doc, 'pinsetup', 'confirmPin')
    const errors = validatePinSetup(pin, confirmPin)

    if (hasErrors(errors)) {
      showFormErrors(doc, 'pinsetup', errors)
      focusFirstError(doc, 'pinsetup', errors)
      return
    }

    clearFormErrors(doc, 'pinsetup')
    setNotice('')
    busy = true
    setBusy(doc, 'pinsetup', elements.setupSubmit, true)

    try {
      if (await hasExistingData()) {
        showFormError(
          doc,
          'pinsetup',
          'Encrypted records exist on this device, but the PIN record is missing or damaged. The workspace cannot be opened.',
        )
        return
      }

      const key = await service.createPin(pin)
      clearInputs('pinsetup')
      await unlock(key)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The PIN could not be saved.'

      if (service.hasPin()) {
        clearInputs('pinsetup')
        showUnlock()
        setNotice(
          `Your PIN was saved, but the encrypted database could not be opened. ${message}`,
        )
      } else {
        showFormError(doc, 'pinsetup', message)
        focusFirstField(doc, 'pin', 'pinsetup')
      }
    } finally {
      busy = false
      setBusy(doc, 'pinsetup', elements.setupSubmit, false)
    }
  }

  async function handleUnlock(event?: Event) {
    event?.preventDefault()

    if (busy) {
      return
    }

    const pin = readValue(doc, 'pinunlock', 'pin')

    if (!isValidPin(pin)) {
      showFormErrors(doc, 'pinunlock', {
        pin: `PIN must be exactly ${PIN_LENGTH} digits.`,
      })
      focusFirstField(doc, 'pin', 'pinunlock')
      return
    }

    clearFormErrors(doc, 'pinunlock')
    setNotice('')
    busy = true
    setBusy(doc, 'pinunlock', elements.unlockSubmit, true)

    try {
      const key = await service.unlockPin(pin)

      if (key) {
        clearInputs('pinunlock')
        await unlock(key)
      } else {
        showFormError(doc, 'pinunlock', 'Incorrect PIN. Try again.')
        clearInputs('pinunlock')
        focusFirstField(doc, 'pin', 'pinunlock')
      }
    } catch (error) {
      showFormError(
        doc,
        'pinunlock',
        error instanceof Error ? error.message : 'The PIN could not be verified.',
      )
      clearInputs('pinunlock')
      focusFirstField(doc, 'pin', 'pinunlock')
    } finally {
      busy = false
      setBusy(doc, 'pinunlock', elements.unlockSubmit, false)
    }
  }

  function clearInputs(prefix: 'pinsetup' | 'pinunlock' | 'pinreset') {
    for (const element of doc.querySelectorAll<HTMLElement>(
      `[data-${prefix}-input]`,
    )) {
      ;(element as HTMLInputElement).value = ''
    }
  }

  function handleLock() {
    if (!booted) {
      return
    }

    lock()
  }

  const setupEvent = (event: Event) => {
    void handleSetup(event)
  }
  const unlockEvent = (event: Event) => {
    void handleUnlock(event)
  }
  const resetEvent = (event: Event) => {
    void handleReset(event)
  }
  const setupClick = () => {
    void handleSetup()
  }
  const unlockClick = () => {
    void handleUnlock()
  }
  const lockClick = () => {
    handleLock()
  }
  const forgotClick = () => {
    clearInputs('pinunlock')
    clearInputs('pinreset')
    showReset()
  }
  const resetCancelClick = () => {
    cancelReset()
  }
  elements.setupForm.addEventListener('submit', setupEvent)
  elements.unlockForm.addEventListener('submit', unlockEvent)
  elements.resetForm.addEventListener('submit', resetEvent)
  elements.setupSubmit.addEventListener('click', setupClick)
  elements.unlockSubmit.addEventListener('click', unlockClick)
  elements.forgot.addEventListener('click', forgotClick)
  elements.resetCancel.addEventListener('click', resetCancelClick)
  elements.lock.addEventListener('click', lockClick)

  if (service.hasPin()) {
    showUnlock()
  } else {
    showSetup()
  }

  return {
    destroy() {
      elements.setupForm.removeEventListener('submit', setupEvent)
      elements.unlockForm.removeEventListener('submit', unlockEvent)
      elements.resetForm.removeEventListener('submit', resetEvent)
      elements.setupSubmit.removeEventListener('click', setupClick)
      elements.unlockSubmit.removeEventListener('click', unlockClick)
      elements.forgot.removeEventListener('click', forgotClick)
      elements.resetCancel.removeEventListener('click', resetCancelClick)
      elements.lock.removeEventListener('click', lockClick)
    },
  }
}
