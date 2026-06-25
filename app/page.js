"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";

import Navbar from "../components/Navbar";
import DashboardIntelligenceBanner from "../components/DashboardIntelligenceBanner";
import FreeTrialUsage from "../components/FreeTrialUsage";
import RecruiterDashboardBootstrap from "../components/RecruiterDashboardBootstrap";
import { VerisGlobeLoader } from "../components/system/loaders";
import { DEFAULT_RECRUITER_PERMISSION_PROFILE, canAccessFeature } from "../lib/client/permissions";
import { buildAuthUrl } from "../lib/client/auth-query";
import { useAuthSearchParams } from "../lib/client/use-auth-search-params";

const CognitiveDock = dynamic(() => import("../components/dashboard/CognitiveDock"), {
  ssr: false,
});

const Pipeline = dynamic(() => import("../components/Pipeline"), {
  ssr: false,
  loading: () => null,
});

const PendingInterviews = dynamic(() => import("../components/PendingInterviews"), {
  ssr: false,
  loading: () => null,
});

const RecordedInterviews = dynamic(() => import("../components/RecordedInterviews"), {
  ssr: false,
  loading: () => null,
});

const CandidateList = dynamic(() => import("../components/CandidateList"), {
  ssr: false,
  loading: () => null,
});

const Sidebar = dynamic(() => import("../components/Sidebar"), {
  ssr: false,
  loading: () => null,
});

const VerisSummary = dynamic(() => import("../components/VerisSummary"), {
  ssr: false,
  loading: () => null,
});

const WarRoomButton = dynamic(() => import("../components/WarRoomButton"), {
  ssr: false,
});

const SendInterviewModal = dynamic(() => import("../components/SendInterviewModal"), {
  ssr: false,
});

const EMPTY_PIPELINE = {
  pending: 0,
  inProgress: 0,
  completed: 0,
  flagged: 0,
  reviewed: 0,
  reviewRequired: 0,
};

const EMPTY_WORKFLOW_METRICS = {
  jobs: 0,
  activeJobs: 0,
  invites: 0,
  screeningRuns: 0,
  shortlistedCandidates: 0,
  screeningStarted: false,
  screeningCompleted: false,
  interviewsRunning: 0,
  completedInterviews: 0,
  pendingReports: 0,
  reviewedReports: 0,
  decisionsPending: 0,
};

function createEmptyDashboardOverview(profile = null) {
  return {
    partial: true,
    profile,
    pipeline: EMPTY_PIPELINE,
    workflowMetrics: EMPTY_WORKFLOW_METRICS,
    dashboardState: {},
    pendingInterviews: [],
    pendingInterviewsTotal: 0,
    candidates: [],
    alerts: [],
    trialCredits: null,
    recordedInterviews: [],
    veris: [],
  };
}

function normalizeDashboardOverview(overview) {
  if (!overview) {
    return null;
  }

  return {
    ...overview,
    pipeline: overview.pipeline ?? EMPTY_PIPELINE,
    workflowMetrics: overview.workflowMetrics ?? EMPTY_WORKFLOW_METRICS,
    dashboardState: overview.dashboardState ?? {},
    pendingInterviews: overview.pendingInterviews ?? [],
    pendingInterviewsTotal: overview.pendingInterviewsTotal ?? 0,
    candidates: overview.candidates ?? [],
  };
}

function mergeTrialCredits(current, incoming) {
  if (!incoming) {
    return current;
  }

  if (!current || incoming.source === "subscription" || current.source !== incoming.source) {
    return incoming;
  }

  return {
    ...incoming,
    interviewCreditsRemaining: Math.min(
      Number(current.interviewCreditsRemaining ?? incoming.interviewCreditsRemaining ?? 0),
      Number(incoming.interviewCreditsRemaining ?? current.interviewCreditsRemaining ?? 0)
    ),
    screeningCreditsRemaining: Math.min(
      Number(current.screeningCreditsRemaining ?? incoming.screeningCreditsRemaining ?? 0),
      Number(incoming.screeningCreditsRemaining ?? current.screeningCreditsRemaining ?? 0)
    ),
  };
}

