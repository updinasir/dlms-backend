const pool = require('../config/database');
const { analyzeDocument } = require('../utils/documentAnalyzer');

// Real document forensic analysis
const detectFakeDocument = async (req, res) => {
  try {
    const { document_id } = req.params;

    const [docRows] = await pool.query(
      'SELECT document_id, driver_id, document_type, file_path, uploaded_at FROM documents WHERE document_id = ?',
      [document_id]
    );

    if (!docRows.length) {
      return res.status(404).json({
        message: 'Document not found in system. Cannot verify authenticity of unknown documents.',
        result: null
      });
    }

    const doc = docRows[0];
    const fs = require('fs');
    const path = require('path');

    // Resolve file path
    let fullPath = doc.file_path;
    if (!fs.existsSync(fullPath)) {
      fullPath = path.join(__dirname, '..', doc.file_path);
    }
    if (!fs.existsSync(fullPath)) {
      fullPath = path.join(__dirname, '../uploads', path.basename(doc.file_path));
    }

    // Run real forensic analysis
    const analysis = await analyzeDocument(fullPath, doc.uploaded_at);

    const detectionResult = {
      document_id,
      is_fake: analysis.is_fake,
      confidence: analysis.confidence,
      risk_level: analysis.risk_level,
      analysis_details: analysis.analysis_details,
      forensic_details: analysis.forensic_results,
      deductions: analysis.deductions || [],
      reason: analysis.reason,
      analyzed_at: new Date()
    };

    await pool.query('INSERT INTO ai_detection_logs SET ?', {
      driver_id: doc.driver_id,
      detection_type: 'document_fake_check',
      result: JSON.stringify(detectionResult),
      confidence_score: analysis.confidence,
      created_at: new Date()
    });

    // Do not leak absolute file paths in API response
    res.json({
      message: analysis.is_fake ? 'Document analysis found issues' : 'Document verified successfully',
      result: detectionResult
    });
  } catch (error) {
    console.error('Detect fake document error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Calculate risk score
const calculateRiskScore = async (req, res) => {
  try {
    const { driver_id } = req.params;

    // Get driver exam results
    const [practicalExams] = await pool.query(
      'SELECT * FROM practical_exams WHERE driver_id = ? AND result = "Fail"',
      [driver_id]
    );

    const [theoryExams] = await pool.query(
      'SELECT * FROM theory_exams WHERE driver_id = ? AND result = "Fail"',
      [driver_id]
    );

    const failedExams = practicalExams.length + theoryExams.length;

    // Calculate risk score (0-100)
    let riskScore = 0;
    riskScore += failedExams * 10; // Each failed exam adds 10 points

    // Cap at 100
    riskScore = Math.min(riskScore, 100);

    const riskLevel = riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : 'high';

    res.json({
      driver_id,
      risk_score: riskScore,
      risk_level: riskLevel,
      factors: {
        failed_exams: failedExams
      },
      calculated_at: new Date()
    });
  } catch (error) {
    console.error('Calculate risk score error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Face match simulation — NOT REAL BIOMETRICS
// WARNING: This endpoint uses random number generation for demonstration purposes only.
// For production use, integrate a real face recognition API (e.g., AWS Rekognition, Azure Face API).
const faceMatch = async (req, res) => {
  try {
    const { driver_id } = req.params;

    // SIMULATION ONLY — No actual face comparison is performed.
    const isMatch = Math.random() < 0.95;
    const confidence = (Math.random() * 10 + 90).toFixed(2);

    const matchResult = {
      driver_id,
      is_match: isMatch,
      confidence: parseFloat(confidence),
      match_details: {
        facial_features: isMatch ? 'matched' : 'partially_matched',
        biometric_verification: isMatch ? 'verified' : 'verification_failed'
      },
      verified_at: new Date(),
      warning: 'This is a simulated result. No actual biometric comparison was performed.'
    };

    res.json({
      message: 'Face verification simulated (not real biometric)',
      result: matchResult
    });
  } catch (error) {
    console.error('Face match error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get AI detection logs
const getDetectionLogs = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const [logs] = await pool.query(
      'SELECT * FROM ai_detection_logs ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [parseInt(limit), parseInt(offset)]
    );

    const [total] = await pool.query('SELECT COUNT(*) as count FROM ai_detection_logs');

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total[0].count,
        pages: Math.ceil(total[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get detection logs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  detectFakeDocument,
  calculateRiskScore,
  faceMatch,
  getDetectionLogs
};
