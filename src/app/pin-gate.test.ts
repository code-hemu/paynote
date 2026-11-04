import { afterEach, describe, expect, it } from '@guchho/test'

import { FakeDocument, FakeElement, FakeWindow } from '../test/fake-dom.ts'
import type { PinService } from '../services/pin.ts'

import { createPinGate, validatePinSetup, type PinGate } from './pin-gate.ts'

class FakePinService implements PinService {
  pin: string | null

  constructor(pin: string | null = null) {
    this.pin = pin
  }

  hasPin() {
    return this.pin !== null
  }

  async createPin(pin: string) {
    this.pin = pin
  }

  async verifyPin(pin: string) {
    return pin === this.pin
  }

  clearPin() {
    this.pin = null
  }
}

interface Fixture {
  document: FakeDocument
  view: FakeWindow
  screen: FakeElement
  appShell: FakeElement
  panel: FakeElement
  setupForm: FakeElement
  unlockForm: FakeElement
  setupSubmit: FakeElement
  unlockSubmit: FakeElement
  forgot: FakeElement
  resetPanel: FakeElement
  resetConfirm: FakeElement
  resetCancel: FakeElement
  lock: FakeElement
  title: FakeElement
  notice: FakeElement
  setupPin: FakeElement
  setupConfirm: FakeElement
  unlockPin: FakeElement
  unlockFormError: FakeElement
}

let gate: PinGate | undefined

function createFixture(): Fixture {
  const view = new FakeWindow()
  const document = new FakeDocument(view)
  const screen = document.add(new FakeElement({ pinScreen: '' }))
  const appShell = document.add(new FakeElement({ appShell: '' }))
  const panel = document.add(new FakeElement({ pinPanel: '' }))
  const title = document.add(new FakeElement({ pinTitle: '' }))
  document.add(new FakeElement({ pinDescription: '' }))
  const notice = document.add(new FakeElement({ pinNotice: '' }))
  const setupForm = document.add(new FakeElement({ pinSetupForm: '' }))
  const unlockForm = document.add(new FakeElement({ pinUnlockForm: '' }))
  const setupSubmit = document.add(new FakeElement({ pinSetupSubmit: '' }))
  const unlockSubmit = document.add(new FakeElement({ pinUnlockSubmit: '' }))
  const forgot = document.add(new FakeElement({ pinForgot: '' }))
  const resetPanel = document.add(new FakeElement({ pinResetPanel: '' }))
  const resetConfirm = document.add(new FakeElement({ pinResetConfirm: '' }))
  const resetCancel = document.add(new FakeElement({ pinResetCancel: '' }))
  const lock = document.add(new FakeElement({ pinLock: '' }))
  const setupPin = document.add(new FakeElement({ pinsetupInput: 'pin' }))
  const setupConfirm = document.add(
    new FakeElement({ pinsetupInput: 'confirmPin' }),
  )
  const unlockPin = document.add(new FakeElement({ pinunlockInput: 'pin' }))
  const unlockFormError = document.add(
    new FakeElement({ pinunlockFormError: '' }),
  )

  appShell.hidden = true
  lock.hidden = true

  for (const field of ['pin', 'confirmPin']) {
    document.add(new FakeElement({ pinsetupFieldError: field }))
  }

  document.add(new FakeElement({ pinsetupFormError: '' }))
  document.add(new FakeElement({ pinunlockFieldError: 'pin' }))

  return {
    document,
    view,
    screen,
    appShell,
    panel,
    setupForm,
    unlockForm,
    setupSubmit,
    unlockSubmit,
    forgot,
    resetPanel,
    resetConfirm,
    resetCancel,
    lock,
    title,
    notice,
    setupPin,
    setupConfirm,
    unlockPin,
    unlockFormError,
  }
}

function mount(service: FakePinService, fixture = createFixture()) {
  gate = createPinGate(fixture.document as unknown as Document, {
    service,
    onUnlocked: () => {
      fixture.document.title = 'unlocked'
    },
  })

  return fixture
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 5))
}

afterEach(() => {
  gate?.destroy()
  gate = undefined
})

