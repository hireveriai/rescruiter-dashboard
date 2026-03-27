"use client";

import { useState } from "react";

import Navbar from "../components/Navbar";
import Pipeline from "../components/Pipeline";
import PendingInterviews from "../components/PendingInterviews";
import RecordedInterviews from "../components/RecordedInterviews";
import CandidateList from "../components/CandidateList";
import Sidebar from "../components/Sidebar";
import VerisSummary from "../components/VerisSummary";
import AlertsPanel from "../components/AlertsPanel";
import WarRoomButton from "../components/WarRoomButton";
import SendInterviewModal from "../components/SendInterviewModal";

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">

      {/* 🔝 Navbar */}
      <Navbar onSendInterviewClick={() => setIsModalOpen(true)} />

      {/* 🧩 Main Layout */}
      <div className="p-8 grid grid-cols-4 gap-6">

        {/* 🟦 Main Content */}
        <div className="col-span-3">

          <div className="mb-6">
            <h1 className="text-2xl font-semibold">
              Recruiter Dashboard
            </h1>

            <p className="text-gray-400 mt-2">
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

        {/* 🟪 Sidebar */}
        <div className="col-span-1">
          <Sidebar />
          <AlertsPanel />
        </div>

      </div>

      {/* 🔥 MODAL */}
      <SendInterviewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

    </div>
  );
}