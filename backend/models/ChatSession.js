import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const chatSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  messages:  [messageSchema]
}, { timestamps: true });

// Auto-expire sessions after 7 days of inactivity
chatSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export default mongoose.model('ChatSession', chatSessionSchema);
