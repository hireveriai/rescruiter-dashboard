import { NextResponse } from "next/server"

import { pgPool } from "@/lib/server/pg"

type ExperienceLevelRow = {
  experience_level_id: number
  label: string
}

const fallbackLevels: ExperienceLevelRow[] = [
  { experience_level_id: 1, label: "Fresher / Student" },
  { experience_level_id: 2, label: "Junior" },
  { experience_level_id: 3, label: "Mid" },
  { experience_level_id: 4, label: "Senior" },
]

export async function GET() {
  try {
    const { rows } = await pgPool.query<ExperienceLevelRow>(`
      select experience_level_id, label
      from public.experience_level_pool
      order by experience_level_id asc
    `)

    return NextResponse.json(rows)
  } catch (error) {
    console.error(error)

    const databaseError = error as { code?: string; message?: string }

    if (
      databaseError?.code === "XX000" &&
      databaseError?.message?.includes("MaxClientsInSessionMode")
    ) {
      return NextResponse.json(fallbackLevels)
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FAILED_TO_FETCH_LEVELS",
          message: "Failed to fetch experience levels",
        },
      },
      { status: 500 }
    )
  }
}