describe('PIN gate', () => {
  it('asks for a new PIN when none is stored', () => {
    const fixture = mount(new FakePinService())

    expect(fixture.setupForm.hidden).toBe(false)
    expect(fixture.unlockForm.hidden).toBe(true)
    expect(fixture.appShell.hidden).toBe(true)
    expect(fixture.screen.hidden).toBe(false)
    expect(fixture.title.textContent).toBe('Create a PIN')
  })

  it('asks to unlock when a PIN is stored', () => {
    const fixture = mount(new FakePinService('1234'))

    expect(fixture.setupForm.hidden).toBe(true)
    expect(fixture.unlockForm.hidden).toBe(false)
    expect(fixture.appShell.hidden).toBe(true)
    expect(fixture.title.textContent).toBe('Enter your PIN')
  })

  it('creates a PIN and unlocks the app', async () => {
    const service = new FakePinService()
    const fixture = mount(service)

    fixture.setupPin.value = '1234'
    fixture.setupConfirm.value = '1234'
    fixture.setupSubmit.click()
    await flush()

    expect(service.pin).toBe('1234')
    expect(fixture.screen.hidden).toBe(true)
    expect(fixture.appShell.hidden).toBe(false)
    expect(fixture.lock.hidden).toBe(false)
    expect(fixture.document.title).toBe('unlocked')
  })

  it('rejects a mismatched PIN setup', () => {
    const service = new FakePinService()
    const fixture = mount(service)

    fixture.setupPin.value = '1234'
    fixture.setupConfirm.value = '4321'
    fixture.setupSubmit.click()

    expect(service.pin).toBe(null)
    expect(fixture.appShell.hidden).toBe(true)
  })

  it('rejects a wrong PIN and unlocks with the correct one', async () => {
    const fixture = mount(new FakePinService('1234'))

    fixture.unlockPin.value = '0000'
    fixture.unlockSubmit.click()
    await flush()

    expect(fixture.unlockFormError.textContent).toContain('Incorrect PIN')
    expect(fixture.appShell.hidden).toBe(true)

    fixture.unlockPin.value = '1234'
    fixture.unlockSubmit.click()
    await flush()

    expect(fixture.screen.hidden).toBe(true)
    expect(fixture.appShell.hidden).toBe(false)
  })

  it('locks the app again from the topbar', async () => {
    const fixture = mount(new FakePinService('1234'))

    fixture.unlockPin.value = '1234'
    fixture.unlockSubmit.click()
    await flush()

    fixture.lock.click()

    expect(fixture.screen.hidden).toBe(false)
    expect(fixture.appShell.hidden).toBe(true)
    expect(fixture.unlockForm.hidden).toBe(false)
  })

  it('resets a forgotten PIN after confirmation', () => {
    const service = new FakePinService('1234')
    const fixture = mount(service)

    fixture.forgot.click()

    expect(fixture.resetPanel.hidden).toBe(false)
    expect(fixture.unlockForm.hidden).toBe(true)
    expect(fixture.title.textContent).toBe('Reset PIN')

    fixture.resetConfirm.click()

    expect(service.pin).toBe(null)
    expect(fixture.setupForm.hidden).toBe(false)
    expect(fixture.title.textContent).toBe('Create a PIN')
    expect(fixture.notice.textContent).toContain('PIN removed')
  })

  it('cancels a PIN reset', () => {
    const service = new FakePinService('1234')
    const fixture = mount(service)

    fixture.forgot.click()
    fixture.resetCancel.click()

    expect(service.pin).toBe('1234')
    expect(fixture.resetPanel.hidden).toBe(true)
    expect(fixture.unlockForm.hidden).toBe(false)
    expect(fixture.title.textContent).toBe('Enter your PIN')
  })

  it('validates setup values', () => {
    expect(validatePinSetup('', '').pin).toContain('Enter a PIN')
    expect(validatePinSetup('123', '123').pin).toContain('4 digits')
    expect(validatePinSetup('1234', '4321').confirmPin).toContain('do not match')
  })
})