function formatCompactCount(value) {
  const safeValue = Math.max(0, Number(value) || 0);

  return new Intl.NumberFormat(undefined, {
    notation: safeValue >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(safeValue);
}

function InterviewCredibilityStat({ completedInterviews }) {
  const safeCompletedInterviews = Math.max(0, Number(completedInterviews) || 0);
  const label =
    safeCompletedInterviews === 1
      ? "interview completed successfully"
      : "interviews completed successfully";

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#0b1828] shadow-[0_18px_55px_rgba(8,145,178,0.12)]">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-400/10">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.75)]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/75">
              HireVeri trust signal
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Real completed interview activity from your workspace.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left sm:min-w-[300px] sm:text-right">
          <p className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {formatCompactCount(safeCompletedInterviews)}
          </p>
          <p className="mt-1 text-sm font-medium text-emerald-200">{label}</p>
        </div>
      </div>
    </section>
  );
}

function DashboardContent({ profile, overview, isLoading }) {
  const searchParams = useAuthSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const displayProfile = profile ?? overview?.profile ?? null;
  const permissionProfile = displayProfile?.permissions?.length ? displayProfile : DEFAULT_RECRUITER_PERMISSION_PROFILE;
  const fullOverview = normalizeDashboardOverview(overview) ?? createEmptyDashboardOverview(displayProfile);
  const isPartialOverview = Boolean(fullOverview?.partial);
  const [trialCredits, setTrialCredits] = useState(overview?.trialCredits ?? null);
  const activeInterviewCount = fullOverview?.pendingInterviewsTotal ?? fullOverview?.pendingInterviews?.length ?? 0;
  const candidateCount = fullOverview?.candidates?.length ?? 0;
  const completedInterviewCount =
    fullOverview?.workflowMetrics?.completedInterviews ??
    fullOverview?.pipeline?.completed ??
    0;
  const canCreateJob = canAccessFeature(permissionProfile, "createJob");
  const canSendInterview = canAccessFeature(permissionProfile, "sendInterview");
  const canViewCandidates = canAccessFeature(permissionProfile, "candidates");
  const canViewInterviews = canAccessFeature(permissionProfile, "interviews");
  const canViewReports = canAccessFeature(permissionProfile, "reports");
  const canUseAiScreening = canAccessFeature(permissionProfile, "aiScreening");
  const canViewWarRoom = canAccessFeature(displayProfile, "warRoom");
  const fraudAlerts = (overview?.alerts ?? []).filter((alert) => {
    const text = `${alert?.tone ?? ""} ${alert?.type ?? ""} ${alert?.title ?? ""} ${alert?.message ?? ""}`.toLowerCase();
    return text.includes("danger") || text.includes("fraud") || text.includes("flag") || text.includes("suspicion") || text.includes("anomaly");
  });

  useEffect(() => {
    if (overview?.trialCredits) {
      const timer = window.setTimeout(() => {
        setTrialCredits((current) => mergeTrialCredits(current, overview.trialCredits));
      }, 0);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [overview?.trialCredits]);

  useEffect(() => {
    if (overview?.trialCredits || trialCredits) {
      return undefined;
    }

    let active = true;

    async function loadTrialCredits() {
      try {
        const response = await fetch(buildAuthUrl(`/api/trial-credits?refresh=${Date.now()}`, searchParams), {
          credentials: "include",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);

        if (!active || !response.ok || !payload?.success) {
          return;
        }

        setTrialCredits((current) => mergeTrialCredits(current, payload.data));
      } catch (error) {
        console.warn("Failed to load trial credits from dashboard fallback", error);
      }
    }

    loadTrialCredits();

    return () => {
      active = false;
    };
  }, [overview?.trialCredits, searchParams, trialCredits]);

  useEffect(() => {
    function handleTrialCreditsUpdated(event) {
      if (event.detail) {
        setTrialCredits((current) => mergeTrialCredits(current, event.detail));
      }
    }

    window.addEventListener("hireveri:trial-credits-updated", handleTrialCreditsUpdated);
    return () => window.removeEventListener("hireveri:trial-credits-updated", handleTrialCreditsUpdated);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#08111f] text-white">
        <Navbar onSendInterviewClick={() => setIsModalOpen(true)} initialProfile={displayProfile} initialAlerts={overview?.alerts} />
        <VerisGlobeLoader
          eyebrow="Dashboard"
          steps={[
            { label: "Syncing dashboard", detail: "Loading hiring workflow, alerts, and workspace metrics." },
            { label: "Reading pipeline", detail: "Preparing candidate and interview activity." },
            { label: "Building overview", detail: "Assembling recruiter intelligence cards." },
            { label: "Dashboard ready", detail: "Your dashboard is ready for review." },
          ]}
          activeIndex={1}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#08111f] text-white">
      <Navbar onSendInterviewClick={() => setIsModalOpen(true)} initialProfile={displayProfile} initialAlerts={overview?.alerts} />
      <CognitiveDock
        profile={displayProfile}
        activeInterviewCount={activeInterviewCount}
        candidateCount={candidateCount}
        flaggedCount={fraudAlerts.length}
        alerts={fraudAlerts}
        overview={fullOverview}
        onSendInterviewClick={() => setIsModalOpen(true)}
      />

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 md:pl-28 lg:p-8 lg:pl-32 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <div className="min-w-0">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Recruiter Dashboard</h1>
              <p className="mt-2 text-gray-400">
                Overview of interviews, candidates and hiring insights
              </p>
            </div>
          </div>

          <InterviewCredibilityStat completedInterviews={completedInterviewCount} />

          <DashboardIntelligenceBanner
            overview={fullOverview}
            profile={displayProfile}
            onCreateJob={canCreateJob ? () => window.dispatchEvent(new CustomEvent("hireveri:open-create-job")) : undefined}
            onSendInterview={canSendInterview ? () => setIsModalOpen(true) : undefined}
          />
          <FreeTrialUsage credits={trialCredits} />

          <Suspense fallback={null}>
            <Pipeline initialPipeline={fullOverview?.pipeline} isLoading={false} />
          </Suspense>
          {canViewInterviews ? (
          <Suspense fallback={null}>
            <PendingInterviews
              initialPendingInterviews={fullOverview?.pendingInterviews}
              initialPendingTotal={fullOverview?.pendingInterviewsTotal}
              profile={displayProfile}
              isLoading={false}
            />
          </Suspense>
          ) : null}
          {canViewInterviews || canViewReports ? (
          <Suspense fallback={null}>
            <RecordedInterviews
              initialRecordedInterviews={isPartialOverview ? undefined : fullOverview?.recordedInterviews}
              organizationId={displayProfile?.organizationId}
              profile={displayProfile}
              isLoading={false}
            />
          </Suspense>
          ) : null}
          {canViewCandidates ? (
          <Suspense fallback={null}>
            <CandidateList initialCandidates={fullOverview?.candidates} isLoading={false} />
          </Suspense>
          ) : null}
          {canUseAiScreening || canViewReports ? (
          <Suspense fallback={null}>
            <VerisSummary
              initialSummaries={isPartialOverview ? undefined : fullOverview?.veris}
              isLoading={false}
            />
          </Suspense>
          ) : null}
          {canViewWarRoom ? <WarRoomButton organizationId={displayProfile?.organizationId} /> : null}
        </div>

        <div className="min-w-0">
          <Sidebar initialProfile={displayProfile} overview={fullOverview} />
        </div>
      </div>

      {isModalOpen && canSendInterview ? <SendInterviewModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} initialTrialCredits={trialCredits} /> : null}
    </div>
  );
}

export default function Home() {
  return (
    <RecruiterDashboardBootstrap>
      {({ profile, overview, restoreStatus }) => (
        <DashboardContent
          profile={profile}
          overview={overview}
          isLoading={restoreStatus === "loading" && !overview}
        />
      )}
    </RecruiterDashboardBootstrap>
  );
}
