const BaseChannel = require('./baseChannel');
const pool = require('../../config/database');
const { sendEmail } = require('../../utils/emailService');

/*
 * EmailChannel - sends notifications via SMTP (nodemailer) and records
 * every attempt in the email_logs table so delivery can be audited and retried.
 */
const wrapHtml = (notification, recipient) => {
  const colorMap = {
    Information: '#2563eb',
    Success: '#10b981',
    Warning: '#f59e0b',
    Error: '#ef4444'
  };
  const accent = colorMap[notification.category] || '#2563eb';
  const name = recipient.name || 'User';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
      <div style="background:${accent}; padding:16px 24px;">
        <h2 style="color:#fff; margin:0; font-size:18px;">DLMS11</h2>
      </div>
      <div style="padding:24px;">
        <h3 style="color:#111827; margin-top:0;">${notification.title}</h3>
        <p style="color:#374151; line-height:1.6;">Dear ${name},</p>
        <p style="color:#374151; line-height:1.6; white-space:pre-wrap;">${notification.message}</p>
        <p style="color:#6b7280; font-size:12px; margin-top:24px;">Priority: ${notification.priority} &middot; Type: ${notification.category}</p>
        <p style="color:#6b7280; font-size:12px;">Best regards,<br/>DLMS11 Team</p>
      </div>
    </div>
  `;
};

class EmailChannel extends BaseChannel {
  get key() {
    return 'email';
  }

  isEnabled() {
    return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER);
  }

  async send({ recipient, notification }) {
    const email = recipient.email;
    const subject = notification.email_subject || notification.title;
    const html = notification.email_body
      ? wrapHtml({ ...notification, message: notification.email_body }, recipient)
      : wrapHtml(notification, recipient);

    // Pre-log as pending
    const [logResult] = await pool.query(
      `INSERT INTO email_logs (notification_id, recipient_email, subject, body, status, attempts, created_at)
       VALUES (?, ?, ?, ?, 'Pending', 1, NOW())`,
      [notification.notification_id || null, email, subject, html]
    );
    const logId = logResult.insertId;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      await pool.query(
        `UPDATE email_logs SET status = 'Failed', error_message = ? WHERE email_log_id = ?`,
        ['Invalid or missing email address', logId]
      );
      return { status: 'Failed', error: 'Invalid or missing email address', meta: { logId } };
    }

    try {
      await sendEmail(email, subject, html);
      await pool.query(
        `UPDATE email_logs SET status = 'Sent', sent_at = NOW() WHERE email_log_id = ?`,
        [logId]
      );
      return { status: 'Sent', meta: { logId } };
    } catch (err) {
      await pool.query(
        `UPDATE email_logs SET status = 'Failed', error_message = ? WHERE email_log_id = ?`,
        [String(err.message || err).slice(0, 500), logId]
      );
      return { status: 'Failed', error: err.message, meta: { logId } };
    }
  }
}

module.exports = new EmailChannel();
