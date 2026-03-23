export default function Pipeline() {

  const pipeline = [
    { title: "Pending", count: 12, color: "bg-blue-500" },
    { title: "In Progress", count: 4, color: "bg-indigo-500" },
    { title: "Completed", count: 28, color: "bg-green-500" },
    { title: "Flagged", count: 2, color: "bg-red-500" }
  ]

  return (
    <div className="mt-8">

      <h2 className="text-xl font-semibold mb-4">
        Interview Pipeline
      </h2>

      <div className="grid grid-cols-4 gap-4">

        {pipeline.map((item, index) => (
          <div
            key={index}
            className="bg-[#111a2e] rounded-lg p-5 shadow-md"
          >

            <div className="flex justify-between items-center">

              <span className="text-gray-400 text-sm">
                {item.title}
              </span>

              <div className={`w-3 h-3 rounded-full ${item.color}`}></div>

            </div>

            <div className="text-3xl font-bold mt-3">
              {item.count}
            </div>

          </div>
        ))}

      </div>

    </div>
  )
}