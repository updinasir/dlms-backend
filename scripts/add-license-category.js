const pool = require('../config/database');

(async () => {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: node add-license-category.js <code> <name> <description>');
    console.log('Example: node add-license-category.js G "Taxi" "Taxi License"');
    process.exit(1);
  }
  
  const [code, name, description] = args;
  
  try {
    const [result] = await pool.query(
      'INSERT INTO license_categories (category_code, category_name, description) VALUES (?, ?, ?)',
      [code, name, description]
    );
    
    console.log(`✓ License category added successfully!`);
    console.log(`  ID: ${result.insertId}`);
    console.log(`  Code: ${code}`);
    console.log(`  Name: ${name}`);
    console.log(`  Description: ${description}`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error adding category:', err.message);
    process.exit(1);
  }
})();
