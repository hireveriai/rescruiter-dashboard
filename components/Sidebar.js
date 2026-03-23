export default function Sidebar() {
  return (
    <div className="mt-10 bg-[#111a2e] rounded-lg p-5">

      <h2 className="text-xl font-semibold mb-4">
        Recruiter
      </h2>

      <div className="flex items-center gap-3 mb-6">

        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
          JS
        </div>

        <div>
          <div className="font-semibold">Jatin Singh</div>
          <div className="text-gray-400 text-sm">HireVeri</div>
        </div>

      </div>

      <h3 className="text-gray-400 text-sm mb-3">
        Quick Actions
      </h3>

      <div className="flex flex-col gap-3">

        <button className="bg-blue-500 p-2 rounded">
          Create Job
        </button>

        <button className="border border-blue-400 text-blue-400 p-2 rounded">
          Send Interview Link
        </button>

        <button className="border border-gray-600 p-2 rounded text-gray-300">
          Upload Candidate
        </button>

        <button className="border border-gray-600 p-2 rounded text-gray-300">
          Generate Report
        </button>

      </div>

    </div>
  )
}