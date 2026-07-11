/*
 * BaseChannel - abstract contract every delivery channel must implement.
 * New channels (SMS, Push, WhatsApp) only need to extend this class and
 * register themselves in the channel registry. No existing logic changes.
 */
class BaseChannel {
  /** Unique key, e.g. 'system', 'email', 'sms'. */
  get key() {
    throw new Error('Channel must define a key');
  }

  /** Whether the channel is currently enabled/available. */
  isEnabled() {
    return true;
  }

  /**
   * Deliver a notification through this channel.
   * @param {object} payload - { recipient, notification }
   * @returns {Promise<{ status: 'Sent'|'Failed'|'Skipped', error?: string, meta?: object }>}
   */
  async send() {
    throw new Error('Channel must implement send()');
  }
}

module.exports = BaseChannel;
