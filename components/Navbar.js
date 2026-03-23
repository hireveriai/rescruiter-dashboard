export default function Navbar() {
  return (
    <div className="flex justify-between items-center p-4 bg-[#111a2e] text-white">

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

      <div className="flex gap-3">
        <button className="bg-blue-500 px-4 py-2 rounded">
          Create Job
        </button>

        <button className="border border-blue-400 px-4 py-2 rounded text-blue-400">
          Send Interview Link
        </button>
      </div>

    </div>
  )
}