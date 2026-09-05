import mongoose from 'mongoose';

export async function connectDB(uri) {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
      dbName: 'sprint_1',
      serverSelectionTimeoutMS: 10000,
    });
    // Verify connectivity with a ping
    try {
      await mongoose.connection.db.admin().command({ ping: 1 });
      console.log('MongoDB connected and ping successful');
    } catch (pingErr) {
      console.error('MongoDB connected but ping failed:', pingErr.message);
    }
    // Log connection errors after initial connect
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB runtime error:', err.message);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}
