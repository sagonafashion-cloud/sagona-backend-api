import mongoose from 'mongoose';

// A Promoter is an independent person who promotes Sagona and earns commission.
// Sensitive fields (PAN, GSTIN, bank account) are stored AES-256-GCM encrypted
// (select:false), with only the last 4 characters kept in the clear for display
// and a keyed hash (blind index) for duplicate detection.
const promoterSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true, maxlength: 120 },
  mobile: { type: String, required: true, unique: true, trim: true },
  email:  { type: String, trim: true, lowercase: true },
  address: {
    line1: String, line2: String, city: String, pincode: String
  },
  stateCode: { type: String, trim: true },       // GST state code, e.g. "05"
  dob:       { type: Date },

  panEnc:     { type: String, select: false },
  panLast4:   { type: String },
  panHash:    { type: String, select: false },

  gstRegistered: { type: Boolean, default: false },
  gstinEnc:      { type: String, select: false },
  gstinLast4:    { type: String },

  bankAccountEnc: { type: String, select: false },
  bankLast4:      { type: String },
  bankHash:       { type: String, select: false },
  bankIfsc:       { type: String, uppercase: true, trim: true },
  bankHolderName: { type: String, trim: true },

  socialHandles: [{ _id: false, platform: String, handle: String }],
  audienceSize:  { type: Number, min: 0 },
  notes:         { type: String, maxlength: 2000 },

  status:    { type: String, enum: ['pending', 'active', 'suspended', 'terminated'], default: 'pending' },
  kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  kycNotes:  { type: String, maxlength: 1000 },

  agreementStatus:   { type: String, enum: ['not_sent', 'sent', 'signed', 'expired'], default: 'not_sent' },
  agreementVersion:  { type: String },
  agreementSignedAt: { type: Date },
  agreementAcceptance: { method: String, recordedBy: String, ip: String, userAgent: String },
  agreementFileRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'PromoterDocument' },

  tdsApplicable:              { type: Boolean, default: false },
  gstOnCommissionApplicable:  { type: Boolean, default: false },

  strikes: [{ _id: false, reason: String, at: { type: Date, default: Date.now }, by: String }],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
}, { timestamps: true });

promoterSchema.index({ panHash: 1 }, { unique: true, sparse: true });
promoterSchema.index({ bankHash: 1 }, { unique: true, sparse: true });
promoterSchema.index({ status: 1, kycStatus: 1 });
promoterSchema.index({ name: 'text', email: 'text' });

export default mongoose.models.Promoter || mongoose.model('Promoter', promoterSchema);
