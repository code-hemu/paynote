import type { PrintableReceipt } from '../domain/print.ts'

export interface ReceiptShareDetails {
  version: 1
  businessName: string
  businessAddress: string
  businessPhone: string
  businessEmail: string
  receiptNumber: string
  receiptDate: string
  status: string
  customerName: string
  customerPhone: string
  customerEmail: string
  customerAddress: string
  propertyName: string
  category: string
  amountPaise: number
}

export interface ReceiptShareToken {
  ciphertext: string
  key: string
  compact?: string
}

export interface ReceiptShareLink {
  url: string
  details: ReceiptShareDetails
}

interface ShareWirePayload {
  v: 1
  b: string
  ba: string
  bp: string
  be: string
  n: string
  d: string
  s: string
  c: string
  cp: string
  ce: string
  ca: string
  p: string
  k: string
  a: number
}

const SHARE_VERSION = 1
const SHARE_QUERY_KEY = 'p'
const SHARE_FRAGMENT_KEY = 'k'
const COMPACT_SHARE_KEY = 'r'
const COMPACT_SHARE_VERSION = 1
const COMPACT_FIELDS = 8
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16
const MAX_CIPHERTEXT_LENGTH = 4096
const MAX_FIELD_LENGTH = 500
const AAD = new TextEncoder().encode('paynote-receipt-share-v1')
const INVALID_LINK_MESSAGE =
  'This receipt link is invalid or has been altered.'

export function receiptShareDetails(
  printable: PrintableReceipt,
): ReceiptShareDetails {
  return {
    version: SHARE_VERSION,
    businessName: printable.business.name,
    businessAddress: printable.business.address,
    businessPhone: printable.business.phone,
    businessEmail: printable.business.email,
    receiptNumber: printable.receiptNumber,
    receiptDate: printable.receiptDate,
    status: printable.status,
    customerName: printable.customerName,
    customerPhone: printable.customerPhone,
    customerEmail: printable.customerEmail,
    customerAddress: printable.customerAddress,
    propertyName: printable.propertyName,
    category: printable.category,
    amountPaise: printable.totalPaise,
  }
}

export function createReceiptQrLink(
  baseUrl: string,
  printable: PrintableReceipt,
): ReceiptShareLink {
  const details = receiptShareDetails(printable)
  const payload = [
    COMPACT_SHARE_VERSION,
    printable.receiptNumber,
    printable.receiptDate,
    printable.category,
    printable.business.name,
    printable.customerName,
    printable.totalPaise,
    printable.propertyName,
  ]
  const encoded = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = `${COMPACT_SHARE_KEY}=${encoded}`

  return { url: url.href, details }
}

export async function createReceiptShareLink(
  baseUrl: string,
  printable: PrintableReceipt,
): Promise<ReceiptShareLink> {
  const details = receiptShareDetails(printable)
  const keyBytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    'AES-GCM',
    false,
    ['encrypt'],
  )
  const encoded = new TextEncoder().encode(
    JSON.stringify(toWirePayload(details)),
  )
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: AAD },
      key,
      encoded,
    ),
  )
  const packed = new Uint8Array(iv.length + encrypted.length)
  packed.set(iv)
  packed.set(encrypted, iv.length)

  const url = new URL(baseUrl)
  url.search = ''
  url.hash = ''
  url.searchParams.set(SHARE_QUERY_KEY, encodeBase64Url(packed))
  url.hash = `${SHARE_FRAGMENT_KEY}=${encodeBase64Url(keyBytes)}`

  return { url: url.href, details }
}

export function readReceiptShareToken(href: string): ReceiptShareToken | null {
  let url: URL

  try {
    url = new URL(href)
  } catch {
    return null
  }

  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const compact = fragment.get(COMPACT_SHARE_KEY)

  if (compact !== null) {
    return { ciphertext: '', key: '', compact }
  }

  const ciphertext = url.searchParams.get(SHARE_QUERY_KEY)

  if (ciphertext === null) {
    return null
  }

  return {
    ciphertext,
    key: fragment.get(SHARE_FRAGMENT_KEY) ?? '',
  }
}

