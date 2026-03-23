export default function VerisSummary() {

  const summaries = [
    {
      candidate: "Rahul Sharma",
      role: "Data Engineer",
      communication: "Strong",
      integrity: "Stable",
      recommendation: "Proceed"
    },
    {
      candidate: "Neha Kapoor",
      role: "Python Developer",
      communication: "Moderate",
      integrity: "Stable",
      recommendation: "Review"
    }
  ]

  return (
    <div className="mt-10">

      <h2 className="text-xl font-semibold mb-4">
        VERIS AI Summaries
      </h2>

      <div className="grid grid-cols-2 gap-4">

        {summaries.map((item, index) => (
          <div
            key={index}
            className="bg-[#111a2e] p-5 rounded-lg"
          >

            <div className="text-lg font-semibold">
              {item.candidate}
            </div>

            <div className="text-gray-400 text-sm mb-3">
              {item.role}
            </div>

            <div className="text-sm">
              Communication: <span className="text-blue-400">{item.communication}</span>
            </div>

            <div className="text-sm">
              Integrity: <span className="text-green-400">{item.integrity}</span>
            </div>

            <div className="text-sm mt-2">
              Recommendation:
              <span className="text-yellow-400 ml-2">
                {item.recommendation}
              </span>
            </div>

          </div>
        ))}

      </div>

    </div>
  )
}