import mongoose from '../Controller/server/config/mongoose.js';

const projectSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    authorUsername: { type: String, required: true },
    category: { type: String, enum: ['architecture', 'engineering'], required: true },
    subcategory: { type: String, trim: true },
    tier: { type: String, enum: ['luxuries', 'regular', 'normal'], required: false },
    projectType: { type: String, trim: true },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    // Optional Google Maps pin location for the project
    location: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String, trim: true },
      placeId: { type: String, trim: true },
    },
    // Bidding deadline and optional calendar event reference
    biddingDeadline: { type: Date },
    calendarEventId: { type: String, trim: true },
    bids: [
      new mongoose.Schema(
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
          username: { type: String, required: true },
          text: { type: String, required: true, trim: true },
          accepted: { type: Boolean, default: false },
          // Chat suspension fields (apply to the accepted bid conversation)
          chatSuspended: { type: Boolean, default: false },
          chatSuspendedAt: { type: Date },
          chatSuspendedBy: { type: String, trim: true }, // 'system' | 'admin'
          chatSuspendedReason: { type: String, trim: true },
          chatViolationCount: { type: Number, default: 0 },
          chatHelpRequested: { type: Boolean, default: false },
          chatHelpReason: { type: String, trim: true },
          // Kanban workflow fields
          kanbanStatus: { type: String, enum: ['TODO', 'IN_PROCESS', 'DONE'], default: undefined },
          clientAcceptedAt: { type: Date },
          providerAcceptedAt: { type: Date },
          expectedDeadline: { type: Date },
          doneAt: { type: Date },
          uploads: [{ type: String, trim: true }],
          // Payment gating before moving to TODO
          pendingPayment: { type: Boolean, default: false },
          pendingPaymentSubmitted: { type: Boolean, default: false },
        },
        { _id: true, timestamps: { createdAt: true, updatedAt: false } }
      ),
    ],
    // Provider collaboration
    collabInvites: [
      new mongoose.Schema(
        {
          toUsername: { type: String, required: true },
          status: { type: String, enum: ['pending','accepted','rejected'], default: 'pending' },
        },
        { _id: true, timestamps: { createdAt: true, updatedAt: false } }
      )
    ],
    collabMembers: [
      new mongoose.Schema(
        {
          username: { type: String, required: true },
          status: { type: String, enum: ['invited','accepted'], default: 'invited' },
          kanbanStatus: { type: String, enum: ['TODO', 'IN_PROCESS', 'DONE'], default: 'TODO' },
        },
        { _id: true, timestamps: { createdAt: true, updatedAt: false } }
      )
    ],
  },
  { timestamps: true }
);

export const Project = mongoose.model('Project', projectSchema);