export function decodeCompactReceiptShare(
  value: string,
): ReceiptShareDetails {
  try {
    if (!value || value.length > MAX_CIPHERTEXT_LENGTH) {
      throw new Error(INVALID_LINK_MESSAGE)
    }

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(value)),
    ) as unknown

    if (
      !Array.isArray(payload) ||
      payload.length < COMPACT_FIELDS - 1 ||
      payload[0] !== COMPACT_SHARE_VERSION
    ) {
      throw new Error(INVALID_LINK_MESSAGE)
    }

    const amountPaise = payload[6]

    if (
      !Number.isSafeInteger(amountPaise) ||
      (amountPaise as number) < 0
    ) {
      throw new Error(INVALID_LINK_MESSAGE)
    }

    return {
      version: SHARE_VERSION,
      businessName: readString(payload[4]),
      businessAddress: '',
      businessPhone: '',
      businessEmail: '',
      receiptNumber: readString(payload[1]),
      receiptDate: readString(payload[2]),
      status: '',
      customerName: readString(payload[5]),
      customerPhone: '',
      customerEmail: '',
      customerAddress: '',
      propertyName:
        payload.length > 7 ? readOptionalString(payload[7]) : '',
      category: readString(payload[3]),
      amountPaise: amountPaise as number,
    }
  } catch {
    throw new Error(INVALID_LINK_MESSAGE)
  }
}

export async function parseReceiptShare(
  token: ReceiptShareToken,
): Promise<ReceiptShareDetails> {
  return token.compact === undefined
    ? decryptReceiptShare(token)
    : decodeCompactReceiptShare(token.compact)
}

export async function decryptReceiptShare(
  token: ReceiptShareToken,
): Promise<ReceiptShareDetails> {
  try {
    if (!token.key) {
      throw new Error(INVALID_LINK_MESSAGE)
    }

    if (token.ciphertext.length > MAX_CIPHERTEXT_LENGTH) {
      throw new Error(INVALID_LINK_MESSAGE)
    }

    const keyBytes = decodeBase64Url(token.key)
    const packed = decodeBase64Url(token.ciphertext)

    if (
      keyBytes.length !== KEY_BYTES ||
      packed.length < IV_BYTES + TAG_BYTES
    ) {
      throw new Error(INVALID_LINK_MESSAGE)
    }

    const iv = packed.slice(0, IV_BYTES)
    const encrypted = packed.slice(IV_BYTES)
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      'AES-GCM',
      false,
      ['decrypt'],
    )
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: AAD },
      key,
      encrypted,
    )

    return parseDetails(
      JSON.parse(new TextDecoder().decode(decrypted)) as unknown,
    )
  } catch {
    throw new Error(INVALID_LINK_MESSAGE)
  }
}

function toWirePayload(details: ReceiptShareDetails): ShareWirePayload {
  return {
    v: SHARE_VERSION,
    b: details.businessName,
    ba: details.businessAddress,
    bp: details.businessPhone,
    be: details.businessEmail,
    n: details.receiptNumber,
    d: details.receiptDate,
    s: details.status,
    c: details.customerName,
    cp: details.customerPhone,
    ce: details.customerEmail,
    ca: details.customerAddress,
    p: details.propertyName,
    k: details.category,
    a: details.amountPaise,
  }
}

function parseDetails(value: unknown): ReceiptShareDetails {
  if (!value || typeof value !== 'object') {
    throw new Error(INVALID_LINK_MESSAGE)
  }

  const payload = value as Record<string, unknown>

  if (payload.v !== SHARE_VERSION) {
    throw new Error(INVALID_LINK_MESSAGE)
  }

  const amountPaise = payload.a

  if (
    !Number.isSafeInteger(amountPaise) ||
    (amountPaise as number) < 0
  ) {
    throw new Error(INVALID_LINK_MESSAGE)
  }

  return {
    version: SHARE_VERSION,
    businessName: readString(payload.b),
    businessAddress: readOptionalString(payload.ba),
    businessPhone: readOptionalString(payload.bp),
    businessEmail: readOptionalString(payload.be),
    receiptNumber: readString(payload.n),
    receiptDate: readString(payload.d),
    status: readString(payload.s),
    customerName: readString(payload.c),
    customerPhone: readOptionalString(payload.cp),
    customerEmail: readOptionalString(payload.ce),
    customerAddress: readOptionalString(payload.ca),
    propertyName: readString(payload.p),
    category: readString(payload.k),
    amountPaise: amountPaise as number,
  }
}

function readString(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH) {
    throw new Error(INVALID_LINK_MESSAGE)
  }

  return value
}

function readOptionalString(value: unknown): string {
  return value === undefined ? '' : readString(value)
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(INVALID_LINK_MESSAGE)
  }

  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(
    value.replace(/-/g, '+').replace(/_/g, '/') + padding,
  )
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}
