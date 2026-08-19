export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  loyaltyPoints: number;
  birthday?: string;
  phone?: string;
}

export interface ProductVariant {
  size: string;
  colour: string;
  stock: number;
  price: number;
}

// One size's real measurements — matches backend's Product.garmentMeasurements
// subdocument (backend/models/Product.js). Also what /sizing/recommend reads
// internally. Populated per-product by admins; may be empty on older products.
export interface GarmentMeasurement {
  size: string;
  chestWidth?: number;
  waistWidth?: number;
  hipWidth?: number;
  shoulderWidth?: number;
  sleeveLength?: number;
  garmentLength?: number;
  inseam?: number;
  neckWidth?: number;
}

export interface Product {
  _id: string;
  name: string;
  description: string;
  category: string;
  images: string[];
  image?: string;
  variants: ProductVariant[];
  basePrice: number;
  price: number;
  mrp?: number;
  salePrice?: number;
  isNew?: boolean;
  isSale?: boolean;
  tags?: string[];
  archived?: boolean;
  garmentMeasurements?: GarmentMeasurement[];
  fitType?: 'slim' | 'regular' | 'relaxed' | 'oversized';
  fitNote?: string;
  sizeUpNote?: string;
}

// Local-first wishlist entry (device storage — see src/stores/wishlistStore.ts).
// No backend wishlist route exists yet (User.wishlist schema field has no
// controller/route wired up), so this is intentionally device-only for now.
export interface WishlistItem {
  productId: string;
  name: string;
  image: string;
  price: number;
  mrp?: number;
  category?: string;
  addedAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  image: string;
  price: number;
  qty: number;
  size: string;
  colour: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  image?: string;
  size: string;
  colour: string;
  price: number;
  unitPrice?: number;
  qty: number;
}

export interface ShippingAddress {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

// Saved address book entry — matches backend's addressSchema (User model).
// Managed via GET/POST/PUT/DELETE /auth/addresses[/:id].
export interface Address {
  _id?: string;
  label?: string;
  name?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  phone?: string;
  isDefault?: boolean;
}

// One entry in an order's status history — matches backend's timelineEntrySchema.
export interface TimelineEntry {
  status: string;
  label: string;
  description?: string;
  timestamp: string;
  location?: string;
  updatedBy?: string;
}

// Matches backend's shipmentSchema — populated as an order is packed/dispatched.
export interface Shipment {
  storeId?: string;
  storeName?: string;
  items?: string[];
  courier?: string;
  trackingId?: string;
  trackingUrl?: string;
  status?: string;
  etaDays?: number;
  dispatchedAt?: string;
  expectedDelivery?: string;
  deliveredAt?: string;
}

// Matches backend's returnRequestSchema (embedded on Order, one per order —
// not a list). Set by POST /orders/:id/return-request (initiateReturn).
export interface ReturnRequest {
  requestedAt: string;
  reason: string;
  type: 'return' | 'replace';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  replacementProductId?: string;
  replacementProductName?: string;
  adminNote?: string;
  resolvedAt?: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  paymentMethod: 'COD' | 'Razorpay';
  paymentStatus: 'Pending' | 'Paid' | 'Failed';
  status: string;
  subtotal: number;
  shippingCharge: number;
  gstAmount: number;
  total: number;
  billing?: { subtotal: number; shippingCharge: number; cgst: number; sgst: number; igst: number; grandTotal: number };
  payment?: { method: 'COD' | 'ONLINE' | 'MANUAL'; status: 'pending' | 'paid' | 'failed' | 'refunded' };
  invoiceUrl?: string;
  timeline?: TimelineEntry[];
  shipments?: Shipment[];
  estimatedDelivery?: string;
  returnRequest?: ReturnRequest;
  createdAt: string;
}

export interface Store {
  _id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  hours: string;
  latitude?: number;
  longitude?: number;
}
