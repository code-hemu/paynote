export interface NavItem {
  label: string
  path: string
}

export const navigation: readonly NavItem[] = [
  { label: 'Dashboard', path: '/' },
  { label: 'New Receipt', path: '/receipts/new' },
  { label: 'Receipt History', path: '/receipts' },
  { label: 'Customers', path: '/customers' },
  { label: 'Properties', path: '/properties' },
  { label: 'Reports', path: '/reports' },
  { label: 'Backup & Restore', path: '/backup' },
  { label: 'Settings', path: '/settings' },
]

export function normalizePath(value: string): string {
  let path = value.trim()

  if (path.startsWith('#')) {
    path = path.slice(1)
  }

  if (!path) {
    return '/'
  }

  if (!path.startsWith('/')) {
    path = `/${path}`
  }

  if (path.length > 1) {
    path = path.replace(/\/+$/, '')
  }

  return path || '/'
}

export function findNavItem(path: string): NavItem | undefined {
  return navigation.find((item) => item.path === normalizePath(path))
}
