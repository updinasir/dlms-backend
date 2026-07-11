const Driver = require('../models/Driver');
const License = require('../models/License');
const Payment = require('../models/Payment');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const pool = require('../config/database');

// Helper: map category code (A, B, C) to category_id
const categoryCodeToId = { A: 1, B: 2, C: 3, D: 4, E: 5 };

// Sanitize cell values to prevent Excel formula injection
function sanitizeExcelCell(value) {
  if (value == null) return value;
  const str = String(value);
  if (/^[\+\-=\t\r\n@]/.test(str)) {
    return '\'' + str;
  }
  return value;
}

function sanitizeRow(rowObj) {
  const out = {};
  for (const [k, v] of Object.entries(rowObj)) {
    out[k] = sanitizeExcelCell(v);
  }
  return out;
}

// Helper: build PDF with headers and rows
function buildPDF(res, title, headers, rows, filename) {
  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  doc.pipe(res);

  doc.fontSize(18).text(title, { align: 'center' });
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(2);

  // Table header
  const colWidth = 520 / headers.length;
  let x = 40;
  doc.fontSize(9).fillColor('#333333');
  headers.forEach((h, i) => {
    doc.rect(x + i * colWidth, doc.y, colWidth, 20).fill('#e5e7eb');
    doc.fillColor('#111827').text(h, x + i * colWidth + 4, doc.y - 16, { width: colWidth - 8, height: 20 });
  });
  doc.moveDown();

  // Rows
  rows.forEach((row, idx) => {
    const y = doc.y;
    doc.fillColor(idx % 2 === 0 ? '#f9fafb' : '#ffffff');
    doc.rect(40, y, 520, 18).fill();
    doc.fillColor('#374151');
    row.forEach((cell, i) => {
      doc.text(String(cell ?? '-'), x + i * colWidth + 4, y + 3, { width: colWidth - 8, height: 18 });
    });
    doc.y = y + 18;
    if (doc.y > 720) { doc.addPage(); doc.y = 40; }
  });

  doc.end();
}

// Generate driver report
const generateDriverReport = async (req, res) => {
  try {
    const { status, date_from, date_to, format = 'json' } = req.query;
    const filters = { status };
    if (date_from) filters.date_from = date_from;
    if (date_to) filters.date_to = date_to + ' 23:59:59';

    const drivers = await Driver.findAll(filters);

    const summary = {
      total: drivers.length,
      by_status: {},
      by_city: {}
    };
    drivers.forEach(d => {
      summary.by_status[d.status] = (summary.by_status[d.status] || 0) + 1;
      summary.by_city[d.city] = (summary.by_city[d.city] || 0) + 1;
    });

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Drivers');
      worksheet.columns = [
        { header: 'Driver ID', key: 'driver_id', width: 12 },
        { header: 'National ID', key: 'national_id', width: 16 },
        { header: 'First Name', key: 'first_name', width: 15 },
        { header: 'Last Name', key: 'last_name', width: 15 },
        { header: 'Gender', key: 'gender', width: 10 },
        { header: 'Phone', key: 'phone', width: 14 },
        { header: 'Email', key: 'email', width: 22 },
        { header: 'City', key: 'city', width: 14 },
        { header: 'Blood Group', key: 'blood_group', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Registration Date', key: 'registration_date', width: 18 }
      ];
      drivers.forEach(d => worksheet.addRow(sanitizeRow(d)));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=drivers-report.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } else if (format === 'pdf') {
      const headers = ['Driver ID', 'National ID', 'Name', 'Gender', 'Phone', 'City', 'Status', 'Registered'];
      const rows = drivers.map(d => [d.driver_id, d.national_id, `${d.first_name} ${d.last_name}`, d.gender, d.phone, d.city, d.status, d.registration_date?.split('T')[0]]);
      buildPDF(res, 'Driver Report', headers, rows, 'drivers-report.pdf');
    } else {
      res.json({ drivers, summary, generated_at: new Date() });
    }
  } catch (error) {
    console.error('Generate driver report error:', error);
    res.status(500).json({ message: 'Server error generating driver report' });
  }
};

