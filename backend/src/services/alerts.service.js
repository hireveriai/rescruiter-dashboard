const alertsRepository = require("../repositories/alerts.repository");
const dashboardService = require("./dashboard.service");

async function getAlerts() {
  const alerts = await alertsRepository.findAllAlerts();

  return alerts.map((alert) => ({
    ...alert,
    severity: alert.severity ? String(alert.severity).toUpperCase() : null,
    riskLevel: dashboardService.normalizeRiskLevel(alert.severity, 1),
  }));
}

module.exports = {
  getAlerts,
};
