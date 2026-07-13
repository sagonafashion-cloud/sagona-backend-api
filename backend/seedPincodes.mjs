import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGO_URI;
if (!uri) { console.error('MONGO_URI not found in .env'); process.exit(1); }

await mongoose.connect(uri);
console.log('Connected to MongoDB Atlas');

const schema = new mongoose.Schema({ pincode: String, city: String, state: String, lat: Number, lng: Number });
const PincodeMap = mongoose.models.PincodeMap || mongoose.model('PincodeMap', schema);

const pincodes = [
  {pincode:'380058',city:'Ahmedabad',state:'GJ'},
  {pincode:'380001',city:'Ahmedabad',state:'GJ'},
  {pincode:'380015',city:'Ahmedabad',state:'GJ'},
  {pincode:'380009',city:'Ahmedabad',state:'GJ'},
  {pincode:'380025',city:'Ahmedabad',state:'GJ'},
  {pincode:'395001',city:'Surat',state:'GJ'},
  {pincode:'395007',city:'Surat',state:'GJ'},
  {pincode:'390001',city:'Vadodara',state:'GJ'},
  {pincode:'361001',city:'Rajkot',state:'GJ'},
  {pincode:'110001',city:'New Delhi',state:'DL'},
  {pincode:'110045',city:'New Delhi',state:'DL'},
  {pincode:'110011',city:'New Delhi',state:'DL'},
  {pincode:'110020',city:'New Delhi',state:'DL'},
  {pincode:'110092',city:'New Delhi',state:'DL'},
  {pincode:'201301',city:'Noida',state:'UP'},
  {pincode:'201304',city:'Noida',state:'UP'},
  {pincode:'122001',city:'Gurugram',state:'HR'},
  {pincode:'122018',city:'Gurugram',state:'HR'},
  {pincode:'400001',city:'Mumbai',state:'MH'},
  {pincode:'400051',city:'Mumbai',state:'MH'},
  {pincode:'400076',city:'Mumbai',state:'MH'},
  {pincode:'400093',city:'Mumbai',state:'MH'},
  {pincode:'411001',city:'Pune',state:'MH'},
  {pincode:'411045',city:'Pune',state:'MH'},
  {pincode:'411057',city:'Pune',state:'MH'},
  {pincode:'440001',city:'Nagpur',state:'MH'},
  {pincode:'560001',city:'Bengaluru',state:'KA'},
  {pincode:'560034',city:'Bengaluru',state:'KA'},
  {pincode:'560076',city:'Bengaluru',state:'KA'},
  {pincode:'302001',city:'Jaipur',state:'RJ'},
  {pincode:'302017',city:'Jaipur',state:'RJ'},
  {pincode:'302020',city:'Jaipur',state:'RJ'},
  {pincode:'600001',city:'Chennai',state:'TN'},
  {pincode:'600040',city:'Chennai',state:'TN'},
  {pincode:'600097',city:'Chennai',state:'TN'},
  {pincode:'641001',city:'Coimbatore',state:'TN'},
  {pincode:'625001',city:'Madurai',state:'TN'},
  {pincode:'700001',city:'Kolkata',state:'WB'},
  {pincode:'700064',city:'Kolkata',state:'WB'},
  {pincode:'500001',city:'Hyderabad',state:'TS'},
  {pincode:'500034',city:'Hyderabad',state:'TS'},
  {pincode:'500081',city:'Hyderabad',state:'TS'},
  {pincode:'530001',city:'Visakhapatnam',state:'AP'},
  {pincode:'520001',city:'Vijayawada',state:'AP'},
  {pincode:'226001',city:'Lucknow',state:'UP'},
  {pincode:'226010',city:'Lucknow',state:'UP'},
  {pincode:'208001',city:'Kanpur',state:'UP'},
  {pincode:'160001',city:'Chandigarh',state:'CH'},
  {pincode:'248001',city:'Dehradun',state:'UK'},
  {pincode:'462001',city:'Bhopal',state:'MP'},
  {pincode:'452001',city:'Indore',state:'MP'},
  {pincode:'800001',city:'Patna',state:'BR'},
  {pincode:'834001',city:'Ranchi',state:'JH'},
  {pincode:'751001',city:'Bhubaneswar',state:'OD'},
  {pincode:'781001',city:'Guwahati',state:'AS'},
  {pincode:'682001',city:'Kochi',state:'KL'},
  {pincode:'695001',city:'Thiruvananthapuram',state:'KL'},
  {pincode:'160017',city:'Chandigarh',state:'CH'},
  {pincode:'380006',city:'Ahmedabad',state:'GJ'},
  {pincode:'380013',city:'Ahmedabad',state:'GJ'},
  {pincode:'380016',city:'Ahmedabad',state:'GJ'},
  {pincode:'380019',city:'Ahmedabad',state:'GJ'},
  {pincode:'380021',city:'Ahmedabad',state:'GJ'},
  {pincode:'380023',city:'Ahmedabad',state:'GJ'},
  {pincode:'380026',city:'Ahmedabad',state:'GJ'},
  {pincode:'380027',city:'Ahmedabad',state:'GJ'},
  {pincode:'380028',city:'Ahmedabad',state:'GJ'},
  {pincode:'380050',city:'Ahmedabad',state:'GJ'},
  {pincode:'380051',city:'Ahmedabad',state:'GJ'},
  {pincode:'380052',city:'Ahmedabad',state:'GJ'},
  {pincode:'380054',city:'Ahmedabad',state:'GJ'},
  {pincode:'380055',city:'Ahmedabad',state:'GJ'},
  {pincode:'380060',city:'Ahmedabad',state:'GJ'},
  {pincode:'380061',city:'Ahmedabad',state:'GJ'},
  {pincode:'382010',city:'Gandhinagar',state:'GJ'},
  {pincode:'382016',city:'Gandhinagar',state:'GJ'},
  {pincode:'382021',city:'Gandhinagar',state:'GJ'},
  {pincode:'382028',city:'Gandhinagar',state:'GJ'},
  {pincode:'382030',city:'Gandhinagar',state:'GJ'},
];

let added = 0;
for (const d of pincodes) {
  await PincodeMap.findOneAndUpdate(
    { pincode: d.pincode },
    { pincode: d.pincode, city: d.city, state: d.state, lat: 0, lng: 0 },
    { upsert: true, new: true }
  );
  console.log('✅', d.pincode, '→', d.city, d.state);
  added++;
}

console.log('\n✅ Done —', added, 'pincodes seeded into MongoDB');
await mongoose.disconnect();
process.exit(0);
