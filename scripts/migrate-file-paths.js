const pool = require('../config/database');
const path = require('path');

async function migrateFilePaths() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Find all documents with absolute paths (containing ':' or starting with a drive letter/backslash)
    const [rows] = await connection.query(
      `SELECT document_id, file_path FROM documents WHERE file_path LIKE '%:\\%' OR file_path LIKE '\\\\%' OR file_path LIKE '/%'`
    );

    console.log(`Found ${rows.length} documents with absolute paths to migrate.`);

    for (const row of rows) {
      const oldPath = row.file_path;
      // Extract just the filename
      const fileName = path.basename(oldPath);
      // Determine subfolder from path if possible
      const lower = oldPath.toLowerCase();
      let subfolder = 'general';
      if (lower.includes('national-id') || lower.includes('nationalid')) subfolder = 'national-id';
      else if (lower.includes('passport')) subfolder = 'passport';
      else if (lower.includes('medical')) subfolder = 'medical-certificate';
      else if (lower.includes('photo')) subfolder = 'photo';
      else if (lower.includes('drivers')) subfolder = 'drivers';

      const newPath = path.posix.join('uploads', subfolder, fileName);

      await connection.query('UPDATE documents SET file_path = ? WHERE document_id = ?', [newPath, row.document_id]);
      console.log(`Migrated doc ${row.document_id}: ${oldPath} -> ${newPath}`);
    }

    await connection.commit();
    console.log('File path migration completed successfully.');
  } catch (error) {
    await connection.rollback();
    console.error('Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

migrateFilePaths()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
