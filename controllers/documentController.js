const Document = require('../models/Document');
const pool = require('../config/database');
const { verifyMagicNumber, resolveSubfolder } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// Get all documents
const getAllDocuments = async (req, res) => {
  try {
    const { type, driver_id, search, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const filters = { type, driver_id, search, limit, offset };
    const documents = await Document.findAll(filters);
    const total = await Document.count(filters);

    res.json({
      documents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get document by ID
const getDocumentById = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({ document });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Upload document
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Disallow filenames with multiple dots indicating possible double-extension attacks
    const original = req.file.originalname || '';
    if (original.split('.').length > 2) {
      return res.status(400).json({ message: 'Invalid filename (multiple extensions not allowed)' });
    }

    // Validate document_type against allowed enum
    const allowedTypes = new Set(['National ID', 'Passport', 'Medical Certificate', 'Photo']);
    const docType = req.body.document_type;
    if (!allowedTypes.has(docType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }

    // Verify driver exists and is not deleted
    if (req.body.driver_id) {
      const [driverCheck] = await pool.query(
        'SELECT driver_id FROM drivers WHERE driver_id = ? LIMIT 1',
        [req.body.driver_id]
      );
      if (driverCheck.length === 0) {
        return res.status(404).json({ message: 'Driver not found or has been deleted' });
      }
    }

    // Verify magic number strictly aligns with extension and MIME
    const ok = verifyMagicNumber(req.file.path);
    if (!ok) {
      return res.status(400).json({ message: 'Invalid or corrupted file.' });
    }

    // Store relative path: /uploads/<subfolder>/<filename>
    const sub = resolveSubfolder({ body: { document_type: docType } });
    const relPath = path.posix.join('uploads', sub, path.basename(req.file.path));

    const documentData = {
      driver_id: req.body.driver_id,
      document_type: docType,
      file_path: relPath,
      uploaded_at: new Date()
    };

    const document = await Document.create(documentData);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update document
const updateDocument = async (req, res) => {
  try {
    const document = await Document.update(req.params.id, req.body);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({
      message: 'Document updated successfully',
      document
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    await Document.delete(req.params.id);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get driver documents
const getDriverDocuments = async (req, res) => {
  try {
    const documents = await Document.findByDriverId(req.params.driverId);
    res.json({ documents });
  } catch (error) {
    console.error('Get driver documents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Securely download a document file (authenticated)
const downloadDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Authorization: admin/staff can access any; drivers can only access their own documents
    const isAdminOrStaff = req.user?.role === 1 || req.user?.role === 2;
    if (!isAdminOrStaff) {
      // Check if current user maps to the doc's driver_id via email
      const [rows] = await pool.query('SELECT driver_id FROM drivers WHERE email = ? LIMIT 1', [req.user?.email]);
      const myDriverId = rows?.[0]?.driver_id;
      if (!myDriverId || String(myDriverId) !== String(doc.driver_id)) {
        return res.status(403).json({ message: 'You are not authorized to download this document' });
      }
    }

    // Resolve relative path to absolute safely
    let filePath = doc.file_path;
    if (!filePath) {
      return res.status(404).json({ message: 'File path missing' });
    }
    if (path.isAbsolute(filePath)) {
      // migrate absolute on-the-fly for old records
      filePath = path.posix.join('uploads', path.basename(filePath));
    }
    const absolutePath = path.join(__dirname, '..', filePath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    const fileName = path.basename(absolutePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const stream = fs.createReadStream(absolutePath);
    stream.on('error', (err) => {
      console.error('File stream error:', err);
      res.status(500).json({ message: 'Error reading file' });
    });
    stream.pipe(res);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllDocuments,
  getDocumentById,
  uploadDocument,
  updateDocument,
  deleteDocument,
  getDriverDocuments,
  downloadDocument
};