// Generate license report
const generateLicenseReport = async (req, res) => {
  try {
    const { status, category, date_from, date_to, format = 'json' } = req.query;
    const filters = { status };
    if (category && categoryCodeToId[category]) {
      filters.category_id = categoryCodeToId[category];
    }
    if (date_from) filters.date_from = date_from;
    if (date_to) filters.date_to = date_to + ' 23:59:59';

    const licenses = await License.findAll(filters);

    // Get category names
    const [catRows] = await pool.query('SELECT category_id, category_code, category_name FROM license_categories');
    const catMap = {};
    catRows.forEach(c => { catMap[c.category_id] = `${c.category_code} - ${c.category_name}`; });

    const summary = {
      total: licenses.length,
      by_status: {},
      by_category: {},
      expiring_soon: 0
    };
    const today = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(today.getDate() + 30);

    licenses.forEach(l => {
      summary.by_status[l.license_status] = (summary.by_status[l.license_status] || 0) + 1;
      const catName = catMap[l.category_id] || l.category_id;
      summary.by_category[catName] = (summary.by_category[catName] || 0) + 1;
      if (l.expiry_date && new Date(l.expiry_date) <= thirtyDays && new Date(l.expiry_date) >= today) {
        summary.expiring_soon++;
      }
    });

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Licenses');
      worksheet.columns = [
        { header: 'License ID', key: 'license_id', width: 12 },
        { header: 'License Number', key: 'license_number', width: 16 },
        { header: 'Driver Name', key: 'driver_name', width: 20 },
        { header: 'National ID', key: 'national_id', width: 16 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Status', key: 'license_status', width: 12 },
        { header: 'Issue Date', key: 'issue_date', width: 14 },
        { header: 'Expiry Date', key: 'expiry_date', width: 14 }
      ];
      licenses.forEach(l => worksheet.addRow(sanitizeRow({
        license_id: l.license_id,
        license_number: l.license_number,
        driver_name: `${l.first_name} ${l.last_name}`,
        national_id: l.national_id,
        category: catMap[l.category_id] || l.category_id,
        license_status: l.license_status,
        issue_date: l.issue_date,
        expiry_date: l.expiry_date
      })));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=licenses-report.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } else if (format === 'pdf') {
      const headers = ['License ID', 'Number', 'Driver', 'Category', 'Status', 'Issued', 'Expires'];
      const rows = licenses.map(l => [l.license_id, l.license_number, `${l.first_name} ${l.last_name}`, catMap[l.category_id] || l.category_id, l.license_status, l.issue_date?.split('T')[0], l.expiry_date?.split('T')[0]]);
      buildPDF(res, 'License Report', headers, rows, 'licenses-report.pdf');
    } else {
      res.json({ licenses, summary, categories: catMap, generated_at: new Date() });
    }
  } catch (error) {
    console.error('Generate license report error:', error);
    res.status(500).json({ message: 'Server error generating license report' });
  }
};

// Generate revenue report
const generateRevenueReport = async (req, res) => {
  try {
    const { date_from, date_to, format = 'json' } = req.query;
    const filters = { status: 'Completed' };
    if (date_from) filters.date_from = date_from;
    if (date_to) filters.date_to = date_to + ' 23:59:59';

    const payments = await Payment.findAll(filters);

    const summary = {
      total_payments: payments.length,
      total_amount: payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0).toFixed(2),
      by_payment_type: {},
      by_payment_method: {}
    };
    payments.forEach(p => {
      summary.by_payment_type[p.payment_type] = (summary.by_payment_type[p.payment_type] || 0) + 1;
      summary.by_payment_method[p.payment_method] = (summary.by_payment_method[p.payment_method] || 0) + 1;
    });

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Payments');
      worksheet.columns = [
        { header: 'Payment ID', key: 'payment_id', width: 12 },
        { header: 'Driver Name', key: 'driver_name', width: 20 },
        { header: 'National ID', key: 'national_id', width: 16 },
        { header: 'Amount', key: 'amount', width: 12 },
        { header: 'Payment Type', key: 'payment_type', width: 16 },
        { header: 'Method', key: 'payment_method', width: 14 },
        { header: 'Reference', key: 'transaction_reference', width: 18 },
        { header: 'Date', key: 'payment_date', width: 16 },
        { header: 'Status', key: 'payment_status', width: 12 }
      ];
      payments.forEach(p => worksheet.addRow(sanitizeRow({
        payment_id: p.payment_id,
        driver_name: `${p.first_name} ${p.last_name}`,
        national_id: p.national_id,
        amount: parseFloat(p.amount).toFixed(2),
        payment_type: p.payment_type,
        payment_method: p.payment_method,
        transaction_reference: p.transaction_reference,
        payment_date: p.payment_date,
        payment_status: p.payment_status
      })));
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=revenue-report.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } else if (format === 'pdf') {
      const headers = ['Payment ID', 'Driver', 'Amount', 'Type', 'Method', 'Date', 'Status'];
      const rows = payments.map(p => [p.payment_id, `${p.first_name} ${p.last_name}`, parseFloat(p.amount).toFixed(2), p.payment_type, p.payment_method, p.payment_date?.split('T')[0], p.payment_status]);
      buildPDF(res, 'Revenue Report', headers, rows, 'revenue-report.pdf');
    } else {
      res.json({ payments, summary, generated_at: new Date() });
    }
  } catch (error) {
    console.error('Generate revenue report error:', error);
    res.status(500).json({ message: 'Server error generating revenue report' });
  }
};

