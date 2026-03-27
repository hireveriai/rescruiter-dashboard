function deriveInviteStatus(inviteStatus, expiresAt, attemptsUsed) {
  if (!expiresAt && !inviteStatus) {
    return null;
  }

  if (Number(attemptsUsed) > 0) {
    return "USED";
  }

  if (expiresAt && new Date(expiresAt) <= new Date()) {
    return "EXPIRED";
  }

  return inviteStatus || "ACTIVE";
}

function normalizeRiskLevel(riskLevel, fallbackSignalCount = 0) {
  if (riskLevel) {
    return String(riskLevel).toUpperCase();
  }

  return Number(fallbackSignalCount) > 0 ? "MEDIUM" : "LOW";
}

function buildDashboardAggregate(row, options = {}) {
  const candidateId = options.candidateId ?? row.candidateId ?? null;
  const interviewId = options.interviewId ?? row.interviewId ?? null;
  const expiresAt = row.expiresAt || null;
  const inviteStatus = deriveInviteStatus(row.inviteStatus, expiresAt, row.attemptsUsed);
  const riskLevel = normalizeRiskLevel(row.riskLevel, row.fraudSignalCount);

  return {
    candidate: candidateId
      ? {
          id: candidateId,
          firstName: row.candidateFirstName || row.firstName || null,
          lastName: row.candidateLastName || row.lastName || null,
          name: row.candidateName || row.name || null,
          email: row.candidateEmail || row.email || null,
          phone: row.candidatePhone || row.phone || null,
          status: row.candidateStatus || null,
        }
      : null,
    interview: interviewId
      ? {
          id: interviewId,
          status: row.interviewStatus || row.status || null,
          scheduledAt: row.scheduledAt || null,
        }
      : null,
    expiry: expiresAt,
    inviteStatus,
    riskLevel,
    invite: row.token || row.inviteId
      ? {
          id: row.inviteId || null,
          token: row.token || null,
          expiry: expiresAt,
          status: inviteStatus,
          attemptsUsed: row.attemptsUsed ?? 0,
          link: row.token ? `/interview/${row.token}` : null,
        }
      : null,
  };
}

function mapCandidateDashboard(row) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.candidateStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    interviewStatus: row.interviewStatus || null,
    expiry: row.expiresAt || null,
    riskLevel: normalizeRiskLevel(row.riskLevel, row.fraudSignalCount),
    job: row.jobId
      ? {
          id: row.jobId,
          title: row.jobTitle,
          department: row.department,
        }
      : null,
    fraudSignalCount: row.fraudSignalCount ?? 0,
    latestFraudAt: row.latestFraudAt,
    veris: row.summaryId
      ? {
          id: row.summaryId,
          summary: row.verisSummary,
          confidenceScore: row.confidenceScore,
          recommendation: row.recommendation,
        }
      : null,
    dashboard: buildDashboardAggregate(row, { candidateId: row.id, interviewId: row.interviewId }),
  };
}

function mapInterviewDashboard(row) {
  return {
    id: row.id,
    status: row.status,
    scheduledAt: row.scheduledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiry: row.expiresAt || null,
    riskLevel: normalizeRiskLevel(row.riskLevel, row.fraudSignalCount),
    candidate: {
      id: row.candidateId,
      firstName: row.candidateFirstName,
      lastName: row.candidateLastName,
      name: row.candidateName,
      email: row.candidateEmail,
      phone: row.candidatePhone,
    },
    job: row.jobId
      ? {
          id: row.jobId,
          title: row.jobTitle,
          department: row.department,
          location: row.location,
        }
      : null,
    recordingCount: row.recordingCount ?? 0,
    latestRecordingAt: row.latestRecordingAt,
    fraudSignalCount: row.fraudSignalCount ?? 0,
    dashboard: buildDashboardAggregate(row, { candidateId: row.candidateId, interviewId: row.id }),
  };
}

module.exports = {
  deriveInviteStatus,
  normalizeRiskLevel,
  buildDashboardAggregate,
  mapCandidateDashboard,
  mapInterviewDashboard,
};
