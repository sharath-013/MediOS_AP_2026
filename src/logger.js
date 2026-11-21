// Saves one line per request in logs/access.log
const fs = require('fs');
const path = require('path');

const folder = path.join(__dirname, '..', 'logs');
const file = path.join(folder, 'access.log');

function requestLogger(req, res, next) {
  const start = Date.now();

  // "finish" happens after the response is sent, so we know the status code
  res.on('finish', () => {
    const time = Date.now() - start;
    const line = new Date().toISOString() + ' ' + req.method + ' ' + req.originalUrl + ' ' + res.statusCode + ' ' + time + 'ms\n';

    fs.mkdir(folder, { recursive: true }, () => {
      fs.appendFile(file, line, () => {});
    });
  });

  next();
}

module.exports = requestLogger;
