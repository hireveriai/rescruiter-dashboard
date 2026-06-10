type VerisGlobeStep = {
  label: string
  detail: string
}

type VerisGlobeLoaderProps = {
  eyebrow?: string
  steps?: VerisGlobeStep[]
  activeIndex?: number
  fullscreen?: boolean
}

const defaultSteps: VerisGlobeStep[] = [
  {
    label: "Loading workspace",
    detail: "Preparing recruiter intelligence and secure workspace context.",
  },
  {
    label: "Syncing records",
    detail: "Loading the latest candidates, interviews, and hiring signals.",
  },
  {
    label: "Building view",
    detail: "Organizing the data into the recruiter screen.",
  },
  {
    label: "Results ready",
    detail: "The workspace is ready for review.",
  },
]

const wavePaths = [
  { path: "M 325 325 C 242 250 146 198 50 216", end: [50, 216], color: "#f472b6" },
  { path: "M 325 325 C 230 306 128 300 52 300", end: [52, 300], color: "#fb7185" },
  { path: "M 325 325 C 226 374 130 406 50 390", end: [50, 390], color: "#f472b6" },
  { path: "M 325 325 C 394 190 478 100 598 92", end: [598, 92], color: "#c084fc" },
  { path: "M 325 325 C 424 286 512 276 602 280", end: [602, 280], color: "#a855f7" },
  { path: "M 325 325 C 430 384 518 448 596 506", end: [596, 506], color: "#c084fc" },
]

