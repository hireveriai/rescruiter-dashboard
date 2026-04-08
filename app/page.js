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

function DashboardContent({ profile, showRestoreOverlay }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#0b1220] text-white">
      <Navbar onSendInterviewClick={() => setIsModalOpen(true)} initialProfile={profile} />

      <div className="grid grid-cols-4 gap-6 p-8">
        <div className="col-span-3">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Recruiter Dashboard</h1>
            <p className="mt-2 text-gray-400">
              Overview of interviews, candidates and hiring insights
            </p>
          </div>

          <Pipeline />
          <PendingInterviews />
          <RecordedInterviews />
          <CandidateList />
          <VerisSummary />
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
      {({ profile, showRestoreOverlay }) => (
        <DashboardContent profile={profile} showRestoreOverlay={showRestoreOverlay} />
      )}
    </RecruiterDashboardBootstrap>
  );
}
