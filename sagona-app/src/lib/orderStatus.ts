// Shared order-status display helpers.
//
// Backend's real Order.status enum (see backend/models/Order.js) is lowercase
// snake_case: placed, confirmed, packed, shipped, out_for_delivery, delivered,
// return_requested, returned, cancelled. Earlier mobile code had a stale
// capitalized map (Processing/Confirmed/Shipped/Delivered/Cancelled) that
// didn't match any of these — this file replaces that with the real enum.

export const STATUS_LABELS: Record<string, string> = {
  placed: 'Order Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  return_requested: 'Return Requested',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export const STATUS_COLORS: Record<string, string> = {
  placed: '#e67e22',
  confirmed: '#2980b9',
  packed: '#8e44ad',
  shipped: '#8e44ad',
  out_for_delivery: '#d68910',
  delivered: '#27ae60',
  return_requested: '#c0392b',
  returned: '#7f8c8d',
  cancelled: '#c0392b',
};

// Linear happy-path sequence, used to render a step-by-step progress timeline.
// Branch/terminal states (cancelled, return_requested, returned) are shown
// separately rather than as a step in this sequence.
export const STATUS_SEQUENCE = ['placed', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? '#555550';
}
