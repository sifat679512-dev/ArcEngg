import mongoose from '../Controller/server/config/mongoose.js';

const calendarTokenSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    scope: { type: String },
    tokenType: { type: String },
    expiryDate: { type: Number },
  },
  { timestamps: true }
);

export const CalendarToken = mongoose.model('CalendarToken', calendarTokenSchema);
