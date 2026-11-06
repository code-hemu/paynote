import type { PrintableReceipt } from '../domain/print.ts'
import { getAppPreferences } from '../services/preferences.ts'
import { formatCurrency, formatDate, formatLabel } from '../utils/format.ts'

export interface ReceiptQr {
  svg: string
  link: string
}

export interface ReceiptSheetOptions {
  qr?: ReceiptQr
  footerMessage?: string
}

export function renderReceiptSheet(
  doc: Document,
  printable: PrintableReceipt,
  options: ReceiptSheetOptions = {},
): HTMLElement {
  const sheet = doc.createElement('article')
  sheet.className = 'receipt-sheet'

  const header = doc.createElement('header')
  header.className = 'receipt-sheet-header'

  const titleBlock = doc.createElement('div')
  titleBlock.className = 'receipt-sheet-header-title'
  const title = doc.createElement('h1')
  title.textContent = 'Receipt'
  const subtitle = doc.createElement('h2')
  subtitle.textContent = printable.category
  const subtitleRow = doc.createElement('div')
  subtitleRow.className = 'receipt-sheet-header-subtitle'
  subtitleRow.append(subtitle)

  if (printable.status) {
    const status = doc.createElement('span')
    status.className = `receipt-sheet-header-status receipt-sheet-header-status-${printable.status.toLowerCase()}`
    status.textContent = printable.status
    subtitleRow.append(status)
  }
  const tagline = doc.createElement('p')
  tagline.textContent = 'Official Payment Acknowledgement'
  titleBlock.append(title, subtitleRow, tagline)

  const meta = doc.createElement('div')
  meta.className = 'receipt-sheet-header-meta'

  const metaReceipt = doc.createElement('div')
  metaReceipt.className = 'receipt-sheet-meta-item'
  const metaReceiptLabel = doc.createElement('span')
  metaReceiptLabel.textContent = 'Receipt No.'
  const metaReceiptValue = doc.createElement('strong')
  metaReceiptValue.textContent = printable.receiptNumber
  metaReceipt.append(metaReceiptLabel, metaReceiptValue)

  const metaDate = doc.createElement('div')
  metaDate.className = 'receipt-sheet-meta-item'
  const metaDateLabel = doc.createElement('span')
  metaDateLabel.textContent = 'Date'
  const metaDateValue = doc.createElement('strong')
  metaDateValue.textContent = formatDate(printable.receiptDate)
  metaDate.append(metaDateLabel, metaDateValue)

  meta.append(metaReceipt, metaDate)
  header.append(titleBlock, meta)
  sheet.append(header)

  function appendSectionTitle(text: string) {
    const heading = doc.createElement('div')
    heading.className = 'receipt-sheet-section-title'
    heading.textContent = text
    sheet.append(heading)
  }

  function appendDetailLine(container: HTMLElement, text: string) {
    const line = doc.createElement('p')
    line.textContent = text
    container.append(line)
  }

  const parties = doc.createElement('div')
  parties.className = 'receipt-sheet-parties'

  const issuerBox = doc.createElement('section')
  issuerBox.className = 'receipt-sheet-party-box'
  const issuerHeading = doc.createElement('div')
  issuerHeading.className = 'receipt-sheet-box-title'
  issuerHeading.textContent = 'Issued By'
  const issuer = doc.createElement('div')
  issuer.className = 'receipt-sheet-details'
  const issuerName = doc.createElement('strong')
  issuerName.textContent = printable.business.name || 'PayNote'
  issuer.append(issuerName)

  for (const line of [
    [
      printable.business.address,
      printable.business.phone,
      printable.business.email,
    ]
      .filter(Boolean)
      .join(' · '),
    [printable.business.website, printable.business.taxRegistration]
      .filter(Boolean)
      .join(' · '),
  ].filter(Boolean)) {
    appendDetailLine(issuer, line)
  }

  issuerBox.append(issuerHeading, issuer)

  const receiverBox = doc.createElement('section')
  receiverBox.className = 'receipt-sheet-party-box'
  const receiverHeading = doc.createElement('div')
  receiverHeading.className = 'receipt-sheet-box-title'
  receiverHeading.textContent = 'Received From'
  const receiver = doc.createElement('div')
  receiver.className = 'receipt-sheet-details'
  const receiverName = doc.createElement('strong')
  receiverName.textContent = printable.customerName || 'Walk-in'
  receiver.append(receiverName)

  const receiverLine = [
    printable.customerAddress,
    printable.customerPhone,
    printable.customerEmail,
  ]
    .filter(Boolean)
    .join(' · ')

  if (receiverLine) {
    appendDetailLine(receiver, receiverLine)
  }

  if (printable.propertyName) {
    appendDetailLine(receiver, `Property: ${propertyLabel(printable)}`)
  }

  receiverBox.append(receiverHeading, receiver)
  parties.append(issuerBox, receiverBox)
  sheet.append(parties)

  appendSectionTitle('Payment Details')
  const table = doc.createElement('table')
  table.className = 'receipt-sheet-table'
  const head = doc.createElement('thead')
  const headRow = doc.createElement('tr')

  for (const label of ['Particulars', 'Details']) {
    const cell = doc.createElement('th')
    cell.textContent = label
    headRow.append(cell)
  }

  head.append(headRow)
  const body = doc.createElement('tbody')
  const skipLabels = new Set<string>()

  function appendPaymentRow(label: string, value: string) {
    if (!value) {
      return
    }

    const row = doc.createElement('tr')
    const term = doc.createElement('td')
    term.textContent = label
    const description = doc.createElement('td')
    description.textContent = value
    row.append(term, description)
    body.append(row)
    skipLabels.add(label.toLowerCase())
  }

  appendPaymentRow('Amount Received', formatCurrency(printable.totalPaise))
  appendPaymentRow('Amount in Words', printable.amountWords)
  appendPaymentRow('Category', printable.category)

  if (printable.propertyName) {
    appendPaymentRow('Property', propertyLabel(printable))
  }

  const period = printable.details.find((detail) =>
    detail.label.toLowerCase().includes('period'),
  )

  if (period) {
    appendPaymentRow('Payment Period', period.value)
  }

  appendPaymentRow('Payment Mode', printable.paymentMethod)

  if (printable.referenceNumber) {
    appendPaymentRow(printable.referenceLabel, printable.referenceNumber)
  }

  for (const detail of printable.details) {
    if (!skipLabels.has(detail.label.toLowerCase())) {
      appendPaymentRow(detail.label, detail.value)
    }
  }

  table.append(head, body)
  sheet.append(table)

  if (printable.items.length > 0) {
    appendSectionTitle('Line Items')
    const itemsTable = doc.createElement('table')
    itemsTable.className = 'receipt-sheet-table receipt-sheet-items-table'
    const itemsHead = doc.createElement('thead')
    const itemsHeadRow = doc.createElement('tr')

    for (const label of [
      'Description',
      'Qty',
      'Rate',
      'Discount',
      'Total',
    ]) {
      const cell = doc.createElement('th')
      cell.textContent = label
      itemsHeadRow.append(cell)
    }

    itemsHead.append(itemsHeadRow)
    const itemsBody = doc.createElement('tbody')

    for (const item of printable.items) {
      const row = doc.createElement('tr')
      for (const value of [
        item.description,
        formatQuantity(item.quantity),
        formatCurrency(item.ratePaise),
        formatCurrency(item.discountPaise),
        formatCurrency(item.lineTotalPaise),
      ]) {
        const cell = doc.createElement('td')
        cell.textContent = value
        row.append(cell)
      }
      itemsBody.append(row)
    }

    itemsTable.append(itemsHead, itemsBody)
    sheet.append(itemsTable)
  }

  const amountBox = doc.createElement('div')
  amountBox.className = 'receipt-sheet-amount-box'
  const amount = doc.createElement('div')
  amount.className = 'receipt-sheet-amount'
  amount.textContent = formatCurrency(printable.totalPaise)
  const amountLabel = doc.createElement('p')
  amountLabel.textContent = 'Total Amount Received'
  amountBox.append(amount, amountLabel)
  sheet.append(amountBox)

  function appendNote(label: string, value: string) {
    const block = doc.createElement('section')
    block.className = 'receipt-sheet-note-section'
    const heading = doc.createElement('h3')
    heading.textContent = label
    const text = doc.createElement('p')
    text.textContent = value
    block.append(heading, text)
    sheet.append(block)
  }

  if (printable.description) {
    appendNote('Description', printable.description)
  }

  if (printable.notes) {
    appendNote('Notes', printable.notes)
  }

  const acknowledgement = doc.createElement('div')
  acknowledgement.className = 'receipt-sheet-acknowledgement'
  acknowledgement.textContent = `I hereby acknowledge receipt of the above-mentioned amount from ${
    printable.customerName || 'the customer'
  }${printable.propertyName ? ` for ${printable.propertyName}` : ''} towards ${printable.category.toLowerCase()}.`
  sheet.append(acknowledgement)

  const signatureRow = doc.createElement('div')
  signatureRow.className = 'receipt-sheet-signature-row'

  if (options.qr) {
    const qrBlock = doc.createElement('div')
    qrBlock.className = 'receipt-sheet-qr'
    qrBlock.setAttribute(
      'aria-label',
      `Scan to view receipt ${printable.receiptNumber}`,
    )
    const qrGraphic = doc.createElement('div')
    qrGraphic.className = 'receipt-sheet-qr-code'
    qrGraphic.innerHTML = options.qr.svg
    const qrLabel = doc.createElement('span')
    qrLabel.textContent = 'Scan to view receipt'
    qrBlock.append(qrGraphic, qrLabel)
    signatureRow.append(qrBlock)
  }

  const signature = doc.createElement('div')
  signature.className = 'receipt-sheet-signature'

  if (printable.business.signature) {
    const signatureImage = doc.createElement('img')
    signatureImage.className = 'receipt-sheet-signature-image'
    signatureImage.src = printable.business.signature
    signatureImage.alt = ''
    signature.append(signatureImage)
  }

  const signatureLine = doc.createElement('hr')
  const signatureTitle = doc.createElement('strong')
  signatureTitle.textContent = 'Authorised Signatory'
  signature.append(
    signatureLine,
    signatureTitle,
    doc.createElement('br'),
    printable.business.name || 'PayNote',
  )
  signatureRow.append(signature)
  sheet.append(signatureRow)

  const footer = doc.createElement('footer')
  footer.className = 'receipt-sheet-footer'
  const configuredFooter =
    options.footerMessage === undefined
      ? getAppPreferences().footerMessage
      : options.footerMessage
  footer.textContent = configuredFooter || 'Thank you for your payment.'
  sheet.append(footer)

  return sheet
}

function propertyLabel(printable: PrintableReceipt): string {
  return printable.propertyType
    ? `${printable.propertyName} (${formatLabel(printable.propertyType)})`
    : printable.propertyName
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}
