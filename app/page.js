"use client";

import dynamic from "next/dynamic";
import { Suspense, useState } from "react";

import Navbar from "../components/Navbar";
import DashboardIntelligenceBanner from "../components/DashboardIntelligenceBanner";
import RecruiterDashboardBootstrap from "../components/RecruiterDashboardBootstrap";
import { CardSkeleton, MetricSkeleton, TableSkeleton, TimelineSkeleton } from "../components/system/skeletons";

const CognitiveDock = dynamic(() => import("../components/dashboard/CognitiveDock"), {
  ssr: false,
});

const Pipeline = dynamic(() => import("../components/Pipeline"), {
  ssr: false,
  loading: () => <MetricSkeleton className="mt-8 grid-cols-2 lg:grid-cols-4" />,
});

const PendingInterviews = dynamic(() => import("../components/PendingInterviews"), {
  ssr: false,
  loading: () => <div className="mt-10 overflow-hidden rounded-lg bg-[#111a2e]"><table className="w-full text-sm"><TableSkeleton rows={3} columns={6} showAvatar /></table></div>,
});

const RecordedInterviews = dynamic(() => import("../components/RecordedInterviews"), {
  ssr: false,
  loading: () => <CardSkeleton count={3} className="mt-10 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3" />,
});

const CandidateList = dynamic(() => import("../components/CandidateList"), {
  ssr: false,
  loading: () => <div className="mt-10 overflow-hidden rounded-lg bg-[#111a2e]"><table className="w-full text-sm"><TableSkeleton rows={5} columns={5} showAvatar /></table></div>,
});

const Sidebar = dynamic(() => import("../components/Sidebar"), {
  ssr: false,
  loading: () => <div className="min-h-[360px] rounded-[28px] border border-slate-800 bg-slate-900/40" />,
});

const VerisSummary = dynamic(() => import("../components/VerisSummary"), {
  ssr: false,
  loading: () => <TimelineSkeleton className="mt-10" messages={["Loading behavioral telemetry...", "Preparing cognitive analysis...", "Building forensic timeline..."]} />,
});

const WarRoomButton = dynamic(() => import("../components/WarRoomButton"), {
  ssr: false,
});

const SendInterviewModal = dynamic(() => import("../components/SendInterviewModal"), {
  ssr: false,
});

function DashboardContent({ profile, overview, isLoading }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isPartialOverview = Boolean(overview?.partial);
  const fullOverview = isPartialOverview ? null : overview;
  const displayProfile = profile ?? overview?.profile ?? null;
  const activeInterviewCount = fullOverview?.pendingInterviewsTotal ?? fullOverview?.pendingInterviews?.length ?? 0;
  const candidateCount = fullOverview?.candidates?.length ?? 0;
  const fraudAlerts = (overview?.alerts ?? []).filter((alert) => {
    const text = `${alert?.tone ?? ""} ${alert?.type ?? ""} ${alert?.title ?? ""} ${alert?.message ?? ""}`.toLowerCase();
    return text.includes("danger") || text.includes("fraud") || text.includes("flag") || text.includes("suspicion") || text.includes("anomaly");
  });

  return (
    <div className="relative min-h-screen bg-[#0b1220] text-white">
      <Navbar onSendInterviewClick={() => setIsModalOpen(true)} initialProfile={displayProfile} initialAlerts={overview?.alerts} />
      <CognitiveDock
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

          <DashboardIntelligenceBanner
            overview={fullOverview}
            onCreateJob={() => window.dispatchEvent(new CustomEvent("hireveri:open-create-job"))}
            onSendInterview={() => setIsModalOpen(true)}
          />

          <Suspense fallback={null}>
            <Pipeline initialPipeline={fullOverview?.pipeline} isLoading={isLoading || isPartialOverview} />
          </Suspense>
          <Suspense fallback={null}>
            <PendingInterviews
              initialPendingInterviews={fullOverview?.pendingInterviews}
              initialPendingTotal={fullOverview?.pendingInterviewsTotal}
              isLoading={isLoading}
            />
          </Suspense>
          <Suspense fallback={null}>
            <RecordedInterviews
              initialRecordedInterviews={fullOverview?.recordedInterviews}
              organizationId={displayProfile?.organizationId}
              isLoading={isLoading}
            />
          </Suspense>
          <Suspense fallback={null}>
            <CandidateList initialCandidates={fullOverview?.candidates} isLoading={isLoading} />
          </Suspense>
          <Suspense fallback={null}>
            <VerisSummary initialSummaries={fullOverview?.veris} isLoading={isLoading} />
          </Suspense>
          <WarRoomButton organizationId={displayProfile?.organizationId} />
        </div>

        <div className="min-w-0">
          <Sidebar initialProfile={displayProfile} overview={fullOverview} />
        </div>
      </div>

      {isModalOpen ? <SendInterviewModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} /> : null}
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
