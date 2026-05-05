"use client"

import { openWarRoom } from "@/lib/client/war-room"

export default function WarRoomButton({ organizationId = "" }) {
  return (
    <div className="mt-10 text-center">
      <button
        type="button"
        onClick={() => openWarRoom(organizationId)}
        className="inline-flex cursor-pointer rounded-lg bg-blue-500 px-8 py-3 text-lg transition hover:bg-blue-400"
      >
        Open War Room
      </button>

      <p className="text-gray-400 text-sm mt-2">
        Launch deep forensic interview analysis
      </p>

    </div>
  )
}
