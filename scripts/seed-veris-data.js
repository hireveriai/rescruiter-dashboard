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

async function ensureAttempt(client, interviewId, startedOffsetMinutes, endedOffsetMinutes) {
  const existing = await client.query(
    `
      select attempt_id
      from public.interview_attempts
      where interview_id = $1::uuid
      order by started_at desc
      limit 1
    `,
    [interviewId]
  );

  if (existing.rows[0]?.attempt_id) {
    return existing.rows[0].attempt_id;
  }

  const inserted = await client.query(
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
        now() - ($2 || ' minutes')::interval,
        now() - ($3 || ' minutes')::interval,
        'completed'
      )
      returning attempt_id
    `,
    [interviewId, String(startedOffsetMinutes), String(endedOffsetMinutes)]
  );

  return inserted.rows[0].attempt_id;
}

async function upsertEvaluation(client, attemptId, finalScore, decision, aiSummary) {
  await client.query(
    `
      insert into public.interview_evaluations (
        attempt_id,
        final_score,
        decision,
        ai_summary,
        is_locked
      )
      values ($1::uuid, $2, $3, $4, true)
      on conflict (attempt_id)
      do update set
        final_score = excluded.final_score,
        decision = excluded.decision,
        ai_summary = excluded.ai_summary,
        is_locked = excluded.is_locked,
        created_at = now()
    `,
    [attemptId, finalScore, decision, aiSummary]
  );
}

async function upsertSummary(client, attemptId, overallScore, riskLevel, strengths, weaknesses, recommendation) {
  await client.query(
    `
      insert into public.interview_summaries (
        attempt_id,
        overall_score,
        risk_level,
        strengths,
        weaknesses,
        hire_recommendation
      )
      values ($1::uuid, $2, $3, $4, $5, $6)
      on conflict (attempt_id)
      do update set
        overall_score = excluded.overall_score,
        risk_level = excluded.risk_level,
        strengths = excluded.strengths,
        weaknesses = excluded.weaknesses,
        hire_recommendation = excluded.hire_recommendation,
        created_at = now()
    `,
    [attemptId, overallScore, riskLevel, strengths, weaknesses, recommendation]
  );
}

async function main() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('begin');

    await client.query(
      `update public.interviews set status = 'COMPLETED' where interview_id = $1::uuid`,
      ['b3ab8efc-9808-404a-95dd-9e6c8730c197']
    );

    await client.query(
      `update public.interviews set status = 'COMPLETED' where interview_id = $1::uuid`,
      ['c2719b9f-6fba-4061-97ca-58fc882d6ede']
    );

    const harshitAttemptId = await ensureAttempt(client, 'b3ab8efc-9808-404a-95dd-9e6c8730c197', 55, 18);
    const ektaAttemptId = await ensureAttempt(client, 'c2719b9f-6fba-4061-97ca-58fc882d6ede', 95, 42);

    await upsertEvaluation(
      client,
      harshitAttemptId,
      84,
      'HIRE',
      'Candidate demonstrated strong command of database administration fundamentals, especially around indexing, query planning, backup strategy, and operational troubleshooting. Communication stayed structured throughout the interview, and the answers showed practical production awareness rather than textbook recall. A few responses on cross-region failover and long-term observability could have gone deeper, but overall the candidate showed dependable senior-level judgment for a recruiter screening context.'
    );

    await upsertEvaluation(
      client,
      ektaAttemptId,
      76,
      'REVIEW',
      'Candidate showed solid analytical thinking and useful practical understanding of data engineering workflows. The strongest areas were SQL problem solving, schema reasoning, and handling ETL edge cases. Some answers on distributed processing tradeoffs, production monitoring depth, and data platform scaling needed more clarity. Overall the interview indicates good potential, with a recommendation for a second-round review focused on system depth.'
    );

    await upsertSummary(
      client,
      harshitAttemptId,
      84,
      'LOW',
      'Strong SQL optimization knowledge, disciplined backup thinking, and mature troubleshooting under pressure.',
      'Needs a bit more depth on cross-region failover design and long-term observability planning.',
      'PROCEED'
    );

    await upsertSummary(
      client,
      ektaAttemptId,
      76,
      'MEDIUM',
      'Good communication, clear ETL reasoning, and strong familiarity with relational data handling.',
      'Distributed architecture tradeoffs and production monitoring answers were not yet consistently deep.',
      'REVIEW'
    );

    await client.query('commit');

    console.log(JSON.stringify({
      success: true,
      seededAttempts: [harshitAttemptId, ektaAttemptId],
      seededSummaries: 2,
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
