// The connection to the database, shared by all files
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
