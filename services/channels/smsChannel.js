const BaseChannel = require('./baseChannel');

/*
 * SmsChannel - FUTURE SUPPORT ONLY.
 * SMS is intentionally NOT active yet (no SMS API provisioned).
 * This adapter exists so SMS can be enabled later WITHOUT touching the
 * notification service: implement send() and set isEnabled() to true once
 * an SMS provider (Twilio, etc.) is configured via env vars.
 */
class SmsChannel extends BaseChannel {
  get key() {
    return 'sms';
  }

  isEnabled() {
    // Disabled until an SMS provider is configured.
    return Boolean(process.env.SMS_PROVIDER && process.env.SMS_API_KEY);
  }

  async send() {
    // Placeholder - integrate Twilio/Nexmo/etc. here in the future.
    return { status: 'Skipped', error: 'SMS channel not configured' };
  }
}

module.exports = new SmsChannel();
