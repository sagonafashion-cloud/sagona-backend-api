import mongoose from 'mongoose';

const splitColSchema = new mongoose.Schema({
  url:     String,
  type:    { type: String, enum: ['image', 'video'], default: 'image' },
  poster:  String,
  publicId: String,
  text:    String,
  label:   String,
  cta:     String,
  ctaLink: String
}, { _id: false });

const homepageSectionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['hero', 'editorial', 'feature', 'split', 'strip', 'products'],
    required: true
  },
  title:    String,
  label:    String,
  subtitle: String,
  cta:      String,
  ctaLink:  String,
  textPosition: {
    type: String,
    enum: ['bottom-left', 'center', 'bottom-right', 'top-left'],
    default: 'bottom-left'
  },
  textColor: { type: String, enum: ['light', 'dark'], default: 'light' },
  overlay:   { type: String, enum: ['default', 'dark', 'light', 'none'], default: 'default' },

  // hero / editorial / feature
  mediaType:    { type: String, enum: ['image', 'video'], default: 'image' },
  mediaUrl:     String,
  posterUrl:    String,
  mediaPublicId: String,

  // strip
  text:           String,
  bgColor:        { type: String, default: '#0A0A0A' },
  textColorStrip: { type: String, default: '#fff' },

  // split
  leftMedia:  splitColSchema,
  rightMedia: splitColSchema,

  // products
  category:    String,
  featured:    { type: Boolean, default: false },
  limit:       { type: Number, default: 8 },
  viewAllLink: String,

  order:    { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('HomepageSection', homepageSectionSchema);
