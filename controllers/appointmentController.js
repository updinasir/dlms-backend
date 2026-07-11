const Appointment = require('../models/Appointment');
const pool = require('../config/database');
const notificationService = require('../services/notificationService');

const apptDateLabel = (d) => (d ? new Date(d).toLocaleString() : 'the scheduled date');
const safeSend = (opts) => notificationService.send(opts).catch((e) => console.error('send error:', e.message));

// Official working hours (24h clock) and days (0 = Sunday ... 6 = Saturday)
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 17;
const WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Monday to Saturday
// Appointment statuses considered "active" (occupy a slot / block duplicates)
const ACTIVE_STATUSES = ['Pending', 'Approved', 'Checked In', 'Waiting', 'In Progress'];
// Appointment types that require an assigned examiner
const EXAM_TYPES = ['Theory Test', 'Practical Test'];

// Get all appointments
const getAllAppointments = async (req, res) => {
  try {
    const { status, type, search, date_from, date_to, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const filters = { status, type, search, date_from, date_to, limit, offset };
    const appointments = await Appointment.findAll(filters);
    const total = await Appointment.count(filters);

    res.json({
      appointments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get appointment by ID
const getAppointmentById = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    res.json({ appointment });
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create appointment
const createAppointment = async (req, res) => {
  try {
    const { driver_id, appointment_type, appointment_date, examiner_id, room } = req.body;

    // Verify driver exists and is not deleted if driver_id is provided
    if (driver_id) {
      const [driverCheck] = await pool.query(
        'SELECT driver_id FROM drivers WHERE driver_id = ? AND deleted_at IS NULL LIMIT 1',
        [driver_id]
      );
      if (driverCheck.length === 0) {
        return res.status(404).json({ message: 'Driver not found or has been deleted' });
      }
    }

    // --- Appointment date validation ---
    const apptDate = new Date(appointment_date);
    if (isNaN(apptDate.getTime())) {
      return res.status(400).json({ message: 'Invalid appointment date' });
    }
    if (apptDate.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Appointment date cannot be in the past' });
    }

    // --- Working hours / working day validation ---
    if (!WORKING_DAYS.includes(apptDate.getDay())) {
      return res.status(400).json({ message: 'Appointments can only be scheduled Monday to Saturday' });
    }
    const hour = apptDate.getHours();
    if (hour < WORK_START_HOUR || hour >= WORK_END_HOUR) {
      return res.status(400).json({ message: `Appointments must be within working hours (${WORK_START_HOUR}:00 - ${WORK_END_HOUR}:00)` });
    }

    // --- Examiner is mandatory for Theory/Practical tests ---
    if (EXAM_TYPES.includes(appointment_type) && !examiner_id) {
      return res.status(400).json({ message: 'An examiner must be assigned to test appointments' });
    }

    // --- No two active appointments for the same driver + service ---
    if (driver_id) {
      const [dupService] = await pool.query(
        `SELECT appointment_id FROM appointments
         WHERE driver_id = ? AND appointment_type = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) LIMIT 1`,
        [driver_id, appointment_type, ...ACTIVE_STATUSES]
      );
      if (dupService.length > 0) {
        return res.status(409).json({ message: `This driver already has an active ${appointment_type} appointment` });
      }
    }

    // --- Examiner cannot be double-booked at the same date/time ---
    if (examiner_id) {
      const [examinerClash] = await pool.query(
        `SELECT appointment_id FROM appointments
         WHERE examiner_id = ? AND appointment_date = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) LIMIT 1`,
        [examiner_id, appointment_date, ...ACTIVE_STATUSES]
      );
      if (examinerClash.length > 0) {
        return res.status(409).json({ message: 'The selected examiner is already booked at this date and time' });
      }
    }

    // --- Room cannot be double-booked at the same date/time ---
    if (room) {
      const [roomClash] = await pool.query(
        `SELECT appointment_id FROM appointments
         WHERE room = ? AND appointment_date = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) LIMIT 1`,
        [room, appointment_date, ...ACTIVE_STATUSES]
      );
      if (roomClash.length > 0) {
        return res.status(409).json({ message: 'The selected room is already booked at this date and time' });
      }
    }

    const appointmentData = {
      ...req.body,
      status: 'Pending',
      created_at: new Date()
    };

    const appointment = await Appointment.create(appointmentData);

    if (appointment.driver_id) {
      notificationService.safeNotify('driver.appointment_confirmed', {
        data: {
          type: appointment.appointment_type || 'appointment',
          date: apptDateLabel(appointment.appointment_date),
          center: appointment.center_name || 'the center',
          recordId: appointment.appointment_id,
          link: `/dashboard/appointments`
        },
        target: { driverId: appointment.driver_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.status(201).json({
      message: 'Appointment created successfully',
      appointment
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update appointment
const updateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.update(req.params.id, req.body);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.driver_id && req.body.appointment_date) {
      notificationService.safeNotify('driver.appointment_rescheduled', {
        data: {
          type: appointment.appointment_type || 'appointment',
          date: apptDateLabel(appointment.appointment_date),
          recordId: appointment.appointment_id,
          link: `/dashboard/appointments`
        },
        target: { driverId: appointment.driver_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({
      message: 'Appointment updated successfully',
      appointment
    });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete appointment
const deleteAppointment = async (req, res) => {
  try {
    await Appointment.delete(req.params.id);

    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel appointment
const cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.cancel(req.params.id);

    if (appointment?.driver_id) {
      notificationService.safeNotify('driver.appointment_cancelled', {
        data: {
          type: appointment.appointment_type || 'appointment',
          date: apptDateLabel(appointment.appointment_date),
          recordId: appointment.appointment_id,
          link: `/dashboard/appointments`
        },
        target: { driverId: appointment.driver_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({
      message: 'Appointment cancelled successfully',
      appointment
    });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Complete appointment
const completeAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.complete(req.params.id);

    res.json({
      message: 'Appointment completed successfully',
      appointment
    });
  } catch (error) {
    console.error('Complete appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Check in a driver for their appointment
const checkInAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.checkIn(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    res.json({ message: 'Driver checked in', appointment });
  } catch (error) {
    console.error('Check-in appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Move appointment to Waiting
const setWaitingAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.setWaiting(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    res.json({ message: 'Appointment moved to waiting', appointment });
  } catch (error) {
    console.error('Set waiting appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Start the appointment (exam in progress)
const startAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.startProgress(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    res.json({ message: 'Appointment in progress', appointment });
  } catch (error) {
    console.error('Start appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark appointment as Late (driver arrived late but still attended)
const markLateAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.markLate(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    safeSend({
      title: 'Appointment Marked Late',
      message: `Your ${appointment.appointment_type} appointment was marked as late.`,
      category: 'Warning',
      module: 'appointments',
      link: '/dashboard/appointments',
      target: { driverId: appointment.driver_id },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'Appointment marked as late', appointment });
  } catch (error) {
    console.error('Mark late appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Mark appointment as No Show
const markNoShowAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.markNoShow(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (appointment.driver_id) {
      safeSend({
        title: 'Missed Appointment',
        message: 'You were marked as No Show. Please request a new appointment.',
        category: 'Warning',
        module: 'appointments',
        link: '/dashboard/appointments',
        target: { driverId: appointment.driver_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({ message: 'Appointment marked as No Show', appointment });
  } catch (error) {
    console.error('No-show appointment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Driver requests a reschedule
const requestReschedule = async (req, res) => {
  try {
    const { reason, preferred_date } = req.body;
    const appointment = await Appointment.requestReschedule(req.params.id, { reason, preferred_date });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    safeSend({
      title: 'Reschedule Requested',
      message: `A driver requested to reschedule their ${appointment.appointment_type}. Reason: ${reason || 'N/A'}`,
      category: 'Information',
      module: 'appointments',
      link: '/dashboard/appointments',
      target: { roles: ['super_admin', 'admin'] },
      triggeredBy: req.user?.id || null
    });

    res.json({ message: 'Reschedule request submitted', appointment });
  } catch (error) {
    console.error('Request reschedule error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin approves reschedule with a new date
const approveReschedule = async (req, res) => {
  try {
    const { appointment_date } = req.body;
    if (!appointment_date) return res.status(400).json({ message: 'New appointment date is required' });

    const appointment = await Appointment.approveReschedule(req.params.id, appointment_date);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (appointment.driver_id) {
      notificationService.safeNotify('driver.appointment_rescheduled', {
        data: {
          type: appointment.appointment_type || 'appointment',
          date: apptDateLabel(appointment.appointment_date),
          recordId: appointment.appointment_id,
          link: `/dashboard/appointments`
        },
        target: { driverId: appointment.driver_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({ message: 'Reschedule approved', appointment });
  } catch (error) {
    console.error('Approve reschedule error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin rejects reschedule request
const rejectReschedule = async (req, res) => {
  try {
    const { reason } = req.body;
    const appointment = await Appointment.rejectReschedule(req.params.id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (appointment.driver_id) {
      safeSend({
        title: 'Reschedule Request Declined',
        message: `Your reschedule request was declined. ${reason || 'Please attend at the original time.'}`,
        category: 'Warning',
        module: 'appointments',
        link: '/dashboard/appointments',
        target: { driverId: appointment.driver_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({ message: 'Reschedule request rejected', appointment });
  } catch (error) {
    console.error('Reject reschedule error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin reassigns examiner
const reassignExaminer = async (req, res) => {
  try {
    const { examiner_id } = req.body;
    const appointment = await Appointment.reassignExaminer(req.params.id, examiner_id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (examiner_id) {
      notificationService.safeNotify('examiner.new_exam_assigned', {
        data: {
          type: appointment.appointment_type || 'appointment',
          date: apptDateLabel(appointment.appointment_date),
          recordId: appointment.appointment_id,
          link: `/dashboard/appointments`
        },
        target: { userId: examiner_id },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({ message: 'Examiner reassigned', appointment });
  } catch (error) {
    console.error('Reassign examiner error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get upcoming appointments
const getUpcomingAppointments = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const appointments = await Appointment.getUpcoming(parseInt(days));
    res.json({ appointments });
  } catch (error) {
    console.error('Get upcoming appointments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get overdue appointments (for notifications)
const getOverdueAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.getOverdue();
    const notifications = appointments.map((a) => ({
      id: `overdue-${a.appointment_id || a.id}`,
      title: 'Overdue Appointment',
      message: `${a.first_name || ''} ${a.last_name || ''} — ${a.appointment_type} at ${a.center_name || a.location || 'Unknown'} was scheduled for ${new Date(a.appointment_date).toLocaleString()}`,
      notification_type: 'warning',
      status: 'unread',
      category: 'appointment',
      created_at: a.appointment_date,
      appointment_id: a.appointment_id || a.id,
      is_overdue: true
    }));
    res.json({ notifications });
  } catch (error) {
    console.error('Get overdue appointments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get appointment statistics
const getAppointmentStatistics = async (req, res) => {
  try {
    const stats = await Appointment.getStatistics();
    res.json({ statistics: stats });
  } catch (error) {
    console.error('Get appointment statistics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Check examiner availability
const checkExaminerAvailability = async (req, res) => {
  try {
    const { examiner_id, date, time } = req.query;
    
    if (!examiner_id || !date || !time) {
      return res.status(400).json({ message: 'Examiner ID, date, and time are required' });
    }

    const appointmentDateTime = new Date(`${date}T${time}`);
    const hour = appointmentDateTime.getHours();
    
    // Check if examiner has any active appointment at the same time
    const [existing] = await pool.query(
      `SELECT appointment_id FROM appointments 
       WHERE examiner_id = ? 
       AND DATE(appointment_date) = ? 
       AND HOUR(appointment_date) = ?
       AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})
       LIMIT 1`,
      [examiner_id, date, hour, ...ACTIVE_STATUSES]
    );

    res.json({
      available: existing.length === 0,
      conflicting_appointment: existing.length > 0 ? existing[0].appointment_id : null
    });
  } catch (error) {
    console.error('Check examiner availability error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  cancelAppointment,
  completeAppointment,
  checkInAppointment,
  setWaitingAppointment,
  startAppointment,
  markLateAppointment,
  markNoShowAppointment,
  requestReschedule,
  approveReschedule,
  rejectReschedule,
  reassignExaminer,
  getUpcomingAppointments,
  getOverdueAppointments,
  getAppointmentStatistics,
  checkExaminerAvailability
};
