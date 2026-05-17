/**
 * Pincode seeder — run once to populate PincodeMap collection.
 *
 * Usage:
 *   node backend/scripts/seedPincodes.js
 *
 * Data source: https://api.postalpincode.in (free, no key required)
 * For bulk seeding, download the India pincode CSV from:
 *   https://data.gov.in/resource/all-india-pincode-directory
 * and place it as backend/scripts/pincodes.csv, then uncomment the CSV path below.
 */

import dotenv from 'dotenv';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import PincodeMap from '../models/PincodeMap.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

// ── Sample seed data (top 50 Indian cities) ───────────────────────────────────
// Replace with your full CSV import for production.
const SAMPLE_PINCODES = [
  { pincode: '110001', city: 'New Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { pincode: '110002', city: 'New Delhi', state: 'Delhi', lat: 28.6425, lng: 77.2191 },
  { pincode: '400001', city: 'Mumbai', state: 'Maharashtra', lat: 18.9388, lng: 72.8354 },
  { pincode: '400051', city: 'Mumbai', state: 'Maharashtra', lat: 19.0596, lng: 72.8295 },
  { pincode: '560001', city: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  { pincode: '600001', city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707 },
  { pincode: '700001', city: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639 },
  { pincode: '500001', city: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867 },
  { pincode: '411001', city: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567 },
  { pincode: '302001', city: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873 },
  { pincode: '380001', city: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714 },
  { pincode: '226001', city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462 },
  { pincode: '160001', city: 'Chandigarh', state: 'Punjab', lat: 30.7333, lng: 76.7794 },
  { pincode: '248001', city: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322 },
  { pincode: '452001', city: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577 },
  { pincode: '462001', city: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126 },
  { pincode: '440001', city: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882 },
  { pincode: '395001', city: 'Surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311 },
  { pincode: '208001', city: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lng: 80.3319 },
  { pincode: '800001', city: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376 },
  { pincode: '682001', city: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673 },
  { pincode: '695001', city: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366 },
  { pincode: '751001', city: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lng: 85.8245 },
  { pincode: '781001', city: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362 },
  { pincode: '831001', city: 'Jamshedpur', state: 'Jharkhand', lat: 22.8046, lng: 86.2029 },
  { pincode: '492001', city: 'Raipur', state: 'Chhattisgarh', lat: 21.2514, lng: 81.6296 },
  { pincode: '834001', city: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lng: 85.3096 },
  { pincode: '201301', city: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.3910 },
  { pincode: '122001', city: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0266 },
  { pincode: '121001', city: 'Faridabad', state: 'Haryana', lat: 28.4089, lng: 77.3178 },
  { pincode: '313001', city: 'Udaipur', state: 'Rajasthan', lat: 24.5854, lng: 73.7125 },
  { pincode: '342001', city: 'Jodhpur', state: 'Rajasthan', lat: 26.2389, lng: 73.0243 },
  { pincode: '361001', city: 'Jamnagar', state: 'Gujarat', lat: 22.4707, lng: 70.0577 },
  { pincode: '190001', city: 'Srinagar', state: 'Jammu & Kashmir', lat: 34.0837, lng: 74.7973 },
  { pincode: '180001', city: 'Jammu', state: 'Jammu & Kashmir', lat: 32.7266, lng: 74.8570 },
  { pincode: '570001', city: 'Mysuru', state: 'Karnataka', lat: 12.2958, lng: 76.6394 },
  { pincode: '530001', city: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185 },
  { pincode: '520001', city: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.5062, lng: 80.6480 },
  { pincode: '641001', city: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558 },
  { pincode: '625001', city: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198 },
  { pincode: '282001', city: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081 },
  { pincode: '221001', city: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739 },
  { pincode: '211001', city: 'Allahabad', state: 'Uttar Pradesh', lat: 25.4358, lng: 81.8463 },
  { pincode: '144001', city: 'Jalandhar', state: 'Punjab', lat: 31.3260, lng: 75.5762 },
  { pincode: '141001', city: 'Ludhiana', state: 'Punjab', lat: 30.9010, lng: 75.8573 },
  { pincode: '132001', city: 'Karnal', state: 'Haryana', lat: 29.6857, lng: 76.9905 },
  { pincode: '500003', city: 'Secunderabad', state: 'Telangana', lat: 17.4399, lng: 78.4983 },
  { pincode: '403001', city: 'Panaji', state: 'Goa', lat: 15.4909, lng: 73.8278 },
  { pincode: '110075', city: 'Dwarka', state: 'Delhi', lat: 28.5921, lng: 77.0460 },
  { pincode: '110092', city: 'Shahdara', state: 'Delhi', lat: 28.6726, lng: 77.2994 },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  const ops = SAMPLE_PINCODES.map((p) => ({
    updateOne: {
      filter: { pincode: p.pincode },
      update: { $set: p },
      upsert: true
    }
  }));

  const result = await PincodeMap.bulkWrite(ops);
  console.log(`Seeded ${result.upsertedCount} new + ${result.modifiedCount} updated pincodes`);

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
