"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { buildAuthUrl } from "@/lib/client/auth-query"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

type Plan = {
  id: string
  slug: string
  name: string
  description: string
  amountPaise: number
  currency: string
  interviewSessions: number
  screeningReviews: number
  isPopular: boolean
  features: string[]
}

type Quote = {
  originalAmountPaise: number
  discountPercentage: number
  discountAmountPaise: number
  taxableAmountPaise: number
  gstPercentage: number
  gstAmountPaise: number
  finalAmountPaise: number
  currency: string
}

type Organization = {
  organizationId: string
  organizationName: string
  userName: string
  userEmail: string
}

type CheckoutSummary = {
  plan: Plan
  coupon: {
    code: string
    description: string
    discountPercentage: number
  } | null
  quote: Quote
  organization: Organization
}

type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

type RazorpaySuccessResponse = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type RazorpayFailureResponse = {
  error?: {
    code?: string
    description?: string
    source?: string
    step?: string
    reason?: string
    metadata?: {
      order_id?: string
      payment_id?: string
    }
  }
}

type RazorpayInstance = {
  open: () => void
  on: (event: "payment.failed", handler: (response: RazorpayFailureResponse) => void) => void
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js"

function formatPaise(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0) / 100)
}

function getErrorMessage(payload: ApiResponse<unknown> | null, fallback: string) {
  return payload?.error?.message || fallback
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false)
      return
    }

    if (window.Razorpay) {
      resolve(true)
      return
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT_URL}"]`)

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true), { once: true })
      existingScript.addEventListener("error", () => resolve(false), { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = RAZORPAY_SCRIPT_URL
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function BillingCheckoutPage() {
  const router = useRouter()
  const routeSearchParams = useSearchParams()
  const authSearchParams = useAuthSearchParams()
  const planSlug = routeSearchParams.get("plan")?.trim().toLowerCase() || ""
  const [summary, setSummary] = useState<CheckoutSummary | null>(null)
  const [couponInput, setCouponInput] = useState("")
  const [appliedCouponCode, setAppliedCouponCode] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "applying" | "paying" | "verifying" | "success">("loading")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [activeOrderId, setActiveOrderId] = useState("")

  const isBusy = status === "loading" || status === "applying" || status === "paying" || status === "verifying"
  const appliedCoupon = useMemo(() => appliedCouponCode.trim().toUpperCase(), [appliedCouponCode])

  const requestJson = useCallback(
    async <T,>(path: string, body: Record<string, unknown>) => {
      const response = await fetch(buildAuthUrl(path, authSearchParams), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
      })
      const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null

      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(getErrorMessage(payload, "Request failed"))
      }

      return payload.data
    },
    [authSearchParams]
  )

  const loadSummary = useCallback(
    async (couponCode?: string | null) => {
      if (!planSlug) {
        setStatus("idle")
        setError("Select a plan before opening checkout.")
        return
      }

      setStatus(couponCode ? "applying" : "loading")
      setError("")
      setNotice("")

      try {
        const data = await requestJson<CheckoutSummary>("/api/validate-coupon", {
          plan: planSlug,
          coupon_code: couponCode || null,
        })

        setSummary(data)
        setAppliedCouponCode(data.coupon?.code ?? "")
        setNotice(data.coupon ? `${data.coupon.code} applied successfully.` : "")
        setStatus("idle")
      } catch (requestError) {
        setStatus("idle")
        setError(requestError instanceof Error ? requestError.message : "Unable to load checkout.")
        if (couponCode) {
          setAppliedCouponCode("")
        }
      }
    },
    [planSlug, requestJson]
  )

  useEffect(() => {
    loadSummary(null)
  }, [loadSummary])

  async function markOrderTerminal(orderId: string, terminalStatus: "failed" | "cancelled", reason: string) {
    try {
      await requestJson("/api/payment-failed", {
        razorpay_order_id: orderId,
        status: terminalStatus,
        reason,
      })
    } catch {
      // Best-effort state sync; verification still remains the activation gate.
    }
  }

  async function handleApplyCoupon() {
    const couponCode = couponInput.trim().toUpperCase()

    if (!couponCode) {
      setError("Enter a coupon code to apply.")
      return
    }

    await loadSummary(couponCode)
  }

  async function handleRemoveCoupon() {
    setCouponInput("")
    setAppliedCouponCode("")
    await loadSummary(null)
  }

  async function verifyPayment(response: RazorpaySuccessResponse) {
    setStatus("verifying")
    setError("")
    setNotice("Verifying Razorpay signature and activating your organization subscription.")

    const result = await requestJson<{
      alreadyVerified: boolean
      plan: Plan | null
      subscription: {
        status: string
        interviewCredits: number
        screeningCredits: number
      } | null
    }>("/api/verify-payment", {
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature,
    })

    const activatedPlanName = result.plan?.name || summary?.plan.name || "selected plan"

    try {
      window.sessionStorage.setItem(
        "hireveri-billing-success",
        JSON.stringify({
          title: "Subscription activated",
          message: `${activatedPlanName} is live for ${summary?.organization.organizationName || "your organization"}.`,
        })
      )
      window.sessionStorage.removeItem("hireveri-overview")
    } catch {
      // Non-critical; dashboard still redirects correctly.
    }

    setStatus("success")
    setNotice("Payment verified. Redirecting to recruiter dashboard.")
    router.replace(buildAuthUrl("/", authSearchParams))
  }

  async function handleProceedToPayment() {
    if (!summary || isBusy) {
      return
    }

    setStatus("paying")
    setError("")
    setNotice("Creating a secure Razorpay order.")

    try {
      const scriptLoaded = await loadRazorpayScript()

      if (!scriptLoaded || !window.Razorpay) {
        throw new Error("Unable to load Razorpay checkout. Please try again.")
      }

      const order = await requestJson<
        CheckoutSummary & {
          order_id: string
          amount: number
          currency: string
          keyId: string
        }
      >("/api/create-order", {
        plan: planSlug,
        coupon_code: appliedCoupon || null,
      })

      setSummary({
        plan: order.plan,
        coupon: order.coupon,
        quote: order.quote,
        organization: order.organization,
      })
      setActiveOrderId(order.order_id)
      setNotice("Opening Razorpay secure checkout.")

      let handledBySuccess = false
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "HireVeri",
        description: `${order.plan.name} plan for ${order.organization.organizationName}`,
        order_id: order.order_id,
        prefill: {
          name: order.organization.userName,
          email: order.organization.userEmail,
        },
        notes: {
          organization_id: order.organization.organizationId,
          plan: order.plan.slug,
          coupon: order.coupon?.code ?? "",
        },
        theme: {
          color: "#22d3ee",
        },
        modal: {
          ondismiss: async () => {
            if (handledBySuccess) {
              return
            }

            setStatus("idle")
            setNotice("")
            setError("Payment was cancelled before completion.")
            await markOrderTerminal(order.order_id, "cancelled", "Razorpay modal dismissed")
          },
        },
        handler: async (response: RazorpaySuccessResponse) => {
          handledBySuccess = true
          try {
            await verifyPayment(response)
          } catch (verificationError) {
            setStatus("idle")
            setNotice("")
            setError(
              verificationError instanceof Error
                ? verificationError.message
                : "Payment verification failed. Your subscription was not activated."
            )
          }
        },
      })

      checkout.on("payment.failed", (response) => {
        const reason =
          response.error?.description ||
          response.error?.reason ||
          response.error?.code ||
          "Razorpay payment failed"

        setStatus("idle")
        setNotice("")
        setError(reason)
      })

      checkout.open()
    } catch (paymentError) {
      setStatus("idle")
      setNotice("")
      setError(paymentError instanceof Error ? paymentError.message : "Unable to start Razorpay checkout.")
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#07101d] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(59,130,246,0.13),transparent_26%),linear-gradient(180deg,rgba(7,16,29,0),rgba(7,16,29,0.96))]" />
      <div className="pointer-events-none fixed inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] [background-size:88px_88px]" />

      <section className="relative mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.7fr)]">
        <div className="rounded-[28px] border border-cyan-400/18 bg-slate-950/72 p-6 shadow-[0_0_100px_rgba(34,211,238,0.10)] backdrop-blur-xl sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-cyan-300/80">
            Secure Billing Checkout
          </p>
          <h1 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight text-white sm:text-5xl">
            Activate HireVeri for your organization
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Payment orders, coupons, GST, and activation are verified on HireVeri servers before credits are issued.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Organization</p>
              <p className="mt-3 truncate text-sm font-semibold text-white">
                {summary?.organization.organizationName || "Loading workspace"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Interview Credits</p>
              <p className="mt-3 text-2xl font-semibold text-cyan-100">
                {summary?.plan.interviewSessions ?? "--"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Screening Reviews</p>
              <p className="mt-3 text-2xl font-semibold text-cyan-100">
                {summary?.plan.screeningReviews ?? "--"}
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-[#0b1424]/88 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-cyan-200">Selected plan</p>
                <h2 className="mt-2 text-3xl font-semibold text-white">{summary?.plan.name || "Loading plan"}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                  {summary?.plan.description || "Fetching dynamic plan details from the billing database."}
                </p>
              </div>
              {summary?.plan.isPopular ? (
                <span className="inline-flex rounded-full border border-cyan-300/35 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                  Common choice
                </span>
              ) : null}
            </div>

            {summary?.plan.features?.length ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {summary.plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
                    <span className="mt-1 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.8)]" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(8,15,30,0.96),rgba(11,20,36,0.94))] p-6 shadow-[0_0_100px_rgba(34,211,238,0.12)] backdrop-blur-xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Payable Summary</p>
              <p className="mt-3 text-sm text-slate-300">Backend verified quote</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100">
              Powered by Razorpay
            </div>
          </div>

          <div className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-slate-950/45 p-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-400">Plan amount</span>
              <span className="font-medium text-white">
                {summary ? formatPaise(summary.quote.originalAmountPaise, summary.quote.currency) : "--"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-400">Coupon discount</span>
              <span className="font-medium text-emerald-200">
                {summary ? `-${formatPaise(summary.quote.discountAmountPaise, summary.quote.currency)}` : "--"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-400">Taxable amount</span>
              <span className="font-medium text-white">
                {summary ? formatPaise(summary.quote.taxableAmountPaise, summary.quote.currency) : "--"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-400">GST {summary ? `${summary.quote.gstPercentage}%` : ""}</span>
              <span className="font-medium text-white">
                {summary ? formatPaise(summary.quote.gstAmountPaise, summary.quote.currency) : "--"}
              </span>
            </div>
            <div className="border-t border-white/10 pt-4">
              <div className="flex items-end justify-between gap-4">
                <span className="text-sm font-semibold text-slate-200">Final payable</span>
                <span className="text-3xl font-semibold text-white">
                  {summary ? formatPaise(summary.quote.finalAmountPaise, summary.quote.currency) : "--"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            <label htmlFor="coupon" className="text-sm font-semibold text-white">
              Coupon code
            </label>
            <div className="mt-3 flex gap-2">
              <input
                id="coupon"
                value={couponInput}
                onChange={(event) => {
                  setCouponInput(event.target.value.toUpperCase())
                  if (error) {
                    setError("")
                  }
                }}
                disabled={isBusy}
                placeholder="WELCOME10"
                className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={isBusy || !couponInput.trim()}
                className="rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply
              </button>
            </div>

            {appliedCoupon ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                <span>{appliedCoupon} active</span>
                <button type="button" onClick={handleRemoveCoupon} disabled={isBusy} className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/80 hover:text-white">
                  Remove
                </button>
              </div>
            ) : null}
          </div>

          {notice ? (
            <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleProceedToPayment}
            disabled={!summary || isBusy || status === "success"}
            className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-4 text-sm font-bold text-slate-950 shadow-[0_20px_60px_rgba(34,211,238,0.25)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {status === "paying"
              ? "Opening Razorpay..."
              : status === "verifying"
                ? "Verifying payment..."
                : status === "success"
                  ? "Payment verified"
                  : "Proceed to Secure Payment"}
          </button>

          <p className="mt-4 text-center text-xs leading-5 text-slate-500">
            Subscription activates only after backend signature, order, amount, coupon, and organization checks pass.
          </p>

          {activeOrderId ? (
            <p className="mt-3 truncate text-center text-[11px] uppercase tracking-[0.18em] text-slate-600">
              Order {activeOrderId}
            </p>
          ) : null}
        </aside>
      </section>
    </main>
  )
}
