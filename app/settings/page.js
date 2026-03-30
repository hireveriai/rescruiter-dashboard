export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-[#081120] px-6 py-12 text-white sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[28px] border border-slate-800 bg-[#0f172a] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
          <p className="text-xs uppercase tracking-[0.35em] text-blue-300/80">
            Recruiter Workspace
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
            Settings
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-300">
            Workspace settings will be enabled here next. This page is ready so the
            profile menu can route cleanly without breaking the recruiter flow.
          </p>
        </div>
      </div>
    </main>
  );
}
