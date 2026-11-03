type Listener = () => void

export class FakeElement {
  readonly attributes = new Map<string, string>()
  readonly children: FakeElement[] = []
  readonly dataset: Record<string, string> = {}
  readonly listeners = new Map<string, Set<Listener>>()
  className = ''
  disabled = false
  focused = false
  hidden = false
  textContent = ''
  value = ''

  constructor(dataset: Record<string, string> = {}, attributes: Record<string, string> = {}) {
    Object.assign(this.dataset, dataset)

    for (const [name, value] of Object.entries(attributes)) {
      this.setAttribute(name, value)
    }
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  append(...nodes: Array<FakeElement | string>) {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.textContent += node
      } else {
        this.children.push(node)
      }
    }
  }

  replaceChildren(...nodes: Array<FakeElement | string>) {
    this.children.length = 0
    this.textContent = ''
    this.append(...nodes)
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener()
    }
  }

  click() {
    this.dispatch('click')
  }

  focus() {
    this.focused = true
  }
}

export class FakeWindow {
  readonly location = { hash: '' }
  private readonly listeners = new Map<string, Set<Listener>>()

  setInterval(_callback: Listener, _delay: number) {
    return 0
  }

  clearInterval(_timer: number) {}

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener()
    }
  }
}

export class FakeDocument {
  readonly defaultView: FakeWindow
  readonly elements: FakeElement[] = []
  private readonly listeners = new Map<string, Set<Listener>>()
  title = ''
  visibilityState = 'visible'

  constructor(defaultView: FakeWindow) {
    this.defaultView = defaultView
  }

  add(element: FakeElement) {
    this.elements.push(element)
    return element
  }

  querySelectorAll(selector: string) {
    const match = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector)

    if (!match) {
      return []
    }

    const attribute = match[1] ?? ''
    const value = match[2]
    const dataKey = attribute.startsWith('data-')
      ? attribute.slice(5).replace(/-([a-z])/g, (_found, letter: string) => letter.toUpperCase())
      : undefined

    return this.elements.filter((element) => {
      if (dataKey && dataKey in element.dataset) {
        return value === undefined || element.dataset[dataKey] === value
      }

      return element.attributes.has(attribute) && (value === undefined || element.attributes.get(attribute) === value)
    })
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null
  }

  createElement(_tag: string) {
    return new FakeElement()
  }

  createElementNS(_namespace: string, _tag: string) {
    return new FakeElement()
  }

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener()
    }
  }
}
