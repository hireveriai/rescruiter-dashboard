import ReplayClient from "./replay-client"

export const dynamic = "force-dynamic"

export default async function RecordingReplayPage({
  params,
}: {
  params: Promise<{ recordingId: string }>
}) {
  const { recordingId } = await params

  return <ReplayClient recordingId={recordingId} />
}
