// Logger utility for DLMS11

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'app.log');

const log = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta
  };

  const logString = JSON.stringify(logEntry) + '\n';

  // Console log with colors
  const colors = {
    info: '\x1b[36m', // Cyan
    success: '\x1b[32m', // Green
    warning: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
    reset: '\x1b[0m'
  };

  const color = colors[level] || colors.reset;
  console.log(`${color}[${level.toUpperCase()}]${colors.reset} ${message}`);

  // Write to file
  fs.appendFile(logFile, logString, (err) => {
    if (err) console.error('Error writing to log file:', err);
  });
};

const info = (message, meta) => log('info', message, meta);
const success = (message, meta) => log('success', message, meta);
const warning = (message, meta) => log('warning', message, meta);
const error = (message, meta) => log('error', message, meta);

module.exports = {
  info,
  success,
  warning,
  error
};
