export interface GlobalErrorHandling {
  destroy(): void
}

export function installGlobalErrorHandling(
  doc: Document,
): GlobalErrorHandling {
  const view = doc.defaultView
  const panel = doc.querySelector<HTMLElement>('[data-global-error]')
  const message = doc.querySelector<HTMLElement>('[data-global-error-message]')
  const dismiss = doc.querySelector<HTMLButtonElement>('[data-global-error-dismiss]')
  const reload = doc.querySelector<HTMLButtonElement>('[data-global-error-reload]')

  function show(text: string) {
    if (!panel) {
      return
    }

    if (message) {
      message.textContent = text
    }

    panel.hidden = false
  }

  function hide() {
    if (panel) {
      panel.hidden = true
    }
  }

  function handleError(event: ErrorEvent) {
    show(
      'Something unexpected happened. Your saved data is still safe. Reload the page to continue.',
    )
    event.preventDefault?.()
  }

  function handleRejection(event: PromiseRejectionEvent) {
    show(
      'A background task failed. Your saved data is still safe. Reload the page to try again.',
    )
    event.preventDefault?.()
  }

  dismiss?.addEventListener('click', hide)
  reload?.addEventListener('click', () => view?.location.reload())
  view?.addEventListener('error', handleError)
  view?.addEventListener('unhandledrejection', handleRejection)

  return {
    destroy() {
      view?.removeEventListener('error', handleError)
      view?.removeEventListener('unhandledrejection', handleRejection)
    },
  }
}
