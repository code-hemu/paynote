import type { FormErrors } from './form-validation.ts'

export function readFormValues(
  doc: Document,
  prefix: string,
): Record<string, string> {
  const values: Record<string, string> = {}

  for (const element of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    `[data-${prefix}-input]`,
  )) {
    const field = element.dataset[`${prefix}Input`]

    if (field) {
      values[field] = element.value
    }
  }

  return values
}

export function setFormValues(
  doc: Document,
  prefix: string,
  values: Record<string, string>,
): void {
  for (const element of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    `[data-${prefix}-input]`,
  )) {
    const field = element.dataset[`${prefix}Input`]
    const type = (element as HTMLInputElement).type

    if (field && type !== 'radio' && type !== 'checkbox') {
      element.value = values[field] ?? ''
    }
  }
}

export function clearFormErrors(doc: Document, prefix: string): void {
  for (const element of doc.querySelectorAll<HTMLElement>(
    `[data-${prefix}-field-error]`,
  )) {
    element.textContent = ''
    element.hidden = true
  }

  for (const element of doc.querySelectorAll<HTMLElement>(
    `[data-${prefix}-input]`,
  )) {
    element.removeAttribute('aria-invalid')
  }

  const summary = doc.querySelector<HTMLElement>(`[data-${prefix}-form-error]`)

  if (summary) {
    summary.textContent = ''
    summary.hidden = true
  }
}

export function showFormErrors(
  doc: Document,
  prefix: string,
  errors: FormErrors,
  summaryMessage = 'Please fix the highlighted fields.',
): void {
  clearFormErrors(doc, prefix)

  for (const element of doc.querySelectorAll<HTMLElement>(
    `[data-${prefix}-field-error]`,
  )) {
    const field = element.dataset[`${prefix}FieldError`] ?? ''
    const message = errors[field]

    element.textContent = message ?? ''
    element.hidden = !message
  }

  for (const element of doc.querySelectorAll<HTMLElement>(
    `[data-${prefix}-input]`,
  )) {
    const field = element.dataset[`${prefix}Input`] ?? ''

    if (errors[field]) {
      element.setAttribute('aria-invalid', 'true')
    }
  }

  const summary = doc.querySelector<HTMLElement>(`[data-${prefix}-form-error]`)

  if (summary) {
    summary.textContent = summaryMessage
    summary.hidden = false
  }
}

export function showFormError(
  doc: Document,
  prefix: string,
  message: string,
): void {
  clearFormErrors(doc, prefix)

  const summary = doc.querySelector<HTMLElement>(`[data-${prefix}-form-error]`)

  if (summary) {
    summary.textContent = message
    summary.hidden = false
  }
}

export function focusElement(element: HTMLElement | null | undefined): void {
  const focus = (element as unknown as { focus?: () => void } | null)?.focus

  focus?.call(element)
}

export function focusFirstField(doc: Document, field: string, prefix: string) {
  focusElement(
    doc.querySelector<HTMLElement>(`[data-${prefix}-input="${field}"]`),
  )
}
