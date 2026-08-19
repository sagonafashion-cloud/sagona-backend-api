import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../../lib/theme';
import { Order } from '../../types';
import { STATUS_SEQUENCE, statusLabel, statusColor } from '../../lib/orderStatus';

interface Props {
  order: Order;
}

const BRANCH_STATUSES = new Set(['cancelled', 'return_requested', 'returned']);

// Renders the order-tracking view from the backend's existing timeline/shipments
// data (backend/models/Order.js) — no new endpoints needed. Falls back to a
// step progress bar (from order.status alone) when the order has no populated
// timeline yet (e.g. immediately after placement).
export default function OrderTimeline({ order }: Props) {
  const isBranch = BRANCH_STATUSES.has(order.status);
  const currentStepIndex = STATUS_SEQUENCE.indexOf(order.status);
  const shipment = order.shipments?.[0];

  return (
    <View style={styles.wrap}>
      {isBranch ? (
        <View style={[styles.branchBanner, { borderColor: statusColor(order.status) }]}>
          <Ionicons
            name={order.status === 'cancelled' ? 'close-circle' : 'arrow-undo-circle'}
            size={20}
            color={statusColor(order.status)}
          />
          <Text style={[styles.branchText, { color: statusColor(order.status) }]}>{statusLabel(order.status)}</Text>
        </View>
      ) : (
        <View style={styles.steps}>
          {STATUS_SEQUENCE.map((step, i) => {
            const reached = currentStepIndex >= 0 && i <= currentStepIndex;
            const lineFilled = currentStepIndex >= 0 && i < currentStepIndex;
            const isLast = i === STATUS_SEQUENCE.length - 1;
            return (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepMarkerCol}>
                  <View style={[styles.stepDot, reached && styles.stepDotActive]}>
                    {reached && <Ionicons name="checkmark" size={12} color={colors.white} />}
                  </View>
                  {!isLast && <View style={[styles.stepLine, lineFilled && styles.stepLineActive]} />}
                </View>
                <Text style={[styles.stepLabel, reached && styles.stepLabelActive]}>{statusLabel(step)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {!!order.estimatedDelivery && !isBranch && (
        <Text style={styles.eta}>
          Estimated delivery: {new Date(order.estimatedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
        </Text>
      )}

      {!!shipment && (shipment.courier || shipment.trackingId) && (
        <View style={styles.shipmentCard}>
          {!!shipment.courier && <Text style={styles.shipmentText}>Courier: {shipment.courier}</Text>}
          {!!shipment.trackingId && <Text style={styles.shipmentText}>Tracking ID: {shipment.trackingId}</Text>}
          {!!shipment.trackingUrl && (
            <TouchableOpacity style={styles.trackBtn} onPress={() => Linking.openURL(shipment.trackingUrl!)}>
              <Ionicons name="navigate-outline" size={16} color={colors.gold} />
              <Text style={styles.trackBtnText}>Track Package</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!order.timeline && order.timeline.length > 0 && (
        <View style={styles.history}>
          <Text style={styles.historyTitle}>Order History</Text>
          {[...order.timeline].reverse().map((entry, i) => (
            <View key={i} style={styles.historyRow}>
              <View style={[styles.historyDot, { backgroundColor: statusColor(entry.status) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyLabel}>{entry.label || statusLabel(entry.status)}</Text>
                {!!entry.description && <Text style={styles.historyDesc}>{entry.description}</Text>}
                <Text style={styles.historyTime}>
                  {new Date(entry.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {entry.location ? ` · ${entry.location}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  branchBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.white },
  branchText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  steps: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepMarkerCol: { alignItems: 'center', width: 24 },
  stepDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  stepDotActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  stepLine: { width: 2, flex: 1, minHeight: 20, backgroundColor: colors.border },
  stepLineActive: { backgroundColor: colors.gold },
  stepLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.lightGray, marginLeft: spacing.sm, paddingBottom: spacing.md },
  stepLabelActive: { fontFamily: fonts.bodyMedium, color: colors.black },
  eta: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.gray, textAlign: 'center' },
  shipmentCard: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4 },
  shipmentText: { fontFamily: fonts.body, fontSize: 13, color: colors.gray },
  trackBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  trackBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.gold },
  history: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  historyTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.black, marginBottom: spacing.sm },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  historyLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.black },
  historyDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.gray, marginTop: 2 },
  historyTime: { fontFamily: fonts.body, fontSize: 11, color: colors.lightGray, marginTop: 2 },
});
