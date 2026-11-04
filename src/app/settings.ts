import {
  DEFAULT_SETTINGS,
  formValuesToSettings,
  settingsToFormValues,
  validateSettings,
  type SettingsFormValues,
} from '../domain/settings.ts'
import * as settingsService from '../services/settings.ts'
import { applyAppPreferences } from '../services/preferences.ts'
import { setFormValues, clearFormErrors, focusFirstField } from './form-dom.ts'

export const THEME_KEY = 'paynote.theme'

export type ThemePreference = 'system' | 'light' | 'dark'

export interface SettingsDeps {
  readSettings?: typeof settingsService.readSettings
  setSettings?: typeof settingsService.setSettings
}

export interface SettingsController {
  refresh(): Promise<void>
  destroy(): void
}

interface SettingsElements {
  root: HTMLElement
  form: HTMLFormElement
  save: HTMLButtonElement
  reset: HTMLButtonElement
  theme: HTMLSelectElement
  notice: HTMLElement
  error: HTMLElement
  logoPreview: HTMLElement | null
  logoImage: HTMLImageElement | null
  previewName: HTMLElement | null
  previewAddress: HTMLElement | null
  previewPhone: HTMLElement | null
  signatureImage: HTMLImageElement | null
  businessNameInput: HTMLInputElement | null
  fullNameInput: HTMLInputElement | null
  businessFields: NodeListOf<HTMLElement>
  individualFields: NodeListOf<HTMLElement>
  photoFile: HTMLInputElement | null
  photoUpload: HTMLButtonElement | null
  photoClear: HTMLButtonElement | null
  profilePhotoPreview: HTMLImageElement | null
  profilePhotoPlaceholder: HTMLElement | null
  signaturePreview: HTMLImageElement | null
  signaturePlaceholder: HTMLElement | null
  signatureFile: HTMLInputElement | null
  signatureUpload: HTMLButtonElement | null
  signatureDraw: HTMLButtonElement | null
  signatureClear: HTMLButtonElement | null
  signaturePad: HTMLElement | null
  signatureCanvas: HTMLCanvasElement | null
  signaturePadUndo: HTMLButtonElement | null
  signaturePadClear: HTMLButtonElement | null
  signaturePadSave: HTMLButtonElement | null
  signaturePadCancel: HTMLButtonElement | null
}

const FIELD_MAP: Record<keyof SettingsFormValues, string> = {
  profileType: 'profileType',
  fullName: 'fullName',
  businessName: 'businessName',
  legalBusinessName: 'legalBusinessName',
  businessType: 'businessType',
  businessRegistrationNumber: 'businessRegistrationNumber',
  taxIdentificationNumber: 'taxIdentificationNumber',
  website: 'website',
  businessAddress: 'businessAddress',
  businessPhone: 'businessPhone',
  businessEmail: 'businessEmail',
  businessLogo: 'businessLogo',
  taxRegistrationDetails: 'taxRegistrationDetails',
  profilePhoto: 'profilePhoto',
  profileSignature: 'profileSignature',
  receiptPrefix: 'receiptPrefix',
  receiptCurrency: 'receiptCurrency',
  receiptTaxRate: 'receiptTaxRate',
  receiptNumberFormat: 'receiptNumberFormat',
  receiptFooterMessage: 'receiptFooterMessage',
  defaultPaymentMethod: 'defaultPaymentMethod',
  receiptTimezone: 'receiptTimezone',
  dateFormat: 'dateFormat',
  numberFormat: 'numberFormat',
}

class SignaturePad {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private drawing = false
  private strokes: Array<Array<{ x: number; y: number }>> = []
  private currentStroke: Array<{ x: number; y: number }> = []

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d')

    if (!context) {
    throw new Error('Signature pad not supported.')
  }

