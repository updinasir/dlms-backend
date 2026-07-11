const pool = require('../config/database');
const Payment = require('../models/Payment');
const License = require('../models/License');
const Exam = require('../models/Exam');

// Get dashboard statistics
const getDashboardStatistics = async (req, res) => {
  try {
    const [[drvCol]] = await pool.query("SHOW COLUMNS FROM drivers LIKE 'deleted_at'");
    const hasSoftDelete = !!drvCol;
    const driverWhere = hasSoftDelete ? 'WHERE deleted_at IS NULL' : '';
    const [driverCount] = await pool.query(`SELECT COUNT(*) as count FROM drivers ${driverWhere}`);
    const paymentStats = await Payment.getStatistics();
    const licenseStats = await License.getStatistics();
    const drvJoinFilter = hasSoftDelete ? 'AND d.deleted_at IS NULL' : '';
    const [appointmentCount] = await pool.query(`SELECT COUNT(*) as count FROM appointments a LEFT JOIN drivers d ON a.driver_id = d.driver_id WHERE a.status IN ("Pending", "Approved") ${drvJoinFilter}`);
    const examStats = await Exam.getStatistics();

    res.json({
      totalDrivers: driverCount[0].count,
      activeLicenses: licenseStats.active,
      totalRevenue: paymentStats.revenue || 0,
      pendingExams: examStats.pending,
      upcomingAppointments: appointmentCount[0].count
    });
  } catch (error) {
    console.error('Get dashboard statistics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get revenue chart data
const getRevenueChartData = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const revenue = await Payment.getRevenueByDateRange(
      startDate.toISOString().split('T')[0],
      new Date().toISOString().split('T')[0]
    );

    res.json({ revenue });
  } catch (error) {
    console.error('Get revenue chart data error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get license status distribution
const getLicenseStatusDistribution = async (req, res) => {
  try {
    const stats = await License.getStatistics();
    
    const distribution = [
      { name: 'Active', value: stats.active, color: '#10B981' },
      { name: 'Expired', value: stats.expired, color: '#EF4444' },
      { name: 'Suspended', value: stats.suspended, color: '#F59E0B' },
      { name: 'Revoked', value: stats.revoked, color: '#6B7280' }
    ];

    res.json({ distribution });
  } catch (error) {
    console.error('Get license status distribution error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get exam results chart
const getExamResultsChart = async (req, res) => {
  try {
    const stats = await Exam.getStatistics();
    
    const results = [
      { name: 'Passed', value: stats.passed, color: '#10B981' },
      { name: 'Failed', value: stats.failed, color: '#EF4444' },
      { name: 'Pending', value: stats.pending, color: '#F59E0B' }
    ];

    res.json({ results });
  } catch (error) {
    console.error('Get exam results chart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getDashboardStatistics,
  getRevenueChartData,
  getLicenseStatusDistribution,
  getExamResultsChart
};
