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

// Calculate estimated delivery skipping Sundays. Uses UTC-based day
// increments plus an IST-anchored day-of-week check (instead of
// setDate()/getDay(), which read the host's local timezone) so the result
// doesn't shift depending on whether the server runs UTC or IST.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export function calcEstimatedDelivery(fromDate, days = 5) {
  let d = new Date(fromDate);
  let added = 0;
  while (added < days) {
    d = new Date(d.getTime() + DAY_MS);
    const istDayOfWeek = new Date(d.getTime() + IST_OFFSET_MS).getUTCDay();
    if (istDayOfWeek !== 0) added++;
  }
  return d;
}