  this.ctx = context
  this.bindEvents()
  this.resize()
}

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    this.canvas.width = width * ratio
    this.canvas.height = height * ratio
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.ctx.lineWidth = 2
    this.ctx.lineCap = 'round'
    this.ctx.lineJoin = 'round'
    this.ctx.strokeStyle = '#111827'
    this.redraw()
  }

  private bindEvents() {
    const getPos = (event: MouseEvent | TouchEvent) => {
      const rect = this.canvas.getBoundingClientRect()

      if ('touches' in event) {
        const touch = event.touches[0]
        if (touch) {
          return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
          }
        }
      }

      const mouse = event as MouseEvent
      return { x: mouse.clientX - rect.left, y: mouse.clientY - rect.top }
    }

    const start = (event: MouseEvent | TouchEvent) => {
      event.preventDefault()
      this.drawing = true
      this.currentStroke = [getPos(event)]
      this.strokes.push(this.currentStroke)
    }

    const move = (event: MouseEvent | TouchEvent) => {
      if (!this.drawing) {
        return
      }

      event.preventDefault()
      const pos = getPos(event)
      this.currentStroke.push(pos)
      this.redraw()
    }

    const end = (event: MouseEvent | TouchEvent) => {
      if (!this.drawing) {
        return
      }

      event.preventDefault()
      this.drawing = false
      this.currentStroke = []
    }

    this.canvas.addEventListener('mousedown', start as EventListener)
    this.canvas.addEventListener('mousemove', move as EventListener)
    window.addEventListener('mouseup', end as EventListener)
    this.canvas.addEventListener('touchstart', start as EventListener, { passive: false })
    this.canvas.addEventListener('touchmove', move as EventListener, { passive: false })
    window.addEventListener('touchend', end as EventListener, { passive: false })
  }

  clear() {
    this.strokes = []
    this.currentStroke = []
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  undo() {
    if (this.strokes.length === 0) {
      return
    }

    this.strokes.pop()
    this.currentStroke = []
    this.redraw()
  }

  private redraw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    for (const stroke of this.strokes) {
      if (stroke.length === 0) {
        continue
      }

      const first = stroke[0]
      if (!first) {
        continue
      }

      this.ctx.beginPath()
      this.ctx.moveTo(first.x, first.y)

      for (let i = 1; i < stroke.length; i += 1) {
        const point = stroke[i]
        if (point) {
          this.ctx.lineTo(point.x, point.y)
        }
      }

      this.ctx.stroke()
    }
  }

  isEmpty() {
    return this.strokes.length === 0
  }

  toDataUrl() {
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = 1120
    exportCanvas.height = 360
    const exportCtx = exportCanvas.getContext('2d')

    if (!exportCtx) {
      throw new Error('Could not export signature.')
    }

    exportCtx.fillStyle = '#ffffff'
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
    const rect = this.canvas.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    exportCtx.drawImage(
      this.canvas,
      0,
      0,
      width,
      height,
      0,
      0,
      exportCanvas.width,
      exportCanvas.height,
    )

    return exportCanvas.toDataURL('image/png')
  }

  destroy() {
    this.clear()
  }
}

