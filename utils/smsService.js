// SMS Service Simulation
// In production, this would integrate with a real SMS service like Twilio, Nexmo, etc.

const sendSMS = async (phoneNumber, message) => {
  try {
    // Simulate SMS sending
    console.log(`[SMS Simulation] To: ${phoneNumber}`);
    console.log(`[SMS Simulation] Message: ${message}`);
    
    // In production, you would use a real SMS service:
    // const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    // await client.messages.create({
    //   body: message,
    //   from: process.env.TWILIO_PHONE,
    //   to: phoneNumber
    // });
    
    return { success: true, message: 'SMS sent successfully' };
  } catch (error) {
    console.error('SMS error:', error);
    throw error;
  }
};

const sendAppointmentReminder = async (phoneNumber, name, appointmentDate) => {
  const message = `Dear ${name}, this is a reminder for your appointment on ${appointmentDate}. Please arrive 15 minutes early. - DLMS11`;
  return sendSMS(phoneNumber, message);
};

const sendLicenseExpiryReminder = async (phoneNumber, name, expiryDate) => {
  const message = `Dear ${name}, your driving license expires on ${expiryDate}. Please renew it before the expiry date. - DLMS11`;
  return sendSMS(phoneNumber, message);
};

const sendPaymentConfirmation = async (phoneNumber, name, amount) => {
  const message = `Dear ${name}, your payment of $${amount} has been received successfully. - DLMS11`;
  return sendSMS(phoneNumber, message);
};

module.exports = {
  sendSMS,
  sendAppointmentReminder,
  sendLicenseExpiryReminder,
  sendPaymentConfirmation
};
