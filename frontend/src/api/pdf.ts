export function pickPdfs(multiple = true) {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf'
    input.multiple = multiple
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true })
    input.addEventListener('cancel', () => resolve([]), { once: true })
    input.click()
  })
}

export async function pdfInput(file: File | string): Promise<{ path: string } | { name: string; content: string }> {
  if (typeof file === 'string') return { path: file }
  if (file.size > 50 * 1024 * 1024) throw new Error('Choose a readable PDF up to 50 MB.')
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Could not read the selected PDF.'))
    reader.readAsDataURL(file)
  })
  return { name: file.name, content }
}

export function downloadText(file: { name: string; text: string }) {
  const url = URL.createObjectURL(new Blob([file.text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