function queryElements(doc: Document): SettingsElements {
  const elements: SettingsElements = {
    root: doc.querySelector<HTMLElement>('[data-settings]')!,
    form: doc.querySelector<HTMLFormElement>('[data-settings-form]')!,
    save: doc.querySelector<HTMLButtonElement>('[data-settings-save]')!,
    reset: doc.querySelector<HTMLButtonElement>('[data-settings-reset]')!,
    theme: doc.querySelector<HTMLSelectElement>('[data-settings-theme]')!,
    notice: doc.querySelector<HTMLElement>('[data-settings-notice]')!,
    error: doc.querySelector<HTMLElement>('[data-settings-error]')!,
    logoPreview: doc.querySelector<HTMLElement>('[data-settings-logo-preview]'),
    logoImage: doc.querySelector<HTMLImageElement>('[data-settings-logo-image]'),
    previewName: doc.querySelector<HTMLElement>('[data-settings-preview-name]'),
    previewAddress: doc.querySelector<HTMLElement>('[data-settings-preview-address]'),
    previewPhone: doc.querySelector<HTMLElement>('[data-settings-preview-phone]'),
    signatureImage: doc.querySelector<HTMLImageElement>(
      '[data-settings-signature-image]',
    ),
    businessNameInput: doc.querySelector<HTMLInputElement>(
      '[data-settings-input="businessName"]',
    ),
    fullNameInput: doc.querySelector<HTMLInputElement>(
      '[data-settings-input="fullName"]',
    ),
    businessFields: doc.querySelectorAll<HTMLElement>(
      '[data-settings-business-field]',
    ),
    individualFields: doc.querySelectorAll<HTMLElement>(
      '[data-settings-individual-field]',
    ),
    photoFile: doc.querySelector<HTMLInputElement>(
      '[data-settings-photo-file]',
    ),
    photoUpload: doc.querySelector<HTMLButtonElement>(
      '[data-settings-photo-upload]',
    ),
    photoClear: doc.querySelector<HTMLButtonElement>(
      '[data-settings-photo-clear]',
    ),
    profilePhotoPreview: doc.querySelector<HTMLImageElement>(
      '[data-settings-profile-photo-preview]',
    ),
    profilePhotoPlaceholder: doc.querySelector<HTMLElement>(
      '[data-settings-profile-photo-placeholder]',
    ),
    signaturePreview: doc.querySelector<HTMLImageElement>(
      '[data-settings-signature-preview]',
    ),
    signaturePlaceholder: doc.querySelector<HTMLElement>(
      '[data-settings-signature-placeholder]',
    ),
    signatureFile: doc.querySelector<HTMLInputElement>(
      '[data-settings-signature-file]',
    ),
    signatureUpload: doc.querySelector<HTMLButtonElement>(
      '[data-settings-signature-upload]',
    ),
    signatureDraw: doc.querySelector<HTMLButtonElement>(
      '[data-settings-signature-draw]',
    ),
    signatureClear: doc.querySelector<HTMLButtonElement>(
      '[data-settings-signature-clear]',
    ),
    signaturePad: doc.querySelector<HTMLElement>(
      '[data-settings-signature-pad]',
    ),
    signatureCanvas: doc.querySelector<HTMLCanvasElement>(
      '[data-settings-signature-canvas]',
    ),
    signaturePadUndo: doc.querySelector<HTMLButtonElement>(
      '[data-settings-signature-pad-undo]',
    ),
    signaturePadClear: doc.querySelector<HTMLButtonElement>(
      '[data-settings-signature-pad-clear]',
    ),
    signaturePadSave: doc.querySelector<HTMLButtonElement>(
      '[data-settings-signature-pad-save]',
    ),
    signaturePadCancel: doc.querySelector<HTMLButtonElement>(
      '[data-settings-signature-pad-cancel]',
    ),
  }

  for (const [name, value] of Object.entries(elements)) {
    if (!value) {
      throw new Error(`Settings markup is incomplete: ${name}.`)
    }
  }

  return elements
}

export function applyTheme(
  doc: Document,
  preference: ThemePreference,
): void {
  const root = doc.documentElement
  root.dataset.theme = preference
  root.style.colorScheme =
    preference === 'dark'
      ? 'dark'
      : preference === 'light'
        ? 'light'
        : 'light dark'
}

export function readTheme(doc: Document): ThemePreference {
  try {
    const stored = doc.defaultView?.localStorage?.getItem(THEME_KEY)

    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    return 'system'
  }

  return 'system'
}

