const PDFDocument = require('pdfkit');
const fs = require('fs');

// Generate license card PDF
const generateLicenseCard = async (licenseData, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(fs.createWriteStream(outputPath));

      // Header
      doc.fontSize(20).text('DRIVING LICENSE', { align: 'center' });
      doc.moveDown();

      // License ID
      doc.fontSize(12).text(`License ID: ${licenseData.license_id}`);
      doc.text(`Name: ${licenseData.first_name} ${licenseData.last_name}`);
      doc.text(`Date of Birth: ${licenseData.date_of_birth || 'N/A'}`);
      doc.text(`Address: ${licenseData.address || 'N/A'}`);
      doc.moveDown();

      // License Details
      doc.fontSize(14).text('License Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Category: ${licenseData.category}`);
      doc.text(`Issue Date: ${licenseData.issue_date}`);
      doc.text(`Expiry Date: ${licenseData.expiry_date}`);
      doc.text(`Status: ${licenseData.status.toUpperCase()}`);
      doc.moveDown();

      // Restrictions
      if (licenseData.restrictions) {
        doc.fontSize(14).text('Restrictions', { underline: true });
        doc.fontSize(12).text(licenseData.restrictions);
        doc.moveDown();
      }

      // Footer
      doc.fontSize(10).text('This is an official document issued by DLMS11', { align: 'center' });
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });

      doc.end();
      resolve(outputPath);
    } catch (error) {
      reject(error);
    }
  });
};

// Generate payment receipt PDF
const generatePaymentReceipt = async (paymentData, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(fs.createWriteStream(outputPath));

      // Header
      doc.fontSize(20).text('PAYMENT RECEIPT', { align: 'center' });
      doc.moveDown();

      // Receipt Details
      doc.fontSize(12);
      doc.text(`Receipt Number: ${paymentData.receipt_number}`);
      doc.text(`Date: ${paymentData.payment_date}`);
      doc.moveDown();

      // Payment Details
      doc.fontSize(14).text('Payment Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Amount: $${paymentData.amount}`);
      doc.text(`Payment Type: ${paymentData.payment_type}`);
      doc.text(`Status: ${paymentData.status.toUpperCase()}`);
      doc.moveDown();

      // Payer Details
      doc.fontSize(14).text('Payer Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Name: ${paymentData.first_name} ${paymentData.last_name}`);
      doc.text(`Email: ${paymentData.email || 'N/A'}`);
      doc.moveDown();

      // Footer
      doc.fontSize(10).text('Thank you for your payment', { align: 'center' });
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });

      doc.end();
      resolve(outputPath);
    } catch (error) {
      reject(error);
    }
  });
};

// Generate driver profile PDF
const generateDriverProfile = async (driverData, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(fs.createWriteStream(outputPath));

      // Header
      doc.fontSize(20).text('DRIVER PROFILE', { align: 'center' });
      doc.moveDown();

      // Personal Information
      doc.fontSize(14).text('Personal Information', { underline: true });
      doc.fontSize(12);
      doc.text(`Name: ${driverData.first_name} ${driverData.last_name}`);
      doc.text(`License Number: ${driverData.license_number}`);
      doc.text(`Email: ${driverData.email || 'N/A'}`);
      doc.text(`Phone: ${driverData.phone || 'N/A'}`);
      doc.text(`Address: ${driverData.address || 'N/A'}`);
      doc.moveDown();

      // License Information
      doc.fontSize(14).text('License Information', { underline: true });
      doc.fontSize(12);
      doc.text(`License Type: ${driverData.license_type}`);
      doc.text(`Issue Date: ${driverData.issue_date}`);
      doc.text(`Expiry Date: ${driverData.expiry_date}`);
      doc.text(`Status: ${driverData.status.toUpperCase()}`);
      doc.moveDown();

      // Footer
      doc.fontSize(10).text('Official Driver Profile - DLMS11', { align: 'center' });
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'center' });

      doc.end();
      resolve(outputPath);
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  generateLicenseCard,
  generatePaymentReceipt,
  generateDriverProfile
};
