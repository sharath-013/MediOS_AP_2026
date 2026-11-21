// Stop a request with an error message, e.g. fail(404, 'Patient not found')
function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

// Runs when no route matches the URL
function notFound(req, res) {
  res.status(404).json({ error: 'Route not found: ' + req.method + ' ' + req.originalUrl });
}

// Runs when any error happens in a route
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message;

  // Prisma database error codes
  if (err.code === 'P2002') {
    status = 409;
    message = 'Duplicate value (already exists)';
  } else if (err.code === 'P2003') {
    status = 409;
    message = 'Related record missing, or record is still in use';
  } else if (err.code === 'P2025') {
    status = 404;
    message = 'Record not found';
  }

  if (status === 500) console.log(err);
  res.status(status).json({ error: message });
}

module.exports = { fail, notFound, errorHandler };