export function createSettingsPage(
  doc: Document,
  deps: SettingsDeps = {},
): SettingsController {
  const elements = queryElements(doc)
  const read = deps.readSettings ?? settingsService.readSettings
  const write = deps.setSettings ?? settingsService.setSettings
  const view = doc.defaultView
  let formDirty = false

  function setNotice(message: string) {
    elements.notice.textContent = message
    elements.notice.hidden = message === ''
  }

  function setError(message: string) {
    elements.error.hidden = message === ''
    elements.error.textContent = message
  }

  function readThemeSelect(): ThemePreference {
    const value = elements.theme.value
    return value === 'light' || value === 'dark' ? value : 'system'
  }

  function storeTheme(preference: ThemePreference) {
    try {
      view?.localStorage?.setItem(THEME_KEY, preference)
    } catch {
      return
    }
  }

  function readForm(): SettingsFormValues {
    const values = DEFAULT_SETTINGS
    const result = { ...values }

    for (const [field, key] of Object.entries(FIELD_MAP)) {
      if (field === 'profileType') {
        const checked = doc.querySelector<HTMLInputElement>(
          `[data-settings-input="profileType"]:checked`,
        )
        result.profileType = checked?.value ?? ''
        continue
      }

      const element = doc.querySelector<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >(`[data-settings-input="${key}"]`)
      result[field as keyof SettingsFormValues] = element?.value ?? ''
    }

    return result
  }

  function syncProfileType(values: SettingsFormValues) {
    const isIndividual = values.profileType === 'individual'

    for (const field of elements.businessFields) {
      field.hidden = isIndividual
    }

    for (const field of elements.individualFields) {
      field.hidden = !isIndividual
    }

    if (elements.businessNameInput) {
      if (isIndividual) {
        elements.businessNameInput.removeAttribute('required')
        elements.businessNameInput.removeAttribute('aria-required')
      } else {
        elements.businessNameInput.setAttribute('required', '')
        elements.businessNameInput.setAttribute('aria-required', 'true')
      }
    }

    if (elements.fullNameInput) {
      if (isIndividual) {
        elements.fullNameInput.setAttribute('required', '')
        elements.fullNameInput.setAttribute('aria-required', 'true')
      } else {
        elements.fullNameInput.removeAttribute('required')
        elements.fullNameInput.removeAttribute('aria-required')
      }
    }
  }

  function updatePreview(values: SettingsFormValues) {
    syncProfileType(values)

    if (elements.previewName) {
      const name =
        values.profileType === 'individual'
          ? values.fullName
          : values.businessName

      elements.previewName.textContent =
        name ||
        (values.profileType === 'individual' ? 'Your name' : 'Your business name')
    }

    if (elements.previewAddress) {
      elements.previewAddress.textContent =
        values.businessAddress ||
        (values.profileType === 'individual' ? 'Address' : 'Business address')
    }

    if (elements.previewPhone) {
      elements.previewPhone.textContent = values.businessPhone || 'Phone number'
    }

    const logo =
      values.profileType === 'individual'
        ? values.profilePhoto.trim()
        : values.businessLogo.trim()

    if (elements.logoImage && elements.logoPreview) {
      if (logo) {
        elements.logoImage.src = logo
        elements.logoImage.hidden = false
      } else {
        elements.logoImage.removeAttribute('src')
        elements.logoImage.hidden = true
      }
    }

    if (elements.profilePhotoPreview) {
      const photo = values.profilePhoto.trim()

      if (photo) {
        elements.profilePhotoPreview.src = photo
        elements.profilePhotoPreview.hidden = false
        if (elements.profilePhotoPlaceholder) {
          elements.profilePhotoPlaceholder.hidden = true
        }
      } else {
        elements.profilePhotoPreview.removeAttribute('src')
        elements.profilePhotoPreview.hidden = true
        if (elements.profilePhotoPlaceholder) {
          elements.profilePhotoPlaceholder.hidden = false
        }
      }
    }

    if (elements.signatureImage) {
      const signature = values.profileSignature.trim()

      if (signature) {
        elements.signatureImage.src = signature
        elements.signatureImage.hidden = false
      } else {
        elements.signatureImage.removeAttribute('src')
        elements.signatureImage.hidden = true
      }
    }

    if (elements.signaturePreview) {
      const signature = values.profileSignature.trim()

      if (signature) {
        elements.signaturePreview.src = signature
        elements.signaturePreview.hidden = false
        if (elements.signaturePlaceholder) {
          elements.signaturePlaceholder.hidden = true
        }
      } else {
        elements.signaturePreview.removeAttribute('src')
        elements.signaturePreview.hidden = true
        if (elements.signaturePlaceholder) {
          elements.signaturePlaceholder.hidden = false
        }
      }
    }
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
        } else {
          reject(new Error('Could not read the image.'))
        }
      }
      reader.onerror = () => reject(new Error('Could not read the image.'))
      reader.readAsDataURL(file)
    })
  }

  async function handlePhotoUpload(file: File) {
    setError('')
    setNotice('')

    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be smaller than 5 MB.')
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      if (dataUrl.length > 5000) {
        setError('Profile photo is too large. Please use a smaller image.')
        return
      }

      const input = doc.querySelector<HTMLInputElement>(
        '[data-settings-input="profilePhoto"]',
      )
      if (input) {
        input.value = dataUrl
        handleInput()
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not upload the photo.')
    }
  }

  async function handleSignatureUpload(file: File) {
    setError('')
    setNotice('')

    if (file.size > 5 * 1024 * 1024) {
      setError('Digital signature must be smaller than 5 MB.')
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      if (dataUrl.length > 5000) {
        setError('Digital signature is too large. Please use a smaller image.')
        return
      }

      const input = doc.querySelector<HTMLInputElement>(
        '[data-settings-input="profileSignature"]',
      )
      if (input) {
        input.value = dataUrl
        handleInput()
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not upload the signature.',
      )
    }
  }

  function clearPhoto() {
    setError('')
    setNotice('')
    const input = doc.querySelector<HTMLInputElement>(
      '[data-settings-input="profilePhoto"]',
    )
    if (input) {
      input.value = ''
      handleInput()
    }
  }

  function clearSignature() {
    setError('')
    setNotice('')
    const input = doc.querySelector<HTMLInputElement>(
      '[data-settings-input="profileSignature"]',
    )
    if (input) {
      input.value = ''
      handleInput()
    }
    if (elements.signaturePad) {
      elements.signaturePad.hidden = true
    }
  }

  function applyValues(values: SettingsFormValues) {
    setFormValues(doc, 'settings', {
      fullName: values.fullName,
      businessName: values.businessName,
      legalBusinessName: values.legalBusinessName,
      businessType: values.businessType,
      businessRegistrationNumber: values.businessRegistrationNumber,
      taxIdentificationNumber: values.taxIdentificationNumber,
      website: values.website,
      businessAddress: values.businessAddress,
      businessPhone: values.businessPhone,
      businessEmail: values.businessEmail,
      businessLogo: values.businessLogo,
      taxRegistrationDetails: values.taxRegistrationDetails,
      profilePhoto: values.profilePhoto,
      profileSignature: values.profileSignature,
      receiptPrefix: values.receiptPrefix,
      receiptCurrency: values.receiptCurrency,
      receiptTaxRate: values.receiptTaxRate,
      receiptNumberFormat: values.receiptNumberFormat,
      receiptFooterMessage: values.receiptFooterMessage,
      defaultPaymentMethod: values.defaultPaymentMethod,
      receiptTimezone: values.receiptTimezone,
      dateFormat: values.dateFormat,
      numberFormat: values.numberFormat,
    })

    for (const radio of doc.querySelectorAll<HTMLInputElement>(
      '[data-settings-input="profileType"]',
    )) {
      radio.checked = radio.value === values.profileType
    }

    updatePreview(values)
  }

  async function refresh(): Promise<void> {
    setError('')

    try {
      const settings = await read()
      const values = settingsToFormValues(settings)
      applyAppPreferences(values)

      if (!formDirty) {
        applyValues(values)
      }
      elements.theme.value = readTheme(doc)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Settings could not be loaded.',
      )
    }
  }

  let signaturePad: SignaturePad | null = null

  function ensureSignaturePad(): SignaturePad | null {
    if (signaturePad) {
      return signaturePad
    }

    if (!elements.signatureCanvas) {
      return null
    }

    try {
      signaturePad = new SignaturePad(elements.signatureCanvas)
      return signaturePad
    } catch {
      setError('Signature pad is not supported in this browser.')
      return null
    }
  }

  function openSignaturePad() {
    setError('')
    setNotice('')
    const pad = ensureSignaturePad()

    if (!pad) {
      return
    }

    if (elements.signaturePad) {
      elements.signaturePad.hidden = false
    }

    window.setTimeout(() => {
      pad.resize()
    }, 0)
  }

  function closeSignaturePad() {
    if (elements.signaturePad) {
      elements.signaturePad.hidden = true
    }
  }

  function saveSignatureFromPad() {
    const pad = ensureSignaturePad()

    if (!pad) {
      return
    }

    if (pad.isEmpty()) {
      setError('Draw your signature before using it.')
      return
    }

    try {
      const dataUrl = pad.toDataUrl()

      if (dataUrl.length > 5000) {
        setError('Signature is too large. Draw a smaller signature.')
        return
      }

      const input = doc.querySelector<HTMLInputElement>(
        '[data-settings-input="profileSignature"]',
      )
      if (input) {
        input.value = dataUrl
        handleInput()
      }
      closeSignaturePad()
      setNotice('Signature applied.')
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save the signature.',
      )
    }
  }

  async function handleSubmit(event?: Event) {
    event?.preventDefault()
    setError('')
    setNotice('')
    clearFormErrors(doc, 'settings')

    const values = readForm()
    const errors = validateSettings(values)

    if (Object.keys(errors).length > 0) {
      for (const [field, message] of Object.entries(errors)) {
        const element = doc.querySelector<HTMLElement>(
          `[data-settings-field-error="${field}"]`,
        )

        if (element) {
          element.textContent = message
          element.hidden = false
        }

        if (field !== 'profileType') {
          const input = doc.querySelector<HTMLElement>(
            `[data-settings-input="${field}"]`,
          )
          input?.setAttribute('aria-invalid', 'true')
        }
      }

      focusFirstField(doc, Object.keys(errors)[0] ?? 'businessName', 'settings')
      return
    }

    elements.save.disabled = true

    try {
      await write(formValuesToSettings(values))
      applyAppPreferences(values)
      const theme = readThemeSelect()
      storeTheme(theme)
      applyTheme(doc, theme)
      setNotice('Settings saved.')
      updatePreview(values)
      view?.dispatchEvent(new CustomEvent('paynote:data-changed'))
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Settings could not be saved.',
      )
    } finally {
      elements.save.disabled = false
    }
  }

  function handleReset() {
    if (!globalThis.confirm('Reset the form to default settings? Nothing is saved until you click Save.')) {
      return
    }

    formDirty = true
    applyValues(DEFAULT_SETTINGS)
    elements.theme.value = 'system'
    setNotice('Default values loaded. Click Save to apply them.')
  }

  function handleThemeChange() {
    const theme = readThemeSelect()
    applyTheme(doc, theme)
  }

  function handleInput() {
    formDirty = true
    updatePreview(readForm())
  }

  function onPhotoFileChange() {
    const file = elements.photoFile?.files?.[0]
    if (file) {
      void handlePhotoUpload(file)
      if (elements.photoFile) {
        elements.photoFile.value = ''
      }
    }
  }

  function onSignatureFileChange() {
    const file = elements.signatureFile?.files?.[0]
    if (file) {
      void handleSignatureUpload(file)
      if (elements.signatureFile) {
        elements.signatureFile.value = ''
      }
    }
  }

  elements.form.addEventListener('submit', handleSubmit)
  elements.reset.addEventListener('click', handleReset)
  elements.theme.addEventListener('change', handleThemeChange)
  elements.form.addEventListener('input', handleInput)
  elements.form.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | null

    if (target?.dataset.settingsInput === 'profileType') {
      const values = readForm()
      updatePreview(values)
    }
  })
  elements.photoUpload?.addEventListener('click', () => {
    setError('')
    elements.photoFile?.click()
  })
  elements.signatureUpload?.addEventListener('click', () => {
    setError('')
    elements.signatureFile?.click()
  })
  elements.signatureDraw?.addEventListener('click', openSignaturePad)
  elements.photoClear?.addEventListener('click', clearPhoto)
  elements.signatureClear?.addEventListener('click', clearSignature)
  elements.signaturePadUndo?.addEventListener('click', () => {
    ensureSignaturePad()?.undo()
    setError('')
  })
  elements.signaturePadClear?.addEventListener('click', () => {
    ensureSignaturePad()?.clear()
    setError('')
  })
  elements.signaturePadSave?.addEventListener('click', saveSignatureFromPad)
  elements.signaturePadCancel?.addEventListener('click', closeSignaturePad)
  elements.photoFile?.addEventListener('change', onPhotoFileChange)
  elements.signatureFile?.addEventListener('change', onSignatureFileChange)

  const handleResize = () => {
    signaturePad?.resize()
  }
  view?.addEventListener('resize', handleResize)

  applyTheme(doc, readTheme(doc))
  elements.theme.value = readTheme(doc)

  void refresh()

  return {
    refresh,
    destroy() {
      elements.form.removeEventListener('submit', handleSubmit)
      elements.form.removeEventListener('input', handleInput)
      elements.photoUpload?.removeEventListener('click', () => {
        setError('')
        elements.photoFile?.click()
      })
      elements.signatureUpload?.removeEventListener('click', () => {
        setError('')
        elements.signatureFile?.click()
      })
      elements.signatureDraw?.removeEventListener('click', openSignaturePad)
      elements.photoClear?.removeEventListener('click', clearPhoto)
      elements.signatureClear?.removeEventListener('click', clearSignature)
      elements.signaturePadUndo?.removeEventListener('click', () => ensureSignaturePad()?.undo())
      elements.signaturePadClear?.removeEventListener('click', () => {
        ensureSignaturePad()?.clear()
        setError('')
      })
      elements.signaturePadSave?.removeEventListener('click', saveSignatureFromPad)
      elements.signaturePadCancel?.removeEventListener('click', closeSignaturePad)
      elements.photoFile?.removeEventListener('change', onPhotoFileChange)
      elements.signatureFile?.removeEventListener('change', onSignatureFileChange)
      view?.removeEventListener('resize', handleResize)
      signaturePad?.destroy()
      signaturePad = null
    },
  }
}
