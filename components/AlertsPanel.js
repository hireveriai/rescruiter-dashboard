export default function AlertsPanel() {

  const alerts = [
    "Tab switch detected - Rahul Sharma",
    "Verification delay - Neha Kapoor",
    "Camera focus lost - Arjun Patel"
  ]

  return (
    <div className="mt-10 bg-[#111a2e] p-5 rounded-lg">

      <h2 className="text-xl font-semibold mb-4">
        Risk Alerts
      </h2>

      <ul className="text-sm text-gray-300">

        {alerts.map((alert, index) => (
          <li key={index} className="mb-2">
            ⚠ {alert}
          </li>
        ))}

      </ul>

    </div>
  )
}