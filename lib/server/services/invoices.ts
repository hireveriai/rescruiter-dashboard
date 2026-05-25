import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { Prisma } from "@prisma/client"

import type { RecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { downloadInvoicePdf, uploadInvoicePdf } from "@/lib/server/invoice-storage"
import { prisma } from "@/lib/server/prisma"
import { sendBillingInvoiceEmail } from "@/lib/services/email.service"

type InvoiceSourceRow = {
  payment_id: string
  subscription_id: string
  organization_id: string
  user_id: string
  recruiter_email: string | null
  invoice_recipient_email: string | null
  recruiter_name: string | null
  organization_name: string
  gst_number: string | null
  billing_address: string | null
  plan_name: string
  interview_credits: number
  screening_credits: number
  original_amount_paise: number
  discount_amount_paise: number
  gst_percentage: number
  gst_amount_paise: number
  final_amount_paise: number
  currency: string
  coupon_code: string | null
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
}

type InvoiceRow = {
  id: string
  organization_id: string
  subscription_id: string
  payment_id: string
  invoice_number: string
  invoice_date: Date
  recruiter_email: string | null
  organization_name: string
  gst_number: string | null
  billing_address: string | null
  plan_name: string
  interview_credits: number
  screening_credits: number
  original_amount_paise: number
  discount_amount_paise: number
  taxable_amount_paise: number
  gst_percentage: number
  gst_amount_paise: number
  final_amount_paise: number
  currency: string
  coupon_code: string | null
  razorpay_order_id: string | null
  razorpay_payment_id: string | null
  invoice_pdf_url: string | null
  invoice_pdf_bucket: string | null
  invoice_pdf_key: string | null
  email_sent_at: Date | null
  created_at: Date
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 48

function formatPaise(value: number, currency = "INR") {
  return `${currency} ${(Number(value || 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value))
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-")
}

function getRecruiterAppUrl() {
  return (
    process.env.NEXT_PUBLIC_RECRUITER_APP_URL ||
    process.env.RECRUITER_APP_URL ||
    "https://recruiter.hireveri.com"
  ).replace(/\/+$/, "")
}

function getInvoiceDownloadUrl(invoiceId: string) {
  return `${getRecruiterAppUrl()}/api/billing/invoices/${invoiceId}/download`
}

function drawTextBlock(input: {
  page: import("pdf-lib").PDFPage
  text: string
  x: number
  y: number
  maxWidth: number
  font: import("pdf-lib").PDFFont
  size: number
  color?: ReturnType<typeof rgb>
  lineHeight?: number
}) {
  const { page, text, x, maxWidth, font, size } = input
  const color = input.color ?? rgb(0.15, 0.19, 0.27)
  const lineHeight = input.lineHeight ?? size + 5
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }

  if (current) lines.push(current)

  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: input.y - index * lineHeight,
      size,
      font,
      color,
    })
  })

  return input.y - Math.max(0, lines.length - 1) * lineHeight
}

function drawKeyValue(input: {
  page: import("pdf-lib").PDFPage
  label: string
  value: string
  x: number
  y: number
  labelWidth?: number
  font: import("pdf-lib").PDFFont
  bold: import("pdf-lib").PDFFont
}) {
  const labelWidth = input.labelWidth ?? 116
  input.page.drawText(input.label, {
    x: input.x,
    y: input.y,
    size: 9,
    font: input.font,
    color: rgb(0.39, 0.45, 0.55),
  })
  input.page.drawText(input.value || "-", {
    x: input.x + labelWidth,
    y: input.y,
    size: 10,
    font: input.bold,
    color: rgb(0.07, 0.11, 0.18),
  })
}

export async function generateInvoicePdf(input: InvoiceSourceRow & { invoice_number: string; invoice_date: Date }) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const taxableAmountPaise = Math.max(0, input.original_amount_paise - input.discount_amount_paise)

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 118, width: PAGE_WIDTH, height: 118, color: rgb(0.96, 0.98, 1) })
  page.drawText("HireVeri", { x: MARGIN, y: PAGE_HEIGHT - 62, size: 24, font: bold, color: rgb(0.06, 0.1, 0.18) })
  page.drawText("Verixans Technologies Pvt Ltd", { x: MARGIN, y: PAGE_HEIGHT - 84, size: 10, font: regular, color: rgb(0.32, 0.38, 0.48) })
  page.drawText("GST INVOICE", { x: PAGE_WIDTH - 170, y: PAGE_HEIGHT - 58, size: 16, font: bold, color: rgb(0.07, 0.11, 0.18) })
  page.drawText(input.invoice_number, { x: PAGE_WIDTH - 170, y: PAGE_HEIGHT - 80, size: 10, font: bold, color: rgb(0.15, 0.23, 0.4) })

  drawKeyValue({ page, label: "Invoice date", value: formatDate(input.invoice_date), x: MARGIN, y: PAGE_HEIGHT - 152, font: regular, bold })
  drawKeyValue({ page, label: "Organization", value: input.organization_name, x: MARGIN, y: PAGE_HEIGHT - 172, font: regular, bold })
  drawKeyValue({ page, label: "Recruiter email", value: input.recruiter_email || "-", x: MARGIN, y: PAGE_HEIGHT - 192, font: regular, bold })
  drawKeyValue({ page, label: "GSTIN", value: input.gst_number || "Not provided", x: MARGIN, y: PAGE_HEIGHT - 212, font: regular, bold })
  if (input.billing_address) {
    page.drawText("Billing address", {
      x: MARGIN,
      y: PAGE_HEIGHT - 236,
      size: 9,
      font: regular,
      color: rgb(0.39, 0.45, 0.55),
    })
    drawTextBlock({
      page,
      text: input.billing_address,
      x: MARGIN + 116,
      y: PAGE_HEIGHT - 236,
      maxWidth: 170,
      font: bold,
      size: 9,
      color: rgb(0.07, 0.11, 0.18),
      lineHeight: 13,
    })
  }

  drawKeyValue({ page, label: "Razorpay order", value: input.razorpay_order_id || "-", x: 330, y: PAGE_HEIGHT - 152, labelWidth: 92, font: regular, bold })
  drawKeyValue({ page, label: "Payment ID", value: input.razorpay_payment_id || "-", x: 330, y: PAGE_HEIGHT - 172, labelWidth: 92, font: regular, bold })
  drawKeyValue({ page, label: "Currency", value: input.currency, x: 330, y: PAGE_HEIGHT - 192, labelWidth: 92, font: regular, bold })
  drawKeyValue({ page, label: "Coupon", value: input.coupon_code || "None", x: 330, y: PAGE_HEIGHT - 212, labelWidth: 92, font: regular, bold })

  page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 342, width: PAGE_WIDTH - MARGIN * 2, height: 86, borderColor: rgb(0.86, 0.89, 0.94), borderWidth: 1 })
  page.drawText("Subscription", { x: MARGIN + 18, y: PAGE_HEIGHT - 282, size: 9, font: bold, color: rgb(0.39, 0.45, 0.55) })
  page.drawText("Credits", { x: 330, y: PAGE_HEIGHT - 282, size: 9, font: bold, color: rgb(0.39, 0.45, 0.55) })
  page.drawText("Amount", { x: 462, y: PAGE_HEIGHT - 282, size: 9, font: bold, color: rgb(0.39, 0.45, 0.55) })
  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 298 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 298 }, thickness: 1, color: rgb(0.89, 0.91, 0.95) })
  drawTextBlock({ page, text: input.plan_name, x: MARGIN + 18, y: PAGE_HEIGHT - 322, maxWidth: 250, font: bold, size: 11 })
  page.drawText(`${input.interview_credits} interviews`, { x: 330, y: PAGE_HEIGHT - 316, size: 10, font: regular, color: rgb(0.15, 0.19, 0.27) })
  page.drawText(`${input.screening_credits} screening`, { x: 330, y: PAGE_HEIGHT - 332, size: 10, font: regular, color: rgb(0.15, 0.19, 0.27) })
  page.drawText(formatPaise(input.original_amount_paise, input.currency), { x: 450, y: PAGE_HEIGHT - 322, size: 10, font: bold, color: rgb(0.07, 0.11, 0.18) })

  const totalsX = 330
  const totalsY = PAGE_HEIGHT - 398
  const totalRows = [
    ["Original amount", formatPaise(input.original_amount_paise, input.currency)],
    ["Discount", `-${formatPaise(input.discount_amount_paise, input.currency)}`],
    ["Taxable amount", formatPaise(taxableAmountPaise, input.currency)],
    [`GST ${Number(input.gst_percentage)}%`, formatPaise(input.gst_amount_paise, input.currency)],
  ]

  totalRows.forEach(([label, value], index) => {
    const y = totalsY - index * 22
    page.drawText(label, { x: totalsX, y, size: 10, font: regular, color: rgb(0.39, 0.45, 0.55) })
    page.drawText(value, { x: 450, y, size: 10, font: bold, color: rgb(0.07, 0.11, 0.18) })
  })
  page.drawLine({ start: { x: totalsX, y: totalsY - 92 }, end: { x: PAGE_WIDTH - MARGIN, y: totalsY - 92 }, thickness: 1, color: rgb(0.81, 0.85, 0.91) })
  page.drawText("Final paid", { x: totalsX, y: totalsY - 118, size: 12, font: bold, color: rgb(0.07, 0.11, 0.18) })
  page.drawText(formatPaise(input.final_amount_paise, input.currency), { x: 438, y: totalsY - 118, size: 12, font: bold, color: rgb(0.07, 0.11, 0.18) })

  page.drawRectangle({ x: MARGIN, y: 130, width: PAGE_WIDTH - MARGIN * 2, height: 86, color: rgb(0.98, 0.99, 1), borderColor: rgb(0.86, 0.89, 0.94), borderWidth: 1 })
  drawTextBlock({
    page,
    text: "Billing note: This invoice is generated after backend payment verification, Razorpay order validation, and organization subscription activation. Keep this document for GST reconciliation, procurement records, and audit review.",
    x: MARGIN + 18,
    y: 186,
    maxWidth: PAGE_WIDTH - MARGIN * 2 - 36,
    font: regular,
    size: 10,
    color: rgb(0.27, 0.33, 0.42),
    lineHeight: 15,
  })
  page.drawText("Support: support@hireveri.com", { x: MARGIN + 18, y: 150, size: 10, font: bold, color: rgb(0.15, 0.23, 0.4) })
  page.drawText("Generated by HireVeri Billing Infrastructure", { x: MARGIN, y: 72, size: 9, font: regular, color: rgb(0.45, 0.51, 0.6) })

  return Buffer.from(await pdf.save())
}

async function getNextInvoiceNumber(client: typeof prisma | Prisma.TransactionClient) {
  const rows = await client.$queryRaw<Array<{ sequence_value: bigint }>>(Prisma.sql`
    select nextval('public.hireveri_invoice_number_seq') as sequence_value
  `)
  const sequenceValue = Number(rows[0]?.sequence_value ?? 1)
  const year = new Date().getFullYear()
  return `HV-${year}-${String(sequenceValue).padStart(6, "0")}`
}

async function getInvoiceSource(paymentId: string) {
  const rows = await prisma.$queryRaw<InvoiceSourceRow[]>(Prisma.sql`
    select
      p.id as payment_id,
      p."subscriptionId" as subscription_id,
      p."organizationId"::text as organization_id,
      p."userId" as user_id,
      u.email as recruiter_email,
      coalesce(o.invoice_recipient_email, o.finance_email, u.email) as invoice_recipient_email,
      u.full_name as recruiter_name,
      o.organization_name,
      o.gst_number,
      o.billing_address,
      pl.name as plan_name,
      pl."interviewLimit" as interview_credits,
      pl."screeningCredits" as screening_credits,
      coalesce(p."originalAmountPaise", p.amount) as original_amount_paise,
      coalesce(p."discountAmountPaise", 0) as discount_amount_paise,
      coalesce(p."gstPercentage", 18)::float8 as gst_percentage,
      coalesce(p."gstAmountPaise", 0) as gst_amount_paise,
      coalesce(p."finalAmountPaise", p.amount) as final_amount_paise,
      coalesce(p.currency, 'INR') as currency,
      p."couponCode" as coupon_code,
      p."razorpayOrderId" as razorpay_order_id,
      p."razorpayPaymentId" as razorpay_payment_id
    from public.hireveri_payments p
    inner join public.organizations o on o.organization_id = p."organizationId"
    inner join public.users u on u.user_id = p."userId"::uuid
    inner join public.hireveri_plans pl on pl.id = p."planId"
    where p.id = ${paymentId}
      and p.status = 'success'::"PaymentStatus"
    limit 1
  `)

  if (!rows[0]) {
    throw new ApiError(404, "PAID_PAYMENT_NOT_FOUND", "Paid payment was not found")
  }

  return rows[0]
}

function mapInvoice(row: InvoiceRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subscriptionId: row.subscription_id,
    paymentId: row.payment_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    recruiterEmail: row.recruiter_email,
    organizationName: row.organization_name,
    gstNumber: row.gst_number,
    billingAddress: row.billing_address,
    planName: row.plan_name,
    interviewCredits: Number(row.interview_credits ?? 0),
    screeningCredits: Number(row.screening_credits ?? 0),
    originalAmountPaise: Number(row.original_amount_paise ?? 0),
    discountAmountPaise: Number(row.discount_amount_paise ?? 0),
    taxableAmountPaise: Number(row.taxable_amount_paise ?? 0),
    gstPercentage: Number(row.gst_percentage ?? 0),
    gstAmountPaise: Number(row.gst_amount_paise ?? 0),
    finalAmountPaise: Number(row.final_amount_paise ?? 0),
    currency: row.currency,
    couponCode: row.coupon_code,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
    invoicePdfUrl: row.invoice_pdf_url,
    emailSentAt: row.email_sent_at,
    createdAt: row.created_at,
  }
}

async function getExistingInvoiceByPayment(paymentId: string) {
  const rows = await prisma.$queryRaw<InvoiceRow[]>(Prisma.sql`
    select
      id::text,
      organization_id::text,
      subscription_id,
      payment_id,
      invoice_number,
      invoice_date,
      recruiter_email,
      organization_name,
      gst_number,
      billing_address,
      plan_name,
      interview_credits,
      screening_credits,
      original_amount_paise,
      discount_amount_paise,
      taxable_amount_paise,
      gst_percentage::float8 as gst_percentage,
      gst_amount_paise,
      final_amount_paise,
      currency,
      coupon_code,
      razorpay_order_id,
      razorpay_payment_id,
      invoice_pdf_url,
      invoice_pdf_bucket,
      invoice_pdf_key,
      email_sent_at,
      created_at
    from public.invoices
    where payment_id = ${paymentId}
    limit 1
  `)

  return rows[0] ?? null
}

export async function createAndSendInvoiceForPayment(input: { paymentId: string }) {
  const existing = await getExistingInvoiceByPayment(input.paymentId)
  if (existing) {
    return mapInvoice(existing)
  }

  const source = await getInvoiceSource(input.paymentId)
  const invoiceNumber = await getNextInvoiceNumber(prisma)
  const invoiceDate = new Date()
  const taxableAmountPaise = Math.max(0, Number(source.original_amount_paise) - Number(source.discount_amount_paise))
  const pdf = await generateInvoicePdf({
    ...source,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
  })
  const stored = await uploadInvoicePdf({
    organizationId: source.organization_id,
    invoiceNumber,
    buffer: pdf,
  })

  const invoiceRows = await prisma.$queryRaw<InvoiceRow[]>(Prisma.sql`
    insert into public.invoices (
      organization_id,
      subscription_id,
      payment_id,
      invoice_number,
      invoice_date,
      recruiter_email,
      organization_name,
      gst_number,
      billing_address,
      plan_name,
      interview_credits,
      screening_credits,
      original_amount_paise,
      discount_amount_paise,
      taxable_amount_paise,
      gst_percentage,
      gst_amount_paise,
      final_amount_paise,
      currency,
      coupon_code,
      razorpay_order_id,
      razorpay_payment_id,
      invoice_pdf_url,
      invoice_pdf_bucket,
      invoice_pdf_key,
      created_at
    )
    values (
      ${source.organization_id}::uuid,
      ${source.subscription_id},
      ${source.payment_id},
      ${invoiceNumber},
      ${invoiceDate},
      ${source.recruiter_email},
      ${source.organization_name},
      ${source.gst_number},
      ${source.billing_address},
      ${source.plan_name},
      ${Number(source.interview_credits ?? 0)},
      ${Number(source.screening_credits ?? 0)},
      ${Number(source.original_amount_paise ?? 0)},
      ${Number(source.discount_amount_paise ?? 0)},
      ${taxableAmountPaise},
      ${Number(source.gst_percentage ?? 18)},
      ${Number(source.gst_amount_paise ?? 0)},
      ${Number(source.final_amount_paise ?? 0)},
      ${source.currency},
      ${source.coupon_code},
      ${source.razorpay_order_id},
      ${source.razorpay_payment_id},
      ${stored.url},
      ${stored.bucket},
      ${stored.key},
      now()
    )
    on conflict (payment_id) do update set
      invoice_pdf_url = excluded.invoice_pdf_url,
      invoice_pdf_bucket = excluded.invoice_pdf_bucket,
      invoice_pdf_key = excluded.invoice_pdf_key
    returning
      id::text,
      organization_id::text,
      subscription_id,
      payment_id,
      invoice_number,
      invoice_date,
      recruiter_email,
      organization_name,
      gst_number,
      billing_address,
      plan_name,
      interview_credits,
      screening_credits,
      original_amount_paise,
      discount_amount_paise,
      taxable_amount_paise,
      gst_percentage::float8 as gst_percentage,
      gst_amount_paise,
      final_amount_paise,
      currency,
      coupon_code,
      razorpay_order_id,
      razorpay_payment_id,
      invoice_pdf_url,
      invoice_pdf_bucket,
      invoice_pdf_key,
      email_sent_at,
      created_at
  `)

  const invoice = invoiceRows[0]

  const recipientEmail = source.invoice_recipient_email || source.recruiter_email

  if (recipientEmail) {
    try {
      await sendBillingInvoiceEmail({
        to: recipientEmail,
        recruiterName: source.recruiter_name,
        organizationName: source.organization_name,
        planName: source.plan_name,
        invoiceNumber,
        invoiceDate: formatDate(invoiceDate),
        finalAmountLabel: formatPaise(source.final_amount_paise, source.currency),
        interviewCredits: Number(source.interview_credits ?? 0),
        screeningCredits: Number(source.screening_credits ?? 0),
        razorpayOrderId: source.razorpay_order_id,
        razorpayPaymentId: source.razorpay_payment_id,
        invoicePdfFileName: `${sanitizeFileName(invoiceNumber)}.pdf`,
        invoicePdfBase64: pdf.toString("base64"),
        invoiceDownloadUrl: getInvoiceDownloadUrl(invoice.id),
      })
      await prisma.$executeRaw(Prisma.sql`
        update public.invoices
        set email_sent_at = now()
        where id = ${invoice.id}::uuid
      `)
    } catch (error) {
      console.error("Billing invoice email failed", error)
    }
  }

  return mapInvoice({
    ...invoice,
      email_sent_at: recipientEmail ? new Date() : invoice.email_sent_at,
  })
}

export async function listOrganizationInvoices(auth: RecruiterRequestContext) {
  const rows = await prisma.$queryRaw<InvoiceRow[]>(Prisma.sql`
    select
      id::text,
      organization_id::text,
      subscription_id,
      payment_id,
      invoice_number,
      invoice_date,
      recruiter_email,
      organization_name,
      gst_number,
      billing_address,
      plan_name,
      interview_credits,
      screening_credits,
      original_amount_paise,
      discount_amount_paise,
      taxable_amount_paise,
      gst_percentage::float8 as gst_percentage,
      gst_amount_paise,
      final_amount_paise,
      currency,
      coupon_code,
      razorpay_order_id,
      razorpay_payment_id,
      invoice_pdf_url,
      invoice_pdf_bucket,
      invoice_pdf_key,
      email_sent_at,
      created_at
    from public.invoices
    where organization_id = ${auth.organizationId}::uuid
    order by invoice_date desc, created_at desc
  `)

  return rows.map(mapInvoice)
}

export async function getOrganizationBillingHistory(auth: RecruiterRequestContext) {
  const [invoices, organizationRows, subscriptionRows, paymentRows, screeningUsageRows] = await Promise.all([
    listOrganizationInvoices(auth),
    prisma.$queryRaw<
      Array<{
        organization_id: string
        organization_name: string
        gst_number: string | null
        billing_address: string | null
        finance_email: string | null
        invoice_recipient_email: string | null
      }>
    >(Prisma.sql`
      select
        organization_id::text,
        organization_name,
        gst_number,
        billing_address,
        finance_email,
        invoice_recipient_email
      from public.organizations
      where organization_id = ${auth.organizationId}::uuid
      limit 1
    `),
    prisma.$queryRaw<
      Array<{
        id: string
        plan_name: string | null
        plan_id: string
        status: string
        total_credits: number
        used_credits: number
        screening_credits: number
        amount_paid: number
        currency: string
        activated_at: Date | null
        expires_at: Date | null
      }>
    >(Prisma.sql`
      select
        s.id,
        p.name as plan_name,
        s."planId" as plan_id,
        s.status,
        s."totalCredits" as total_credits,
        s."usedCredits" as used_credits,
        s."screeningCredits" as screening_credits,
        s."amountPaid" as amount_paid,
        s.currency,
        s."activatedAt" as activated_at,
        s."expiresAt" as expires_at
      from public.hireveri_user_subscriptions s
      left join public.hireveri_plans p on p.id = s."planId"
      where s."organizationId" = ${auth.organizationId}::uuid
      order by s."updatedAt" desc
      limit 10
    `),
    prisma.$queryRaw<
      Array<{
        id: string
        plan_id: string | null
        plan_name: string | null
        invoice_number: string | null
        invoice_id: string | null
        coupon_code: string | null
        taxable_amount_paise: number | null
        gst_amount_paise: number | null
        discount_amount_paise: number | null
        amount: number
        final_amount_paise: number | null
        currency: string | null
        status: string
        razorpay_order_id: string | null
        razorpay_payment_id: string | null
        created_at: Date
      }>
    >(Prisma.sql`
      select
        pay.id,
        pay."planId" as plan_id,
        p.name as plan_name,
        inv.invoice_number,
        inv.id::text as invoice_id,
        pay."couponCode" as coupon_code,
        pay."originalAmountPaise" - pay."discountAmountPaise" as taxable_amount_paise,
        pay."gstAmountPaise" as gst_amount_paise,
        pay."discountAmountPaise" as discount_amount_paise,
        pay.amount,
        pay."finalAmountPaise" as final_amount_paise,
        pay.currency,
        pay.status::text as status,
        pay."razorpayOrderId" as razorpay_order_id,
        pay."razorpayPaymentId" as razorpay_payment_id,
        pay."createdAt" as created_at
      from public.hireveri_payments pay
      left join public.hireveri_plans p on p.id = pay."planId"
      left join public.invoices inv on inv.payment_id = pay.id
      where pay."organizationId" = ${auth.organizationId}::uuid
      order by pay."createdAt" desc
      limit 25
    `),
    prisma.$queryRaw<Array<{ used_screening_credits: number }>>(Prisma.sql`
      select coalesce(count(*), 0)::int as used_screening_credits
      from public.screening_runs
      where organization_id = ${auth.organizationId}::uuid
    `).catch(() => [{ used_screening_credits: 0 }]),
  ])
  const organization = organizationRows[0] ?? null
  const screeningUsed = Number(screeningUsageRows[0]?.used_screening_credits ?? 0)

  return {
    organization: organization
      ? {
          organizationId: organization.organization_id,
          organizationName: organization.organization_name,
          gstNumber: organization.gst_number,
          billingAddress: organization.billing_address,
          financeEmail: organization.finance_email,
          invoiceRecipientEmail: organization.invoice_recipient_email,
        }
      : null,
    invoices,
    subscriptions: subscriptionRows.map((row) => ({
      id: row.id,
      planName: row.plan_name,
      planId: row.plan_id,
      status: row.status,
      totalCredits: Number(row.total_credits ?? 0),
      usedCredits: Number(row.used_credits ?? 0),
      screeningCredits: Number(row.screening_credits ?? 0),
      usedScreeningCredits: screeningUsed,
      amountPaid: Number(row.amount_paid ?? 0),
      currency: row.currency,
      activatedAt: row.activated_at,
      expiresAt: row.expires_at,
    })),
    payments: paymentRows.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      planName: row.plan_name,
      invoiceNumber: row.invoice_number,
      invoiceId: row.invoice_id,
      couponCode: row.coupon_code,
      taxableAmountPaise: Number(row.taxable_amount_paise ?? 0),
      gstAmountPaise: Number(row.gst_amount_paise ?? 0),
      discountAmountPaise: Number(row.discount_amount_paise ?? 0),
      amount: Number(row.final_amount_paise ?? row.amount ?? 0),
      currency: row.currency ?? "INR",
      status: row.status,
      razorpayOrderId: row.razorpay_order_id,
      razorpayPaymentId: row.razorpay_payment_id,
      createdAt: row.created_at,
    })),
  }
}

export async function updateOrganizationBillingSettings(input: {
  auth: RecruiterRequestContext
  gstNumber?: string | null
  billingAddress?: string | null
  financeEmail?: string | null
  invoiceRecipientEmail?: string | null
}) {
  const normalizeNullable = (value: string | null | undefined) => {
    if (typeof value !== "string") {
      return null
    }

    const trimmed = value.trim()
    return trimmed || null
  }
  const rows = await prisma.$queryRaw<
    Array<{
      organization_id: string
      organization_name: string
      gst_number: string | null
      billing_address: string | null
      finance_email: string | null
      invoice_recipient_email: string | null
    }>
  >(Prisma.sql`
    update public.organizations
    set gst_number = ${normalizeNullable(input.gstNumber)},
        billing_address = ${normalizeNullable(input.billingAddress)},
        finance_email = ${normalizeNullable(input.financeEmail)},
        invoice_recipient_email = ${normalizeNullable(input.invoiceRecipientEmail)}
    where organization_id = ${input.auth.organizationId}::uuid
      and is_active = true
    returning
      organization_id::text,
      organization_name,
      gst_number,
      billing_address,
      finance_email,
      invoice_recipient_email
  `)

  if (!rows[0]) {
    throw new ApiError(404, "ORGANIZATION_NOT_FOUND", "Organization was not found")
  }

  return {
    organizationId: rows[0].organization_id,
    organizationName: rows[0].organization_name,
    gstNumber: rows[0].gst_number,
    billingAddress: rows[0].billing_address,
    financeEmail: rows[0].finance_email,
    invoiceRecipientEmail: rows[0].invoice_recipient_email,
  }
}

export async function getInvoicePdfForDownload(input: {
  auth: RecruiterRequestContext
  invoiceId: string
}) {
  const rows = await prisma.$queryRaw<InvoiceRow[]>(Prisma.sql`
    select
      id::text,
      organization_id::text,
      subscription_id,
      payment_id,
      invoice_number,
      invoice_date,
      recruiter_email,
      organization_name,
      gst_number,
      billing_address,
      plan_name,
      interview_credits,
      screening_credits,
      original_amount_paise,
      discount_amount_paise,
      taxable_amount_paise,
      gst_percentage::float8 as gst_percentage,
      gst_amount_paise,
      final_amount_paise,
      currency,
      coupon_code,
      razorpay_order_id,
      razorpay_payment_id,
      invoice_pdf_url,
      invoice_pdf_bucket,
      invoice_pdf_key,
      email_sent_at,
      created_at
    from public.invoices
    where id = ${input.invoiceId}::uuid
      and organization_id = ${input.auth.organizationId}::uuid
    limit 1
  `)
  const invoice = rows[0]

  if (!invoice) {
    throw new ApiError(404, "INVOICE_NOT_FOUND", "Invoice was not found")
  }

  if (!invoice.invoice_pdf_bucket || !invoice.invoice_pdf_key) {
    throw new ApiError(404, "INVOICE_PDF_NOT_AVAILABLE", "Invoice PDF is not available")
  }

  const pdf = await downloadInvoicePdf({
    bucket: invoice.invoice_pdf_bucket,
    key: invoice.invoice_pdf_key,
  })

  return {
    fileName: `${sanitizeFileName(invoice.invoice_number)}.pdf`,
    pdf,
  }
}
