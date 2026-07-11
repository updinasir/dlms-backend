const Service = require('../models/Service');
const pool = require('../config/database');
const notificationService = require('../services/notificationService');

// Get all services
const getAllServices = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const filters = { status, search, limit, offset };
    const services = await Service.findAll(filters);
    
    const total = await Service.findAll({ status, search });
    
    res.json({
      services,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total.length,
        pages: Math.ceil(total.length / limit)
      }
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get active services (for payment form dropdown)
const getActiveServices = async (req, res) => {
  try {
    const services = await Service.getActiveServices();
    res.json({ services });
  } catch (error) {
    console.error('Get active services error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get service by ID
const getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json({ service });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create service (Super Admin only)
const createService = async (req, res) => {
  try {
    const { service_code, service_name, description, official_price, currency, effective_date, reason } = req.body;

    // Check if service code already exists
    const existingService = await Service.findByCode(service_code);
    if (existingService) {
      return res.status(400).json({ message: 'Service code already exists' });
    }

    const serviceData = {
      service_code,
      service_name,
      description,
      official_price,
      currency: currency || 'USD',
      status: 'Active',
      effective_date: effective_date || new Date().toISOString().split('T')[0],
      created_by: req.user.id
    };

    const service = await Service.create(serviceData);

    // Log activity
    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'CREATE',
        table_name: 'services',
        record_id: service.service_id,
        action_time: new Date(),
        description: `Created new service: ${service_name} with price $${official_price}`
      });
    } catch (auditError) {
      console.warn('Service audit log skipped:', auditError.message);
    }

    // Notification
    notificationService.safeNotify('admin.service_created', {
      data: { serviceName: service_name, price: `$${official_price}`, recordId: service.service_id, link: `/dashboard/services` },
      target: { roles: ['super_admin', 'admin'] },
      triggeredBy: req.user?.id || null
    });

    res.status(201).json({
      message: 'Service created successfully',
      service
    });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update service (Super Admin only)
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { service_name, description, official_price, currency, status, effective_date, reason } = req.body;

    const existingService = await Service.findById(id);
    if (!existingService) {
      return res.status(404).json({ message: 'Service not found' });
    }

    // If price is changing, record in history
    if (official_price && official_price !== existingService.official_price) {
      await Service.recordPriceChange({
        service_id: id,
        old_price: existingService.official_price,
        new_price: official_price,
        reason: reason || 'Price update',
        changed_by: req.user.id,
        effective_date: effective_date || new Date().toISOString().split('T')[0],
        ip_address: req.ip
      });
    }

    const serviceData = {
      service_name,
      description,
      official_price,
      currency,
      status,
      effective_date,
      updated_by: req.user.id
    };

    const service = await Service.update(id, serviceData);

    // Log activity
    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'UPDATE',
        table_name: 'services',
        record_id: id,
        action_time: new Date(),
        description: `Updated service: ${service_name}`
      });
    } catch (auditError) {
      console.warn('Service audit log skipped:', auditError.message);
    }

    // Notification for price changes
    if (official_price && official_price !== existingService.official_price) {
      notificationService.safeNotify('admin.service_price_changed', {
        data: { serviceName: service_name, oldPrice: `$${existingService.official_price}`, newPrice: `$${official_price}`, recordId: id, link: `/dashboard/services` },
        target: { roles: ['super_admin', 'admin'] },
        triggeredBy: req.user?.id || null
      });
    }

    res.json({
      message: 'Service updated successfully',
      service
    });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete service (soft delete - Super Admin only)
const deleteService = async (req, res) => {
  try {
    const service = await Service.delete(req.params.id);

    // Log activity
    try {
      await pool.query('INSERT INTO audit_logs SET ?', {
        user_id: req.user.id,
        action_performed: 'DELETE',
        table_name: 'services',
        record_id: req.params.id,
        action_time: new Date(),
        description: `Deactivated service: ${service.service_name}`
      });
    } catch (auditError) {
      console.warn('Service audit log skipped:', auditError.message);
    }

    res.json({ message: 'Service deactivated successfully' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get service price history
const getServicePriceHistory = async (req, res) => {
  try {
    const history = await Service.getPriceHistory(req.params.id);
    res.json({ history });
  } catch (error) {
    console.error('Get service price history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get service statistics
const getServiceStatistics = async (req, res) => {
  try {
    const stats = await Service.getStatistics();
    res.json({ statistics: stats });
  } catch (error) {
    console.error('Get service statistics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllServices,
  getActiveServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getServicePriceHistory,
  getServiceStatistics
};
