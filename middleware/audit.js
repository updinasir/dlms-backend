const pool = require('../config/database');
const crypto = require('crypto');

const parseUserAgent = (ua) => {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device_type: 'Unknown' };
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) || /Opera\//.test(ua) ? 'Opera' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' : 'Unknown';
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS|Macintosh/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iOS/.test(ua) ? 'iOS' : 'Unknown';
  const device_type =
    /Mobi|Android|iPhone|iPad/.test(ua) ? 'Mobile' :
    /Tablet|iPad/.test(ua) ? 'Tablet' : 'Desktop';
  return { browser, os, device_type };
};

const auditLog = async (req, res, next) => {
  const originalSend = res.send;
  const requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  req.requestId = requestId;

  res.send = function(data) {
    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
    const isFailure = res.statusCode >= 400;
    const ua = req.get('user-agent') || '';
    const parsed = parseUserAgent(ua);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip || 'unknown';
    const module = req.baseUrl?.split('/').pop() || 'unknown';
    const action = req.method;
    const description = `${action} ${req.originalUrl || req.url}`;

    if (isSuccess && req.method !== 'GET') {
      const logData = {
        user_id: req.user?.id || null,
        action_performed: action,
        module,
        description,
        table_name: module,
        record_id: req.params.id || null,
        action_time: new Date(),
        ip_address: ip,
        user_agent: ua,
        browser: parsed.browser,
        os: parsed.os,
        device_type: parsed.device_type,
        session_id: req.user?.sessionId || null,
        request_id: requestId,
        status: 'success',
        new_value: req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : null
      };

      pool.query('INSERT INTO audit_logs SET ?', logData)
        .catch(err => console.error('Audit log error:', err));
    }

    if (isFailure) {
      const logData = {
        user_id: req.user?.id || null,
        action_performed: action,
        module,
        description,
        table_name: module,
        record_id: req.params.id || null,
        action_time: new Date(),
        ip_address: ip,
        user_agent: ua,
        browser: parsed.browser,
        os: parsed.os,
        device_type: parsed.device_type,
        session_id: req.user?.sessionId || null,
        request_id: requestId,
        status: 'failed',
        error_message: typeof data === 'string' ? data : (data?.message || `HTTP ${res.statusCode}`)
      };

      pool.query('INSERT INTO audit_logs SET ?', logData)
        .catch(err => console.error('Audit log error:', err));
    }

    originalSend.call(this, data);
  };

  next();
};

module.exports = auditLog;
