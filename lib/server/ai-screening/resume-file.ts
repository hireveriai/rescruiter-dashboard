type PdfTextContentItem = {
  str?: string
}

type PdfPageProxy = {
  getTextContent: () => Promise<{ items: PdfTextContentItem[] }>
  cleanup?: () => void
}

type PdfDocumentProxy = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
  destroy?: () => Promise<void>
}

type PdfLoadingTask = {
  promise: Promise<PdfDocumentProxy>
  destroy?: () => Promise<void>
}

type PdfWorkerModule = {
  WorkerMessageHandler?: unknown
}

export function isSupportedResumeFile(file: File) {
  return isPdfFile(file) || isDocxFile(file)
}

export function getResumeFileKind(file: File) {
  if (isPdfFile(file)) {
    return "PDF"
  }

  if (isDocxFile(file)) {
    return "DOCX"
  }

  return "UNKNOWN"
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

function isDocxFile(file: File) {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Unknown error"
}

async function ensurePdfDomPolyfills() {
  if (globalThis.DOMMatrix && globalThis.DOMPoint && globalThis.DOMRect) {
    return
  }

  const geometryModule = await import("@napi-rs/canvas/geometry.js")

  if (!globalThis.DOMMatrix && geometryModule.DOMMatrix) {
    globalThis.DOMMatrix = geometryModule.DOMMatrix as typeof DOMMatrix
  }

  if (!globalThis.DOMPoint && geometryModule.DOMPoint) {
    globalThis.DOMPoint = geometryModule.DOMPoint as typeof DOMPoint
  }

  if (!globalThis.DOMRect && geometryModule.DOMRect) {
    globalThis.DOMRect = geometryModule.DOMRect as typeof DOMRect
  }
}

async function ensurePdfWorkerModule() {
  const existingWorker = (globalThis as typeof globalThis & { pdfjsWorker?: PdfWorkerModule }).pdfjsWorker

  if (existingWorker?.WorkerMessageHandler) {
    return
  }

  const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs")
  ;(globalThis as typeof globalThis & { pdfjsWorker?: PdfWorkerModule }).pdfjsWorker =
    workerModule as PdfWorkerModule
}

async function ensurePdfServerRuntime() {
  await ensurePdfDomPolyfills()
  await ensurePdfWorkerModule()
}

async function extractPdfTextWithPdfJs(resumeBuffer: Buffer) {
  await ensurePdfServerRuntime()
  const pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs")

  const getDocument = pdfjsModule.getDocument as (options: {
    data: Uint8Array
    useWorkerFetch?: boolean
    isEvalSupported?: boolean
    useSystemFonts?: boolean
  }) => PdfLoadingTask

  const loadingTask = getDocument({
    data: new Uint8Array(resumeBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })

  const pdfDocument = await loadingTask.promise

  try {
    const pages: string[] = []

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)

      try {
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .map((item) => item.str?.trim() ?? "")
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()

        if (pageText) {
          pages.push(pageText)
        }
      } finally {
        page.cleanup?.()
      }
    }

    return pages.join("\n").trim() || null
  } finally {
    await pdfDocument.destroy?.()
    await loadingTask.destroy?.()
  }
}

async function extractPdfTextWithPdfParse(resumeBuffer: Buffer) {
  await ensurePdfServerRuntime()
  const pdfParseModule = await import("pdf-parse")
  const PDFParse = ("PDFParse" in pdfParseModule ? pdfParseModule.PDFParse : null) as unknown as
    | {
        new (options: { data: Uint8Array | Buffer | ArrayBuffer }): {
          getText: () => Promise<{ text?: string }>
          destroy?: () => Promise<void>
        }
      }
    | null

  if (!PDFParse) {
    throw new Error("pdf-parse PDFParse export is unavailable")
  }

  const parser = new PDFParse({ data: resumeBuffer })

  try {
    const parsed = await parser.getText()
    return parsed.text?.trim() || null
  } finally {
    await parser.destroy?.()
  }
}

async function extractDocxText(resumeBuffer: Buffer) {
  const mammothModule = await import("mammoth")
  const mammoth = "default" in mammothModule ? mammothModule.default : mammothModule
  const parsed = await mammoth.extractRawText({ buffer: resumeBuffer })
  return parsed.value?.trim() || null
}

export async function extractResumeText(file: File, resumeBuffer: Buffer) {
  if (isPdfFile(file)) {
    const parserErrors: string[] = []

    try {
      const text = await extractPdfTextWithPdfJs(resumeBuffer)
      if (text) {
        return text
      }
      parserErrors.push("pdfjs-dist returned empty text")
    } catch (error) {
      parserErrors.push(`pdfjs-dist: ${getErrorMessage(error)}`)
    }

    try {
      const text = await extractPdfTextWithPdfParse(resumeBuffer)
      if (text) {
        return text
      }
      parserErrors.push("pdf-parse returned empty text")
    } catch (error) {
      parserErrors.push(`pdf-parse: ${getErrorMessage(error)}`)
    }

    throw new Error(parserErrors.join(" | "))
  }

  if (isDocxFile(file)) {
    return extractDocxText(resumeBuffer)
  }

  return null
}
