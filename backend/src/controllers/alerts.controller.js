const alertsService = require("../services/alerts.service");

async function getAlerts(req, res, next) {
  try {
    const alerts = await alertsService.getAlerts();

    res.status(200).json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAlerts,
};
