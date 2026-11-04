import {
  PIN_LENGTH,
  isValidPin,
  pinService,
  type PinService,
} from '../services/pin.ts'

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
  onUnlocked?: () => void
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
    resetPanel: required(doc, '[data-pin-reset-panel]'),
    resetConfirm: required(doc, '[data-pin-reset-confirm]'),
    resetCancel: required(doc, '[data-pin-reset-cancel]'),
    lock: required(doc, '[data-pin-lock]'),
  }
}

function readValue(
  doc: Document,
  prefix: 'pinsetup' | 'pinunlock',
  field: string,
): string {
  return (
    doc.querySelector<HTMLInputElement>(`[data-${prefix}-input="${field}"]`)
      ?.value ?? ''
  )
}

function setBusy(
  doc: Document,
  prefix: 'pinsetup' | 'pinunlock',
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
  prefix: 'pinsetup' | 'pinunlock',
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

export function createPinGate(
  doc: Document,
  deps: PinGateDeps = {},
): PinGate {
  const service = deps.service ?? pinService
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
      'Remove the current PIN and choose a new one.'
    clearFormErrors(doc, 'pinsetup')
    clearFormErrors(doc, 'pinunlock')
    setNotice('')
    focusElement(elements.resetConfirm)
  }

  function resetPin() {
    service.clearPin()
    clearInputs('pinunlock')
    showSetup()
    setNotice('PIN removed. Create a new PIN to lock PayNote again.')
    focusFirstField(doc, 'pin', 'pinsetup')
  }

  function cancelReset() {
    if (service.hasPin()) {
      showUnlock()
    } else {
      showSetup()
    }
  }

  function unlock() {
    const firstUnlock = !booted
    booted = true
    elements.screen.hidden = true
    elements.appShell.hidden = false
    elements.lock.hidden = false

    if (firstUnlock) {
      deps.onUnlocked?.()
    }
  }

  function lock() {
    elements.screen.hidden = false
    elements.appShell.hidden = true
    elements.lock.hidden = true
    clearInputs('pinunlock')

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
      await service.createPin(pin)
      clearInputs('pinsetup')
      unlock()
    } catch (error) {
      showFormError(
        doc,
        'pinsetup',
        error instanceof Error ? error.message : 'The PIN could not be saved.',
      )
      focusFirstField(doc, 'pin', 'pinsetup')
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
      if (await service.verifyPin(pin)) {
        clearInputs('pinunlock')
        unlock()
      } else {
        showFormError(doc, 'pinunlock', 'Incorrect PIN. Try again.')
        clearInputs('pinunlock')
        focusFirstField(doc, 'pin', 'pinunlock')
      }
    } catch {
      showFormError(doc, 'pinunlock', 'The PIN could not be verified.')
      clearInputs('pinunlock')
      focusFirstField(doc, 'pin', 'pinunlock')
    } finally {
      busy = false
      setBusy(doc, 'pinunlock', elements.unlockSubmit, false)
    }
  }

  function clearInputs(prefix: 'pinsetup' | 'pinunlock') {
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
    showReset()
  }
  const resetConfirmClick = () => {
    resetPin()
  }
  const resetCancelClick = () => {
    cancelReset()
  }

  elements.setupForm.addEventListener('submit', setupEvent)
  elements.unlockForm.addEventListener('submit', unlockEvent)
  elements.setupSubmit.addEventListener('click', setupClick)
  elements.unlockSubmit.addEventListener('click', unlockClick)
  elements.forgot.addEventListener('click', forgotClick)
  elements.resetConfirm.addEventListener('click', resetConfirmClick)
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
      elements.setupSubmit.removeEventListener('click', setupClick)
      elements.unlockSubmit.removeEventListener('click', unlockClick)
      elements.forgot.removeEventListener('click', forgotClick)
      elements.resetConfirm.removeEventListener('click', resetConfirmClick)
      elements.resetCancel.removeEventListener('click', resetCancelClick)
      elements.lock.removeEventListener('click', lockClick)
    },
  }
}
