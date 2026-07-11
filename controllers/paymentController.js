const Payment = require('../models/Payment');
const Service = require('../models/Service');
const pool = require('../config/database');
const notificationService = require('../services/notificationService');

// Get all payments
const getAllPayments = async (req, res) => {
  try {
    const { status, type, search, date_from, date_to, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const filters = { status, type, search, date_from, date_to, limit, offset };
    const payments = await Payment.findAll(filters);
    const total = await Payment.count(filters);

    res.json({
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get payment by ID
const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({ payment });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create payment
const createPayment = async (req, res) => {
  try {
    // Verify driver exists
    const [driverCheck] = await pool.query(
      'SELECT driver_id FROM drivers WHERE driver_id = ? LIMIT 1',
      [req.body.driver_id]
    );
    if (driverCheck.length === 0) {
      return res.status(404).json({ message: 'Driver not found or has been deleted' });
    }

    // If service_id is provided, validate service and use official price
    let officialPrice = null;
    let serviceName = null;
    
    if (req.body.service_id) {
      const service = await Service.findById(req.body.service_id);
      if (!service) {
        return res.status(404).json({ message: 'Service not found' });
      }
      if (service.status !== 'Active') {
        return res.status(400).json({ message: 'Service is not active' });
      }
      
      officialPrice = parseFloat(service.official_price);
      serviceName = service.service_name;
      
      // Ensure payment amount matches official price
      const paymentAmount = parseFloat(req.body.amount);
      if (paymentAmount !== officialPrice) {
        return res.status(400).json({ 
          message: `Payment amount must equal official service price of $${officialPrice}`,
          official_price: officialPrice
        });
      }
    }

    const transactionReference = req.body.transaction_reference || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    const paymentData = {
      driver_id: req.body.driver_id,
      service_id: req.body.service_id || null,
      amount: req.body.amount,
      official_price_at_payment: officialPrice,
      payment_type: req.body.payment_type,
      payment_method: req.body.payment_method,
      transaction_reference: transactionReference,
      payment_date: new Date(),
      paid_at: req.body.payment_status === 'Completed' ? new Date() : null,
      cashier_id: req.user.id,
      payment_status: req.body.payment_status || 'Completed'
    };

    const payment = await Payment.create(paymentData);

    // Log activity
    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'CREATE',
        table_name: 'payments',
        record_id: payment.payment_id,
        action_time: new Date(),
        description: serviceName ? `Payment for ${serviceName}: $${paymentData.amount}` : `Payment: $${paymentData.amount}`
      });
    } catch (auditError) {
      console.warn('Payment audit log skipped:', auditError.message);
    }

    // Notifications (fire-and-forget)
    const amountLabel = `$${Number(paymentData.amount || 0).toLocaleString()}`;
    if (paymentData.payment_status === 'Completed') {
      notificationService.safeNotify('driver.payment_successful', {
        data: { amount: amountLabel, ref: transactionReference, recordId: payment.payment_id, link: `/dashboard/payments` },
        target: { driverId: paymentData.driver_id },
        triggeredBy: req.user?.id || null
      });
      notificationService.safeNotify('admin.payment_completed', {
        data: { amount: amountLabel, serviceName: serviceName || 'Service', recordId: payment.payment_id, link: `/dashboard/payments` },
        target: { roles: ['super_admin', 'admin'] },
        triggeredBy: req.user?.id || null
      });
    } else {
      notificationService.safeNotify('cashier.new_payment_waiting', {
        data: { amount: amountLabel, serviceName: serviceName || 'Service', recordId: payment.payment_id, link: `/dashboard/payments` },
        target: { roles: ['cashier'] },
        triggeredBy: req.user?.id || null
      });
    }

    res.status(201).json({
      message: 'Payment created successfully',
      payment
    });
  } catch (error) {
    console.error('Create payment error:', error);
    if (error.message.includes('must equal official service price')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// Update payment
const updatePayment = async (req, res) => {
  try {
    const payment = await Payment.update(req.params.id, req.body);

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({
      message: 'Payment updated successfully',
      payment
    });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete payment
const deletePayment = async (req, res) => {
  try {
    await Payment.delete(req.params.id);

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get payment statistics
const getPaymentStatistics = async (req, res) => {
  try {
    const stats = await Payment.getStatistics();
    res.json({ statistics: stats });
  } catch (error) {
    console.error('Get payment statistics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get total revenue
const getTotalRevenue = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const revenue = await Payment.getTotalRevenue({ date_from, date_to });
    res.json({ revenue });
  } catch (error) {
    console.error('Get total revenue error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get revenue by date range
const getRevenueByDateRange = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const revenue = await Payment.getRevenueByDateRange(start_date, end_date);
    res.json({ revenue });
  } catch (error) {
    console.error('Get revenue by date range error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Export payments to CSV
const exportPayments = async (req, res) => {
  try {
    const { status, type, search, date_from, date_to } = req.query;

    let query = `
      SELECT p.payment_id, p.transaction_reference, p.amount, p.payment_type, 
             p.payment_method, p.payment_status, p.payment_date, p.city,
             d.first_name, d.last_name, d.national_id
      FROM payments p
      LEFT JOIN drivers d ON p.driver_id = d.driver_id
      WHERE p.deleted_at IS NULL
    `;
    const params = [];

    if (search) {
      query += ` AND (p.transaction_reference LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += ` AND p.payment_status = ?`;
      params.push(status);
    }

    if (type) {
      query += ` AND p.payment_type = ?`;
      params.push(type);
    }

    if (date_from) {
      query += ` AND p.payment_date >= ?`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND p.payment_date <= ?`;
      params.push(date_to);
    }

    query += ` ORDER BY p.payment_date DESC`;

    const [payments] = await pool.query(query, params);

    // Convert to CSV
    const headers = ['Payment ID', 'Transaction Reference', 'Amount', 'Type', 'Method', 'Status', 'Date', 'City', 'First Name', 'Last Name', 'National ID'];
    const csvRows = [headers.join(',')];

    payments.forEach(payment => {
      const row = [
        payment.payment_id,
        payment.transaction_reference,
        payment.amount,
        payment.payment_type,
        payment.payment_method,
        payment.payment_status,
        payment.payment_date,
        payment.city,
        payment.first_name,
        payment.last_name,
        payment.national_id
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payments-export-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  getPaymentStatistics,
  getTotalRevenue,
  getRevenueByDateRange,
  exportPayments
};
