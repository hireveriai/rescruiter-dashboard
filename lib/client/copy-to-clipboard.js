export async function copyText(value) {
  const text = String(value ?? "")

  if (!text) {
    return false
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (_error) {
  }

  if (typeof document === "undefined") {
    return false
  }

  try {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.setAttribute("readonly", "")
    textArea.style.position = "fixed"
    textArea.style.top = "-1000px"
    textArea.style.left = "-1000px"
    textArea.style.opacity = "0"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    textArea.setSelectionRange(0, text.length)

    const copied = document.execCommand("copy")
    document.body.removeChild(textArea)
    return copied
  } catch (_error) {
    return false
  }
}
