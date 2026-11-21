require('dotenv').config(); // reads DATABASE_URL and PORT from .env
const express = require('express');
const requestLogger = require('./src/logger');
const { notFound, errorHandler } = require('./src/errors');

const app = express();

app.use(express.json()); // lets us read JSON sent by the user
app.use(requestLogger); // saves every request in logs/access.log

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/patients', require('./src/routes/patients'));
app.use('/api/doctors', require('./src/routes/doctors'));
app.use('/api/appointments', require('./src/routes/appointments'));

app.use(notFound); // no route matched
app.use(errorHandler); // an error happened (must be last)

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('MediOS running on http://localhost:' + port));
