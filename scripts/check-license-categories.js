const pool = require('../config/database');

(async () => {
  try {
    // Get table structure
    const [columns] = await pool.query('DESCRIBE license_categories');
    console.log('=== license_categories Table Structure ===');
    columns.forEach(c => console.log(`${c.Field} - ${c.Type} - ${c.Null} - ${c.Key}`));
    
    // Get existing categories
    const [data] = await pool.query('SELECT * FROM license_categories ORDER BY category_code');
    console.log('\n=== Existing Categories ===');
    if (data.length === 0) {
      console.log('No categories found. You need to add some.');
    } else {
      data.forEach(c => {
        console.log(`ID: ${c.category_id} | Code: ${c.category_code} | Name: ${c.category_name} | Description: ${c.description || 'N/A'}`);
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
