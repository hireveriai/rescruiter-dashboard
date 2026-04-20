import Link from "next/link"

export default function WarRoomButton() {
  return (
    <div className="mt-10 text-center">
      <Link
        href="/recruiter/war-room"
        className="inline-flex rounded-lg bg-blue-500 px-8 py-3 text-lg transition hover:bg-blue-400"
      >
        Open War Room
      </Link>

      <p className="text-gray-400 text-sm mt-2">
        Launch deep forensic interview analysis
      </p>

    </div>
  )
}
