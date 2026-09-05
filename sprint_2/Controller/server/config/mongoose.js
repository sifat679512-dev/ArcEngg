import mongoose from 'mongoose';

// This module ensures all models import the same mongoose instance
// as the server (avoids multiple disconnected mongoose copies).
export default mongoose;