export default function VerisGlobeLoader({
  eyebrow = "VERIS Screening",
  steps = defaultSteps,
  activeIndex = 0,
  fullscreen = true,
}: VerisGlobeLoaderProps) {
  const safeSteps = steps.length > 0 ? steps : defaultSteps
  const safeIndex = Math.min(Math.max(activeIndex, 0), safeSteps.length - 1)
  const activeStep = safeSteps[safeIndex] ?? safeSteps[0]
  const progress = Math.round(((safeIndex + 1) / safeSteps.length) * 100)

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={[
        "relative flex items-center justify-center overflow-hidden bg-[#08070d]/88 px-4 py-8 text-white backdrop-blur-xl",
        fullscreen ? "min-h-screen" : "min-h-[560px] rounded-[28px] border border-slate-800",
      ].join(" ")}
      role="status"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(236,72,153,0.22),transparent_31%),radial-gradient(circle_at_50%_50%,rgba(192,132,252,0.12),transparent_48%),linear-gradient(180deg,rgba(24,13,24,0.42),rgba(2,6,23,0.84))]" />
      <div aria-hidden="true" className="hv-veris-loader-grid absolute inset-0 opacity-25" />

      <div className="relative flex h-full w-full max-w-6xl items-center justify-center animate-[overlay-panel-in_220ms_ease-out_forwards]">
        <div className="relative flex aspect-square w-[min(96vw,96vh,650px)] items-center justify-center">
          <div className="hv-veris-loader-ring absolute inset-0 rounded-full border border-fuchsia-300/10" />
          <div className="hv-veris-loader-ring-reverse absolute inset-[8%] rounded-full border border-dashed border-pink-400/24" />
          <div className="absolute inset-[16%] rounded-full border border-fuchsia-400/14" />
          <div className="absolute inset-[24%] rounded-full border border-pink-300/14" />

          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 650 650"
          >
            {wavePaths.map((wave, index) => {
              const isComplete = index < safeIndex
              const isActive = index === safeIndex

              return (
                <g key={wave.path} className="hv-veris-wave">
                  <path
                    d={wave.path}
                    fill="none"
                    stroke={wave.color}
                    strokeDasharray="6 10"
                    strokeLinecap="round"
                    strokeOpacity={isActive || isComplete ? 0.62 : 0.24}
                    strokeWidth={isActive ? 1.8 : 1.2}
                  />
                  <circle
                    r={isActive ? 5 : 3.5}
                    fill={isActive || isComplete ? wave.color : "#5b2a72"}
                    opacity={isActive || isComplete ? 1 : 0.52}
                    className="hv-veris-wave-dot"
                    style={{ animationDelay: `${index * 280}ms` }}
                  >
                    <animateMotion dur="2.8s" repeatCount="indefinite" path={wave.path} />
                  </circle>
                  <circle
                    cx={wave.end[0]}
                    cy={wave.end[1]}
                    r="8"
                    fill="rgba(15, 7, 20, 0.92)"
                    stroke={wave.color}
                    strokeOpacity={isActive || isComplete ? 0.75 : 0.38}
                    strokeWidth="1.4"
                  />
                  <circle
                    cx={wave.end[0]}
                    cy={wave.end[1]}
                    r="3"
                    fill={isActive || isComplete ? wave.color : "#8b5cf6"}
                    opacity={isActive || isComplete ? 1 : 0.55}
                    className={isActive ? "hv-veris-end-dot" : ""}
                  />
                </g>
              )
            })}
          </svg>

          <div
            className="absolute inset-[15%] rounded-full p-[2px] shadow-[0_0_110px_rgba(236,72,153,0.28)] transition-[background] duration-500 sm:inset-[22%] lg:inset-[25%]"
            style={{
              background: `conic-gradient(from 225deg, rgba(244,114,182,0.95) 0deg, rgba(192,132,252,0.95) ${progress * 3.6}deg, rgba(255,255,255,0.08) ${progress * 3.6}deg, rgba(255,255,255,0.08) 360deg)`,
            }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-full border border-pink-300/20 bg-[#130c13]/96 px-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-30px_80px_rgba(236,72,153,0.09)] sm:px-8">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.07),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_52%)]" />
              <div aria-hidden="true" className="hv-veris-loader-scan absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-pink-200/80 to-transparent" />
              <div aria-hidden="true" className="absolute inset-x-10 top-1/2 h-px bg-pink-300/10" />

              <p className="absolute left-1/2 top-[14%] w-[72%] -translate-x-1/2 text-center text-[8px] font-semibold uppercase leading-4 tracking-[0.14em] text-pink-200/70 sm:text-[10px] sm:tracking-[0.2em] lg:text-[11px]">
                {eyebrow}
              </p>
              <h2 className="absolute left-1/2 top-[25%] w-[78%] -translate-x-1/2 text-xl font-semibold leading-tight tracking-tight text-white sm:text-2xl lg:text-3xl">
                {activeStep.label}
              </h2>
              <p className="absolute left-1/2 top-[49%] w-[72%] -translate-x-1/2 text-[10px] leading-4 text-slate-400 sm:text-xs lg:text-sm lg:leading-5">
                {activeStep.detail}
              </p>

              <div className="absolute left-1/2 top-[67%] flex -translate-x-1/2 items-end justify-center gap-1.5">
                <span className="text-xl font-semibold leading-none text-pink-100 sm:text-3xl lg:text-4xl">{progress}</span>
                <span className="mb-0.5 text-xs font-semibold text-pink-200/70 sm:mb-1 sm:text-sm">%</span>
              </div>

              <div className="absolute bottom-[13%] left-1/2 flex w-[70%] -translate-x-1/2 flex-wrap justify-center gap-1.5 sm:gap-2">
                {safeSteps.map((step, index) => {
                  const isComplete = index < safeIndex
                  const isActive = index === safeIndex

                  return (
                    <span
                      key={`${step.label}-${index}`}
                      aria-label={step.label}
                      className={[
                        "h-2 w-2 rounded-full border transition duration-300 sm:h-2.5 sm:w-2.5",
                        isActive
                          ? "border-pink-200 bg-pink-300 shadow-[0_0_16px_rgba(244,114,182,0.95)]"
                          : isComplete
                            ? "border-emerald-200 bg-emerald-300"
                            : "border-slate-600 bg-slate-800",
                      ].join(" ")}
                    />
                  )
                })}
              </div>
              <p className="absolute bottom-[7%] left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-[0.2em] text-slate-500 sm:text-[10px]">
                {safeIndex + 1} / {safeSteps.length}
              </p>
            </div>
          </div>

          <div aria-hidden="true" className="absolute inset-[35%] rounded-full border border-pink-300/10 hv-veris-loader-core" />
          <div className="absolute bottom-[8%] left-1/2 h-px w-[36%] -translate-x-1/2 bg-gradient-to-r from-transparent via-pink-300/24 to-transparent" />
        </div>
      </div>
    </div>
  )
}
