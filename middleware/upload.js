const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Map document_type to safe subfolders
function resolveSubfolder(req) {
  const raw = (req.body.document_type || '').toString();
  const map = {
    'National ID': 'national-id',
    'Passport': 'passport',
    'Medical Certificate': 'medical-certificate',
    'Photo': 'photo'
  };
  if (map[raw]) return map[raw];
  const byType = (req.body.type || '').toString().toLowerCase();
  if (['drivers', 'general'].includes(byType)) return byType;
  if (byType === 'profile') return 'profiles';
  return 'general';
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subfolder = resolveSubfolder(req);
    const folderPath = path.join(uploadDir, subfolder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter with stricter checks (extension + mime must both be allowed)
const fileFilter = (req, file, cb) => {
  const allowedExts = new Set(['.jpeg', '.jpg', '.png', '.gif', '.pdf', '.doc', '.docx']);
  const allowedMimes = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]);

  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!allowedExts.has(ext) || !allowedMimes.has(mime)) {
    return cb(new Error('Only JPEG/PNG/GIF images and PDF/DOC/DOCX documents are allowed'));
  }

  return cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 // 5MB
  },
  fileFilter: fileFilter
});

// Basic magic number checker for images/PDF
function verifyMagicNumber(filePath) {
  try {
    const ext = path.extname(filePath || '').toLowerCase();
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(12);
    fs.readSync(fd, header, 0, 12, 0);
    fs.closeSync(fd);
    const hex = header.toString('hex');

    // Images
    if (ext === '.jpg' || ext === '.jpeg') return hex.startsWith('ffd8ff'); // JPEG
    if (ext === '.png') return hex.startsWith('89504e470d0a1a0a'); // PNG
    if (ext === '.gif') return hex.startsWith('47494638'); // GIF

    // PDF
    if (ext === '.pdf') return hex.startsWith('25504446'); // %PDF

    // Legacy MS Word (.doc) OLE header
    if (ext === '.doc') return hex.startsWith('d0cf11e0a1b11ae1');

    // Modern Word (.docx) is a ZIP; check for PK header
    if (ext === '.docx') return hex.startsWith('504b0304'); // PK\x03\x04

    // Unknown extension (reject)
    return false;
  } catch {
    return false;
  }
}

module.exports = { upload, verifyMagicNumber, resolveSubfolder };
