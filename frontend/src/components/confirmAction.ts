// Hosted in the WebView so confirmation also works without native browser dialogs.
export function confirmAction(message: string, cancel: string, confirm: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog')
    dialog.className = 'dialog-backdrop'
    dialog.setAttribute('aria-label', message)
    const panel = document.createElement('div')
    panel.className = 'dialog'
    const prompt = document.createElement('p')
    prompt.textContent = message
    const form = document.createElement('form')
    form.method = 'dialog'
    form.className = 'dialog-actions'
    for (const [label, value, style] of [[cancel, 'cancel', 'ghost-btn'], [confirm, 'confirm', 'danger']]) {
      const button = document.createElement('button')
      button.textContent = label
      button.value = value
      button.className = style
      form.append(button)
    }
    panel.append(prompt, form)
    dialog.append(panel)
    dialog.addEventListener('close', () => {
      dialog.remove()
      resolve(dialog.returnValue === 'confirm')
    }, { once: true })
    document.body.append(dialog)
    dialog.showModal()
  })
}
