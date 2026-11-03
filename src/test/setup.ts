/// <reference types="node" />

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>()

  get length() {
    return this.items.size
  }

  clear() {
    this.items.clear()
  }

  getItem(key: string) {
    return this.items.get(key) ?? null
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.items.delete(key)
  }

  setItem(key: string, value: string) {
    this.items.set(key, String(value))
  }
}

Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: new MemoryStorage(),
  },
  configurable: true,
  writable: true,
})

Object.defineProperty(globalThis, 'navigator', {
  value: {
    platform: 'Test browser',
    storage: {
      estimate: async () => ({ usage: 0, quota: 1024 * 1024 }),
    },
  },
  configurable: true,
  writable: true,
})
