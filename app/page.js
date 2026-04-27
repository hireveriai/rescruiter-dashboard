"use client";

import Link from "next/link";
import { useState } from "react";

import { buildAuthUrl } from "@/lib/client/auth-query";
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params";

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

function DashboardContent({ profile, showRestoreOverlay, overview }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const searchParams = useAuthSearchParams();

  return (
    <div className="relative min-h-screen bg-[#0b1220] text-white">
      <Navbar onSendInterviewClick={() => setIsModalOpen(true)} initialProfile={profile} />

      <div className="grid grid-cols-4 gap-6 p-8">
        <div className="col-span-3">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Recruiter Dashboard</h1>
              <p className="mt-2 text-gray-400">
                Overview of interviews, candidates and hiring insights
              </p>
            </div>

            <Link
              href={buildAuthUrl("/ai-screening", searchParams)}
              className="inline-flex w-fit items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/15"
            >
              Run AI Screening
            </Link>
          </div>

          <Pipeline initialPipeline={overview?.pipeline} />
          <PendingInterviews initialPendingInterviews={overview?.pendingInterviews} />
          <RecordedInterviews initialRecordedInterviews={overview?.recordedInterviews} />
          <CandidateList initialCandidates={overview?.candidates} />
          <VerisSummary initialSummaries={overview?.veris} />
          <WarRoomButton />
        </div>

        <div className="col-span-1">
          <Sidebar initialProfile={profile} />
          <AlertsPanel />
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
      {({ profile, showRestoreOverlay, overview }) => (
        <DashboardContent profile={profile} showRestoreOverlay={showRestoreOverlay} overview={overview} />
      )}
    </RecruiterDashboardBootstrap>
  );
}
