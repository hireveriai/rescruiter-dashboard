"use client";

import { Suspense, useState } from "react";

import Navbar from "../components/Navbar";
import OverlayLoader from "../components/OverlayLoader";
import Pipeline from "../components/Pipeline";
import PendingInterviews from "../components/PendingInterviews";
import RecordedInterviews from "../components/RecordedInterviews";
import CandidateList from "../components/CandidateList";
import Sidebar from "../components/Sidebar";
import VerisSummary from "../components/VerisSummary";
import AlertsPanel from "../components/AlertsPanel";
import WarRoomButton from "../components/WarRoomButton";
import SendInterviewModal from "../components/SendInterviewModal";
import RecruiterDashboardBootstrap from "../components/RecruiterDashboardBootstrap";
import { CardSkeleton, MetricSkeleton, TableSkeleton, TimelineSkeleton } from "../components/system/skeletons";

function DashboardContent({ profile, showRestoreOverlay, overview, isLoading }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="hv-page-enter relative min-h-screen bg-[#0b1220] text-white">
      <Navbar onSendInterviewClick={() => setIsModalOpen(true)} initialProfile={profile} />

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,350px)] lg:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(340px,372px)]">
        <div className="min-w-0">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Recruiter Dashboard</h1>
              <p className="mt-2 text-gray-400">
                Overview of interviews, candidates and hiring insights
              </p>
            </div>
          </div>

          <Suspense fallback={<MetricSkeleton className="mt-8 grid-cols-2 lg:grid-cols-4" />}>
            <Pipeline initialPipeline={overview?.pipeline} isLoading={isLoading} />
          </Suspense>
          <Suspense fallback={<div className="mt-10 overflow-hidden rounded-lg bg-[#111a2e]"><table className="w-full text-sm"><TableSkeleton rows={3} columns={6} showAvatar /></table></div>}>
            <PendingInterviews initialPendingInterviews={overview?.pendingInterviews} isLoading={isLoading} />
          </Suspense>
          <Suspense fallback={<CardSkeleton count={3} className="mt-10 grid-cols-1 md:grid-cols-3" />}>
            <RecordedInterviews
              initialRecordedInterviews={overview?.recordedInterviews}
              organizationId={profile?.organizationId}
              isLoading={isLoading}
            />
          </Suspense>
          <Suspense fallback={<div className="mt-10 overflow-hidden rounded-lg bg-[#111a2e]"><table className="w-full text-sm"><TableSkeleton rows={5} columns={5} showAvatar /></table></div>}>
            <CandidateList initialCandidates={overview?.candidates} isLoading={isLoading} />
          </Suspense>
          <Suspense fallback={<TimelineSkeleton className="mt-10" messages={["Loading behavioral telemetry...", "Preparing cognitive analysis...", "Building forensic timeline..."]} />}>
            <VerisSummary initialSummaries={overview?.veris} isLoading={isLoading} />
          </Suspense>
          <WarRoomButton organizationId={profile?.organizationId} />
        </div>

        <div className="min-w-0">
          <Sidebar initialProfile={profile} overview={overview} />
          <AlertsPanel isLoading={isLoading} />
        </div>
      </div>

      <SendInterviewModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      <OverlayLoader key={showRestoreOverlay ? "restore-active" : "restore-idle"} visible={showRestoreOverlay} />
    </div>
  );
}

export default function Home() {
  return (
    <RecruiterDashboardBootstrap>
      {({ profile, showRestoreOverlay, overview, restoreStatus }) => (
        <DashboardContent
          profile={profile}
          showRestoreOverlay={showRestoreOverlay}
          overview={overview}
          isLoading={restoreStatus === "loading" && !overview}
        />
      )}
    </RecruiterDashboardBootstrap>
  );
}
