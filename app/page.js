import Navbar from "../components/Navbar"
import Pipeline from "../components/Pipeline"
import PendingInterviews from "../components/PendingInterviews"
import RecordedInterviews from "../components/RecordedInterviews"
import CandidateList from "../components/CandidateList"
import Sidebar from "../components/Sidebar"
import VerisSummary from "../components/VerisSummary"
import AlertsPanel from "../components/AlertsPanel"
import WarRoomButton from "../components/WarRoomButton"

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0b1220] text-white">

      {/* Top Navigation */}
      <Navbar />

      {/* Main Dashboard Layout */}
      <div className="p-8 grid grid-cols-4 gap-6">

        {/* Main Content */}
        <div className="col-span-3">

          <h1 className="text-2xl font-semibold">
            Recruiter Dashboard
          </h1>

          <p className="text-gray-400 mt-2 mb-6">
            Overview of interviews, candidates and hiring insights
          </p>

          {/* Interview Pipeline */}
          <Pipeline />

          {/* Pending Interviews */}
          <PendingInterviews />

          {/* Recorded Interviews */}
          <RecordedInterviews />

          {/* Candidate Table */}
          <CandidateList />

          {/* VERIS AI Summary */}
          <VerisSummary />

          {/* War Room Button */}
          <WarRoomButton />

        </div>

        {/* Sidebar */}
        <div className="col-span-1">

          <Sidebar />

          <AlertsPanel />

        </div>

      </div>

    </div>
  )
}