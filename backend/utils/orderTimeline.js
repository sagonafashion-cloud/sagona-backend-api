export const STATUS_CONFIG = {
  placed: {
    label: 'Order Placed',
    description: 'Your order has been received and payment confirmed.',
    color: '#1D9E75'
  },
  confirmed: {
    label: 'Order Confirmed',
    description: 'Your order has been verified and is being prepared for packing.',
    color: '#1D9E75'
  },
  packed: {
    label: 'Order Packed',
    description: 'Your items have been carefully packed and are ready for dispatch.',
    color: '#1D9E75'
  },
  shipped: {
    label: 'Shipped',
    description: 'Your order has been handed over to the courier.',
    color: '#C9A84C'
  },
  out_for_delivery: {
    label: 'Out for Delivery',
    description: 'Your order is with the delivery agent and will arrive today.',
    color: '#C9A84C'
  },
  delivered: {
    label: 'Delivered',
    description: 'Your order has been delivered successfully.',
    color: '#1D9E75'
  },
  cancelled: {
    label: 'Cancelled',
    description: 'Your order has been cancelled.',
    color: '#E24B4A'
  },
  return_requested: {
    label: 'Return Requested',
    description: 'Your return or replacement request is being reviewed.',
    color: '#EF9F27'
  },
  returned: {
    label: 'Returned',
    description: 'Your return has been processed.',
    color: '#888'
  }
};

export function buildTimelineEntry(status, location = '', updatedBy = 'admin') {
  const config = STATUS_CONFIG[status] || { label: status, description: '' };
  return {
    status,
    label:       config.label,
    description: config.description,
    timestamp:   new Date(),
    location,
    updatedBy
  };
}

// Calculate estimated delivery skipping Sundays
export function calcEstimatedDelivery(fromDate, days = 5) {
  const d = new Date(fromDate);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++;
  }
  return d;
}
