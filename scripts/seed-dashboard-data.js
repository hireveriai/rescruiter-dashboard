const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function getDatabaseUrl() {
  const envPath = path.join(process.cwd(), '.env.local');
  const env = fs.readFileSync(envPath, 'utf8');
  const match = env.match(/DATABASE_URL\s*=\s*"([^"]+)"/);

  if (!match) {
    throw new Error('DATABASE_URL not found in .env.local');
  }

  const url = new URL(match[1]);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  return url.toString();
}

async function main() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('begin');

    const targetInterviewId = 'b3ab8efc-9808-404a-95dd-9e6c8730c197';

    await client.query(
      `
        update public.interviews
        set status = 'COMPLETED'
        where interview_id = $1::uuid
      `,
      [targetInterviewId]
    );

    const attemptResult = await client.query(
      `
        insert into public.interview_attempts (
          interview_id,
          attempt_number,
          started_at,
          ended_at,
          status
        )
        values (
          $1::uuid,
          1,
          now() - interval '55 minutes',
          now() - interval '18 minutes',
          'completed'
        )
        on conflict do nothing
        returning attempt_id
      `,
      [targetInterviewId]
    );

    let attemptId = attemptResult.rows[0]?.attempt_id ?? null;

    if (!attemptId) {
      const existingAttempt = await client.query(
        `
          select attempt_id
          from public.interview_attempts
          where interview_id = $1::uuid
          order by started_at desc
          limit 1
        `,
        [targetInterviewId]
      );

      attemptId = existingAttempt.rows[0]?.attempt_id ?? null;
    }

    if (!attemptId) {
      throw new Error('Unable to seed dashboard data because no interview attempt could be created or found.');
    }

    await client.query(
      `
        insert into public.interview_evaluations (
          attempt_id,
          final_score,
          decision,
          ai_summary,
          is_locked
        )
        values (
          $1::uuid,
          84,
          'HIRE',
          'Candidate demonstrated strong command of database administration fundamentals, especially around indexing, query planning, backup strategy, and operational troubleshooting. Communication stayed structured throughout the interview, and the answers showed practical production awareness rather than textbook recall. A few responses on cross-region failover and long-term observability could have gone deeper, but overall the candidate showed dependable senior-level judgment for a recruiter screening context.',
          true
        )
        on conflict (attempt_id)
        do update set
          final_score = excluded.final_score,
          decision = excluded.decision,
          ai_summary = excluded.ai_summary,
          is_locked = excluded.is_locked,
          created_at = now()
      `,
      [attemptId]
    );

    await client.query(
      `
        insert into public.interview_recordings (
          attempt_id,
          audio_url,
          transcript,
          retention_days,
          expires_at
        )
        values (
          $1::uuid,
          'https://example.com/recordings/' || $1::text || '.mp3',
          'Candidate discussed replication lag, backup windows, point-in-time recovery, alerting, and practical SQL optimization strategies with a clear and steady explanation style.',
          30,
          now() + interval '30 days'
        )
        on conflict do nothing
      `,
      [attemptId]
    );

    await client.query('commit');

    console.log(JSON.stringify({
      success: true,
      interviewId: targetInterviewId,
      attemptId,
      seeded: ['interviews.status', 'interview_attempts', 'interview_evaluations', 'interview_recordings'],
    }, null, 2));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
