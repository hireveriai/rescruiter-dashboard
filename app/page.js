"use client";

import { useState } from "react";

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
          </div>

          <Pipeline initialPipeline={overview?.pipeline} />
          <PendingInterviews initialPendingInterviews={overview?.pendingInterviews} />
          <RecordedInterviews
            initialRecordedInterviews={overview?.recordedInterviews}
            organizationId={profile?.organizationId}
          />
          <CandidateList initialCandidates={overview?.candidates} />
          <VerisSummary initialSummaries={overview?.veris} />
          <WarRoomButton organizationId={profile?.organizationId} />
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
