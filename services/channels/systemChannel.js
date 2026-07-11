const BaseChannel = require('./baseChannel');

/*
 * SystemChannel - in-app notifications.
 * The notification row itself is the delivery, so this channel simply
 * confirms success. The DB write is handled by the notification service.
 */
class SystemChannel extends BaseChannel {
  get key() {
    return 'system';
  }

  async send() {
    return { status: 'Sent' };
  }
}

module.exports = new SystemChannel();