// Generate examiner performance report
const generateExaminerReport = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const apptParams = [];
    const examParams = [];
    let apptDateFilter = '';
    let examDateFilter = '';
    if (date_from && date_to) {
      apptDateFilter = 'AND appointment_date BETWEEN ? AND ?';
      examDateFilter = 'AND exam_date BETWEEN ? AND ?';
      apptParams.push(date_from, `${date_to} 23:59:59`);
      examParams.push(date_from, `${date_to} 23:59:59`);
    }

    const [rows] = await pool.query(
      `SELECT
        u.user_id,
        u.full_name,
        appt.total_appointments,
        appt.completed_appointments,
        appt.no_shows,
        appt.late_arrivals,
        exams.practical_exams,
        exams.passes,
        exams.fails,
        exams.average_score
      FROM users u
      LEFT JOIN (
        SELECT
          examiner_id,
          COUNT(DISTINCT appointment_id) AS total_appointments,
          COUNT(DISTINCT CASE WHEN status = 'Completed' THEN appointment_id END) AS completed_appointments,
          COUNT(DISTINCT CASE WHEN status = 'No Show' THEN appointment_id END) AS no_shows,
          COUNT(DISTINCT CASE WHEN late_at IS NOT NULL THEN appointment_id END) AS late_arrivals
        FROM appointments
        WHERE 1=1 ${apptDateFilter}
        GROUP BY examiner_id
      ) appt ON u.user_id = appt.examiner_id
      LEFT JOIN (
        SELECT
          examiner_id,
          COUNT(DISTINCT practical_exam_id) AS practical_exams,
          COUNT(DISTINCT CASE WHEN result = 'Pass' THEN practical_exam_id END) AS passes,
          COUNT(DISTINCT CASE WHEN result = 'Fail' THEN practical_exam_id END) AS fails,
          ROUND(AVG(score), 2) AS average_score
        FROM practical_exams
        WHERE 1=1 ${examDateFilter}
        GROUP BY examiner_id
      ) exams ON u.user_id = exams.examiner_id
      WHERE u.role_id = 3
      ORDER BY completed_appointments DESC`,
      [...apptParams, ...examParams]
    );

    const summary = {
      total_examiners: rows.length,
      total_appointments: rows.reduce((sum, r) => sum + r.total_appointments, 0),
      total_no_shows: rows.reduce((sum, r) => sum + r.no_shows, 0),
      total_passes: rows.reduce((sum, r) => sum + r.passes, 0),
      total_fails: rows.reduce((sum, r) => sum + r.fails, 0)
    };

    res.json({ examiners: rows, summary, generated_at: new Date() });
  } catch (error) {
    console.error('Generate examiner report error:', error);
    res.status(500).json({ message: 'Server error generating examiner report' });
  }
};

// Generate workflow dashboard report
const generateWorkflowReport = async (req, res) => {
  try {
    const [[apptStats]] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN status IN ('Pending','Approved') THEN 1 END) AS scheduled,
        COUNT(CASE WHEN status = 'Checked In' THEN 1 END) AS checked_in,
        COUNT(CASE WHEN status = 'Waiting' THEN 1 END) AS waiting,
        COUNT(CASE WHEN status = 'In Progress' THEN 1 END) AS in_progress,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) AS completed,
        COUNT(CASE WHEN status = 'No Show' THEN 1 END) AS no_show,
        COUNT(CASE WHEN status = 'Expired' THEN 1 END) AS expired,
        COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) AS cancelled,
        COUNT(CASE WHEN reschedule_requested = 1 THEN 1 END) AS reschedule_requests
      FROM appointments`
    );

    const [[licenseStats]] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN license_status = 'Pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN license_status = 'Active' THEN 1 END) AS active,
        COUNT(CASE WHEN license_status = 'Expired' THEN 1 END) AS expired,
        COUNT(CASE WHEN license_status = 'Suspended' THEN 1 END) AS suspended,
        COUNT(CASE WHEN license_status = 'Revoked' THEN 1 END) AS revoked
      FROM licenses`
    );

    const [[paymentStats]] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN payment_status = 'Completed' THEN 1 END) AS completed,
        COUNT(CASE WHEN payment_status = 'Pending' THEN 1 END) AS pending,
        SUM(CASE WHEN payment_status = 'Completed' THEN amount ELSE 0 END) AS revenue
      FROM payments`
    );

    const [[driverStats]] = await pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'Approved' THEN 1 END) AS approved,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN status = 'Rejected' THEN 1 END) AS rejected
      FROM drivers`
    );

    res.json({
      appointments: apptStats,
      licenses: licenseStats,
      payments: paymentStats,
      drivers: driverStats,
      generated_at: new Date()
    });
  } catch (error) {
    console.error('Generate workflow report error:', error);
    res.status(500).json({ message: 'Server error generating workflow report' });
  }
};

module.exports = {
  generateDriverReport,
  generateLicenseReport,
  generateRevenueReport,
  generateExaminerReport,
  generateWorkflowReport
};
