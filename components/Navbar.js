"use client";

import { useState } from "react";
import CreateJobModal from "./CreateJobModal";

export default function Navbar({ onSendInterviewClick }) {
  const [openCreateJob, setOpenCreateJob] = useState(false);

  return (
    <>
      <div className="flex justify-between items-center p-4 bg-[#111a2e] text-white">

        {/* Left */}
        <div className="flex items-center gap-6">
          <div className="text-blue-400 font-semibold text-lg">
            HireVeri
          </div>

          <nav className="flex gap-4 text-gray-300">
            <a>Dashboard</a>
            <a>Jobs</a>
            <a>Candidates</a>
            <a>Interviews</a>
            <a>Reports</a>
            <a>Alerts</a>
          </nav>
        </div>

        {/* Right */}
        <div className="flex gap-3">

          {/* Create Job */}
          <button
            onClick={() => setOpenCreateJob(true)}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2 rounded-lg shadow-lg hover:scale-105 hover:shadow-xl transition-all duration-200"
          >
            Create Job
          </button>

          {/* Send Interview */}
          <button
            onClick={() => onSendInterviewClick?.()}
            className="border border-blue-500 text-blue-400 px-4 py-2 rounded-lg hover:bg-blue-500 hover:text-white transition"
          >
            Send Interview Link
          </button>

        </div>
      </div>

      {/* Create Job Modal */}
      <CreateJobModal
        open={openCreateJob}
        setOpen={setOpenCreateJob}
      />
    </>
  );
}