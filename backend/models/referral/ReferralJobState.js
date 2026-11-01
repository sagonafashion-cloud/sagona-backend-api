import mongoose from 'mongoose';

// Tiny lease lock so two instances (or a restart overlap) never run the same job at once.
const schema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  lockedUntil: { type: Date },
  lastRunAt: { type: Date },
  lastResult: { type: mongoose.Schema.Types.Mixed }
});

export default mongoose.models.ReferralJobState || mongoose.model('ReferralJobState', schema);
