export async function createQrSvgDataUrl(value: string): Promise<string> {
  const qrcode = await import('qrcode')
  const svg = await qrcode.toString(value, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
  })

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
