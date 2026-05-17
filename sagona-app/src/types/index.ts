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

export interface Product {
  _id: string;
  name: string;
  description: string;
  category: string;
  images: string[];
  image?: string;
  variants: ProductVariant[];
  basePrice: number;
  salePrice?: number;
  isNew?: boolean;
  isSale?: boolean;
  tags?: string[];
  archived?: boolean;
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
  invoiceUrl?: string;
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
