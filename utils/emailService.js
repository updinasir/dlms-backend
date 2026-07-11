const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Send email
const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, name) => {
  const subject = 'Welcome to DLMS11 - Driving License Management System';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to DLMS11!</h2>
      <p>Dear ${name},</p>
      <p>Welcome to the Driving License Management System. Your account has been successfully created.</p>
      <p>You can now log in to your account and access all the features of our system.</p>
      <p>If you have any questions, please don't hesitate to contact us.</p>
      <p>Best regards,<br>DLMS11 Team</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

// Send license expiry notification
const sendLicenseExpiryNotification = async (email, name, expiryDate) => {
  const subject = 'License Expiry Reminder - DLMS11';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #FF6B6B;">License Expiry Reminder</h2>
      <p>Dear ${name},</p>
      <p>This is a reminder that your driving license will expire on <strong>${expiryDate}</strong>.</p>
      <p>Please renew your license before the expiry date to avoid any inconvenience.</p>
      <p>Log in to your account to initiate the renewal process.</p>
      <p>Best regards,<br>DLMS11 Team</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

// Send appointment confirmation
const sendAppointmentConfirmation = async (email, name, appointmentType, appointmentDate) => {
  const subject = 'Appointment Confirmation - DLMS11';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10B981;">Appointment Confirmed</h2>
      <p>Dear ${name},</p>
      <p>Your appointment has been successfully scheduled.</p>
      <p><strong>Appointment Type:</strong> ${appointmentType}</p>
      <p><strong>Date & Time:</strong> ${appointmentDate}</p>
      <p>Please arrive 15 minutes before your scheduled time.</p>
      <p>Best regards,<br>DLMS11 Team</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

// Send payment receipt
const sendPaymentReceipt = async (email, name, amount, receiptNumber) => {
  const subject = 'Payment Receipt - DLMS11';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10B981;">Payment Received</h2>
      <p>Dear ${name},</p>
      <p>Your payment has been successfully processed.</p>
      <p><strong>Amount:</strong> $${amount}</p>
      <p><strong>Receipt Number:</strong> ${receiptNumber}</p>
      <p>Thank you for your payment.</p>
      <p>Best regards,<br>DLMS11 Team</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

// Send password reset email
const sendPasswordResetEmail = async (email, name, resetToken, frontendUrl) => {
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
  const subject = 'Password Reset Request - DLMS11';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">Password Reset Request</h2>
      <p>Dear ${name || 'User'},</p>
      <p>We received a request to reset your password for your DLMS11 account.</p>
      <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">Reset Password</a>
      </div>
      <p>If you did not request a password reset, please ignore this email or contact your administrator.</p>
      <p style="color: #6b7280; font-size: 12px;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="color: #6b7280; font-size: 12px; word-break: break-all;">${resetLink}</p>
      <p>Best regards,<br>DLMS11 Team</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

// Send temporary password email for newly created portal accounts
const sendTemporaryPasswordEmail = async (email, name, tempPassword, loginUrl) => {
  const subject = 'Your DLMS11 Driver Portal Account';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10B981;">Driver Portal Account Created</h2>
      <p>Dear ${name || 'Driver'},</p>
      <p>Your driver portal account has been created. Use the login information below to access the portal for the first time.</p>
      <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p><strong>Username:</strong> ${email}</p>
      <p><strong>Password:</strong> <span style="font-family: monospace; background: #f3f4f6; padding: 4px 8px; border-radius: 4px;">${tempPassword}</span></p>
      <p>For security, you will be required to change this password the first time you log in.</p>
      <p>Best regards,<br>DLMS11 Team</p>
    </div>
  `;
  return sendEmail(email, subject, html);
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendLicenseExpiryNotification,
  sendAppointmentConfirmation,
  sendPaymentReceipt,
  sendPasswordResetEmail,
  sendTemporaryPasswordEmail
};
