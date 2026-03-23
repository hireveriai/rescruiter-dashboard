export default function RecordedInterviews() {

  const interviews = [
    {
      candidate: "Arjun Patel",
      role: "DevOps Engineer",
      confidence: "82%",
      risk: "Low"
    },
    {
      candidate: "Neha Kapoor",
      role: "Python Developer",
      confidence: "74%",
      risk: "Medium"
    },
    {
      candidate: "Rahul Sharma",
      role: "Data Engineer",
      confidence: "88%",
      risk: "Low"
    }
  ]

  return (
    <div className="mt-10">

      <div className="flex justify-between items-center mb-4">

        <h2 className="text-xl font-semibold">
          Recorded Interviews
        </h2>

        <button className="text-blue-400 text-sm">
          View All
        </button>

      </div>

      <div className="grid grid-cols-3 gap-4">

        {interviews.map((item, index) => (
          <div
            key={index}
            className="bg-[#111a2e] p-5 rounded-lg shadow-md"
          >

            <div className="text-lg font-semibold">
              {item.candidate}
            </div>

            <div className="text-gray-400 text-sm mb-3">
              {item.role}
            </div>

            <div className="text-sm text-gray-300">
              Confidence: <span className="text-blue-400">{item.confidence}</span>
            </div>

            <div className="text-sm text-gray-300 mb-4">
              Risk: <span className="text-green-400">{item.risk}</span>
            </div>

            <div className="flex gap-2">

              <button className="bg-blue-500 px-3 py-1 rounded text-sm">
                View Recording
              </button>

              <button className="border border-blue-400 px-3 py-1 rounded text-sm text-blue-400">
                War Room
              </button>

            </div>

          </div>
        ))}

      </div>

    </div>
  )
}