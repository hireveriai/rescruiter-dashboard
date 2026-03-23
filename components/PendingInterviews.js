export default function PendingInterviews() {

  const interviews = [
    {
      candidate: "Rahul Sharma",
      role: "Data Engineer",
      expires: "22h"
    },
    {
      candidate: "Neha Kapoor",
      role: "Python Developer",
      expires: "18h"
    },
    {
      candidate: "Arjun Patel",
      role: "DevOps Engineer",
      expires: "20h"
    }
  ]

  return (
    <div className="mt-10">

      <div className="flex justify-between items-center mb-4">

        <h2 className="text-xl font-semibold">
          Pending Interviews
        </h2>

        <button className="text-blue-400 text-sm">
          View All
        </button>

      </div>

      <div className="bg-[#111a2e] rounded-lg overflow-hidden">

        <table className="w-full text-sm">

          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="text-left p-4">Candidate</th>
              <th className="text-left p-4">Job</th>
              <th className="text-left p-4">Link Expiry</th>
              <th className="text-left p-4">Action</th>
            </tr>
          </thead>

          <tbody>

            {interviews.map((item, index) => (
              <tr key={index} className="border-b border-gray-800">

                <td className="p-4">{item.candidate}</td>

                <td className="p-4 text-gray-300">{item.role}</td>

                <td className="p-4 text-yellow-400">
                  Expires in {item.expires}
                </td>

                <td className="p-4">
                  <button className="text-blue-400">
                    Copy Link
                  </button>
                </td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>
  )
}