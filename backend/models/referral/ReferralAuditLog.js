import mongoose from 'mongoose';
import { makeAppendOnly } from './appendOnly.js';

const referralAuditLogSchema = new mongoose.Schema({
  actorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  actorName: String,
  role:      String,
  action:    { type: String, required: true },     // e.g. promoter.create, code.pause, sensitive.reveal
  entity:    { type: String },                      // Promoter, ReferralCode, CommissionRate, Setting, Document
  entityId:  { type: String },
  before:    { type: mongoose.Schema.Types.Mixed },
  after:     { type: mongoose.Schema.Types.Mixed },
  reason:    { type: String },
  ip:        String,
  userAgent: String
}, { timestamps: { createdAt: true, updatedAt: false } });

referralAuditLogSchema.index({ createdAt: -1 });
referralAuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
referralAuditLogSchema.index({ action: 1, createdAt: -1 });
makeAppendOnly(referralAuditLogSchema, 'ReferralAuditLog');

export default mongoose.models.ReferralAuditLog || mongoose.model('ReferralAuditLog', referralAuditLogSchema);
