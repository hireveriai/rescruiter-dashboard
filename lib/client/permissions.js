export const FEATURE_PERMISSIONS = {
  dashboard: [],
  aiScreening: ["ai.use"],
  jobs: ["interviews.create", "interviews.edit"],
  candidates: ["candidates.view"],
  interviews: ["interviews.create", "interviews.edit", "interviews.delete"],
  reports: ["reports.view"],
  billing: ["billing.view"],
  alerts: ["alerts.view"],
  manageTeam: ["users.manage"],
  settings: ["organization.settings"],
  createJob: ["interviews.create"],
  sendInterview: ["candidates.invite", "interviews.create"],
  editInterview: ["interviews.edit"],
  deleteInterview: ["interviews.delete"],
  retryInterview: ["interviews.edit"],
  warRoom: ["warroom.view", "warroom.analyze"],
  warRoomAnalyze: ["warroom.analyze"],
  copilot: ["ai.use"],
};

export const DEFAULT_RECRUITER_PERMISSIONS = [
  "ai.use",
  "alerts.view",
  "candidates.invite",
  "candidates.view",
  "interviews.create",
  "interviews.edit",
  "reports.view",
];

export const DEFAULT_RECRUITER_PERMISSION_PROFILE = {
  permissions: DEFAULT_RECRUITER_PERMISSIONS,
  isOptimisticPermissions: true,
};

function toPermissionSet(source) {
  if (Array.isArray(source)) {
    return new Set(source.filter(Boolean));
  }

  if (Array.isArray(source?.permissions)) {
    return new Set(source.permissions.filter(Boolean));
  }

  return new Set();
}

export function hasAnyPermission(source, required = []) {
  if (!required.length) {
    return true;
  }

  const permissions = toPermissionSet(source);
  return required.some((permission) => permissions.has(permission));
}

export function hasAllPermissions(source, required = []) {
  if (!required.length) {
    return true;
  }

  const permissions = toPermissionSet(source);
  return required.every((permission) => permissions.has(permission));
}

export function canAccessFeature(source, feature) {
  return hasAnyPermission(source, FEATURE_PERMISSIONS[feature] ?? []);
}
