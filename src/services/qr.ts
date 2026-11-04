export async function createQrSvg(value: string): Promise<string> {
  const qrcode = await import('qrcode')

  return qrcode.toString(value, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
  })
}
