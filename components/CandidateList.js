export default function CandidateList() {

  const candidates = [
    {
      name: "Rahul Sharma",
      role: "Data Engineer",
      status: "Completed",
      confidence: "88%",
      risk: "Low",
      identity: "Verified"
    },
    {
      name: "Neha Kapoor",
      role: "Python Developer",
      status: "Pending",
      confidence: "-",
      risk: "-",
      identity: "Submitted"
    },
    {
      name: "Arjun Patel",
      role: "DevOps Engineer",
      status: "Completed",
      confidence: "82%",
      risk: "Low",
      identity: "Verified"
    }
  ]

  return (
    <div className="mt-10">

      <div className="flex justify-between items-center mb-4">

        <h2 className="text-xl font-semibold">
          Candidates
        </h2>

        <button className="text-blue-400 text-sm">
          View More
        </button>

      </div>

      <div className="bg-[#111a2e] rounded-lg overflow-hidden">

        <table className="w-full text-sm">

          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="text-left p-4">Candidate</th>
              <th className="text-left p-4">Job</th>
              <th className="text-left p-4">Status</th>
              <th className="text-left p-4">Confidence</th>
              <th className="text-left p-4">Risk</th>
              <th className="text-left p-4">Identity</th>
            </tr>
          </thead>

          <tbody>

            {candidates.map((c, index) => (
              <tr key={index} className="border-b border-gray-800">

                <td className="p-4">{c.name}</td>

                <td className="p-4 text-gray-300">{c.role}</td>

                <td className="p-4 text-blue-400">{c.status}</td>

                <td className="p-4">{c.confidence}</td>

                <td className="p-4 text-green-400">{c.risk}</td>

                <td className="p-4 text-gray-300">{c.identity}</td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>
  )
}