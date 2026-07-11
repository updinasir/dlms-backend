const Exam = require('../models/Exam');
const Notification = require('../models/Notification');
const pool = require('../config/database');
const notificationService = require('../services/notificationService');

// Minimum days a driver must wait after failing before retaking the same exam
const RETEST_WAIT_DAYS = 14;

const daysBetween = (from, to) => Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

// Get all exams
const getAllExams = async (req, res) => {
  try {
    const { type, status, search, date_from, date_to, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const filters = { type, status, search, date_from, date_to, limit, offset };
    const exams = await Exam.findAll(filters);
    const total = await Exam.count({ type, status, search, date_from, date_to });

    res.json({
      exams,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get exams error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get exam by ID
const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    res.json({ exam });
  } catch (error) {
    console.error('Get exam error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Schedule exam
const scheduleExam = async (req, res) => {
  try {
    // Verify driver exists and is not deleted
    const [driverCheck] = await pool.query(
      'SELECT driver_id FROM drivers WHERE driver_id = ? AND deleted_at IS NULL LIMIT 1',
      [req.body.driver_id]
    );
    if (driverCheck.length === 0) {
      return res.status(404).json({ message: 'Driver not found or has been deleted' });
    }

    const examType = String(req.body.exam_type || '').toLowerCase();
    if (!['theory', 'practical'].includes(examType)) {
      return res.status(400).json({ message: 'Invalid exam type. Must be theory or practical.' });
    }

    // Government workflow gate: a driver must pass the Theory Test before a Practical Test.
    if (examType === 'practical') {
      const theoryStats = await Exam.getAttemptStats(req.body.driver_id, 'theory');
      if (theoryStats.passes < 1) {
        return res.status(400).json({
          message: 'Driver must pass the Theory Test before a Practical Test can be scheduled.'
        });
      }
    }

    const stats = await Exam.getAttemptStats(req.body.driver_id, examType);

    // Prevent scheduling if one is already pending/awaiting result
    if (stats.hasPending) {
      return res.status(400).json({
        message: `This driver already has a scheduled ${examType} exam awaiting a result.`
      });
    }

    // Prevent re-scheduling an exam the driver already passed
    if (stats.passes > 0) {
      return res.status(400).json({
        message: `This driver has already passed the ${examType} exam.`
      });
    }

    // Enforce the retest waiting period after a failed attempt
    if (stats.lastFailDate) {
      const elapsed = daysBetween(new Date(stats.lastFailDate), new Date());
      if (elapsed < RETEST_WAIT_DAYS) {
        const remaining = RETEST_WAIT_DAYS - elapsed;
        return res.status(400).json({
          message: `Driver must wait ${remaining} more day(s) before retaking the ${examType} exam (waiting period is ${RETEST_WAIT_DAYS} days after a failure).`
        });
      }
    }

    const examData = {
      driver_id: req.body.driver_id,
      exam_type: req.body.exam_type,
      exam_date: req.body.exam_date,
      examiner_id: req.body.examiner_id || null,
      vehicle_used: req.body.vehicle_used || null,
      total_marks: req.body.total_marks || null,
      score: req.body.score || null,
      result: req.body.result || null,
      remarks: req.body.remarks || null
    };

    const exam = await Exam.create(examData);

    try {
      await Notification.create({
        driver_id: exam.driver_id,
        title: 'Exam Scheduled',
        message: `${exam.exam_type} exam scheduled for ${exam.exam_date ? new Date(exam.exam_date).toLocaleDateString() : 'the selected date'}.`,
        notification_type: 'info',
        is_read: 0,
        created_at: new Date()
      });
    } catch (notificationError) {
      console.error('Create exam notification error:', notificationError);
    }

    // Rich notifications (fire-and-forget)
    const examDateLabel = exam.exam_date ? new Date(exam.exam_date).toLocaleString() : 'the selected date';
    notificationService.safeNotify('driver.exam_reminder', {
      data: { type: exam.exam_type, date: examDateLabel, recordId: exam.exam_id, link: `/dashboard/exams` },
      target: { driverId: exam.driver_id },
      triggeredBy: req.user?.id || null
    });
    if (exam.examiner_id) {
      notificationService.safeNotify('examiner.new_exam_assigned', {
        data: { type: exam.exam_type, date: examDateLabel, recordId: exam.exam_id, link: `/dashboard/exams` },
        target: { userId: exam.examiner_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.status(201).json({
      message: 'Exam scheduled successfully',
      exam
    });
  } catch (error) {
    console.error('Schedule exam error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Submit exam result
const submitExamResult = async (req, res) => {
  try {
    const { score, result, remarks } = req.body;

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const scheduledDate = exam.exam_date ? new Date(exam.exam_date) : null;
    if (scheduledDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const scheduledDay = new Date(scheduledDate);
      scheduledDay.setHours(0, 0, 0, 0);

      if (today < scheduledDay) {
        return res.status(400).json({
          message: 'Result cannot be submitted before the scheduled exam date.'
        });
      }
    }

    const resultData = {
      score,
      result,
      remarks
    };

    const updatedExam = await Exam.submitResult(req.params.id, resultData);

    const tableName = exam.exam_type === 'practical' ? 'practical_exams' : 'theory_exams';

    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'UPDATE',
        table_name: tableName,
        record_id: exam.exam_id,
        action_time: new Date()
      });
    } catch (auditError) {
      console.warn('Exam audit log skipped:', auditError.message);
    }

    // Notify the driver of the result and alert admins that results were submitted
    notificationService.safeNotify('driver.exam_result', {
      data: { type: exam.exam_type, result: result || 'recorded', score: score ?? 'N/A', recordId: exam.exam_id, link: `/dashboard/exams` },
      overrides: { category: String(result).toLowerCase() === 'fail' ? 'Error' : 'Success' },
      target: { driverId: exam.driver_id },
      triggeredBy: req.user?.id || null
    });
    notificationService.safeNotify('admin.exam_results_submitted', {
      data: { name: `${exam.first_name || ''} ${exam.last_name || ''}`.trim() || 'A driver', recordId: exam.exam_id, link: `/dashboard/exams` },
      target: { roles: ['super_admin', 'admin'] },
      triggeredBy: req.user?.id || null
    });

    // Workflow next-step notifications (explicit content via send())
    const driverName = `${exam.first_name || ''} ${exam.last_name || ''}`.trim() || 'A driver';
    const isPass = String(result).toLowerCase() === 'pass';
    const examType = String(exam.exam_type).toLowerCase();
    const safeSend = (opts) => notificationService.send(opts).catch((e) => console.error('send error:', e.message));

    if (isPass && examType === 'theory') {
      safeSend({
        title: 'Theory Test Passed',
        message: `${driverName} passed the Theory Test. Schedule the Practical Test.`,
        category: 'Success',
        module: 'exams',
        link: '/dashboard/appointments/new',
        target: { roles: ['super_admin', 'admin'] },
        triggeredBy: req.user?.id || null
      });
    } else if (isPass && examType === 'practical') {
      safeSend({
        title: 'Practical Test Passed',
        message: `${driverName} passed the Practical Test. Verify payment and proceed to license approval.`,
        category: 'Success',
        module: 'exams',
        link: '/dashboard/payments/new',
        target: { roles: ['super_admin', 'admin', 'cashier'] },
        triggeredBy: req.user?.id || null
      });
      safeSend({
        title: 'Ready for License Processing',
        message: 'You passed all tests. Your license will be processed after payment verification.',
        category: 'Success',
        module: 'licenses',
        link: '/dashboard/licenses',
        target: { driverId: exam.driver_id },
        triggeredBy: req.user?.id || null
      });
    } else if (!isPass) {
      safeSend({
        title: 'Test Not Passed',
        message: `You did not pass the ${examType} test. You may request a retest after the ${RETEST_WAIT_DAYS}-day waiting period.`,
        category: 'Warning',
        module: 'exams',
        link: '/dashboard/exams',
        target: { driverId: exam.driver_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({
      message: 'Exam result submitted successfully',
      exam: updatedExam
    });
  } catch (error) {
    console.error('Submit exam result error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update exam
const updateExam = async (req, res) => {
  try {
    const exam = await Exam.update(req.params.id, req.body);

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    res.json({
      message: 'Exam updated successfully',
      exam
    });
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete exam
const deleteExam = async (req, res) => {
  try {
    await Exam.delete(req.params.id);

    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get exam statistics
const getExamStatistics = async (req, res) => {
  try {
    const stats = await Exam.getStatistics();
    res.json({ statistics: stats });
  } catch (error) {
    console.error('Get exam statistics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllExams,
  getExamById,
  scheduleExam,
  submitExamResult,
  updateExam,
  deleteExam,
  getExamStatistics
};