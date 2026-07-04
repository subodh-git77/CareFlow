require('dotenv').config();

// Local JSON mode keeps beginner setup zero-install. Production still uses real MongoDB.
if (process.env.USE_LOCAL_JSON_DB === 'true') {
  const mongoosePath = require.resolve('mongoose');
  require.cache[mongoosePath] = {
    id: mongoosePath,
    filename: mongoosePath,
    loaded: true,
    exports: require('./utils/mockMongoose')
  };
}
const mongoose = require('mongoose');
const app = require('./app');
const { initCronJobs, stopCronJobs } = require('./services/cronService');

const port = Number(process.env.PORT || 5000);
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/careflow';
let server;

const start = async () => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log('[Database] MongoDB connected');
  initCronJobs();
  server = app.listen(port, () => console.log(`[Server] CareFlow API running at http://localhost:${port}`));
};

const shutdown = async signal => {
  console.log(`[Server] ${signal} received, shutting down cleanly`);
  stopCronJobs();
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
start().catch(error => {
  console.error(`[Startup] ${error.message}`);
  process.exit(1);
});