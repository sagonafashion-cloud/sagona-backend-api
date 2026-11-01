import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useCartStore } from '../../src/stores/cartStore';
import { useAuthStore } from '../../src/stores/authStore';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';

const GST_RATE = 0.05;
const FREE_SHIP = 999;
const SHIP_CHARGE = 99;

type PaymentMethod = 'COD';

// Same wording the server uses for every refusal: it never says why a code failed.
const REFERRAL_GENERIC = 'This code is not valid for this order';
type AppliedReferral = { code: string; discount: number; grandTotal: number };

export default function CheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, clear } = useCartStore();
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('COD');
  const [loading, setLoading] = useState(false);

  // Referral code: the server decides everything (discount, totals); the app only shows it.
  const [referralOn, setReferralOn] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [referralBusy, setReferralBusy] = useState(false);
  const [referralMsg, setReferralMsg] = useState('');
  const [referral, setReferral] = useState<AppliedReferral | null>(null);

  useEffect(() => {
    let alive = true;
    api.get('/referral/status')
      .then((r) => { if (alive) setReferralOn(!!r.data?.data?.enabled); })
      .catch(() => { /* 404 = programme off: the box stays hidden */ });
    return () => { alive = false; };
  }, []);

  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  const shipping = subtotal >= FREE_SHIP ? 0 : SHIP_CHARGE;
  const gst = Math.round((subtotal + shipping) * GST_RATE);
  const estimatedTotal = subtotal + shipping + gst;
  const total = referral ? referral.grandTotal : estimatedTotal;

  const validate = () => {
    if (!name || !phone || !line1 || !city || !state || !pincode) {
      Alert.alert('Incomplete', 'Please fill all required address fields');
      return false;
    }
    if (!user && !email) {
      Alert.alert('Incomplete', 'Please enter an email so we can send your order confirmation');
      return false;
    }
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid email', 'Enter a valid email address');
      return false;
    }
    if (!/^\d{10}$/.test(phone)) { Alert.alert('Invalid phone', 'Enter a 10-digit phone number'); return false; }
    if (!/^\d{6}$/.test(pincode)) { Alert.alert('Invalid pincode', 'Enter a 6-digit pincode'); return false; }
    return true;
  };

  const buildOrderItems = () => items.map((i) => ({
    productId: i.productId, name: i.name, image: i.image, size: i.size, colour: i.colour, price: i.price, qty: i.qty,
  }));

  const applyReferral = async () => {
    const code = referralInput.trim();
    if (!code) { setReferralMsg('Enter a code'); return; }
    try {
      setReferralBusy(true); setReferralMsg('');
      const { data } = await api.post('/referral/validate', {
        code, items: buildOrderItems(), shippingAddress: { name, phone, line1, line2, city, state, pincode }, email: user ? user.email : email,
      });
      setReferral({ code: data.data.code, discount: data.data.discount, grandTotal: data.data.billing.grandTotal });
    } catch (e: any) {
      setReferral(null);
      setReferralMsg(e?.message || REFERRAL_GENERIC);
    } finally { setReferralBusy(false); }
  };
  const removeReferral = () => { setReferral(null); setReferralInput(''); setReferralMsg(''); };

  const placeOrder = async () => {
    if (!validate()) return;
    try {
      setLoading(true);
      const shippingAddress = { name, phone, line1, line2, city, state, pincode };
      const orderItems = items.map((i) => ({
        productId: i.productId,
        name: i.name,
        image: i.image,
        size: i.size,
        colour: i.colour,
        price: i.price,
        qty: i.qty,
      }));
      // Guests have no account/token — backend's guest checkout (guestOrAuth)
      // identifies them by email/phone and auto-creates an account.
      const guestFields = !user ? { email } : {};

      if (payment === 'COD') {
        await api.post('/orders', { items: orderItems, shippingAddress, payment: { method: 'COD' }, ...guestFields, ...(referral ? { referralCode: referral.code } : {}) });
        clear();
        // Keep the Account tab's order list (and the return-request order
        // picker, which reads the same /orders/my endpoint) in sync with the
        // order that was just placed, without requiring an app restart.
        queryClient.invalidateQueries({ queryKey: ['myOrders'] });
        queryClient.invalidateQueries({ queryKey: ['returnEligibleOrders'] });
        if (user) {
          Alert.alert('Order placed!', 'Your order has been confirmed.', [
            { text: 'View orders', onPress: () => router.replace('/(tabs)/account' as any) }
          ]);
        } else {
          Alert.alert(
            'Order placed!',
            `Your order has been confirmed and a confirmation sent to ${email}. We've started an account for you — log in with this email anytime to track it.`,
            [{ text: 'Continue shopping', onPress: () => router.replace('/(tabs)/' as any) }]
          );
        }
      } else {
        // Razorpay: create order → open checkout. Amount is computed and verified
        // server-side from real product prices, never sent from the client.
        const { data: rzp } = await api.post('/payment/create-order', { items: orderItems, shippingAddress, ...guestFields });
        Alert.alert('Online payment', 'Razorpay SDK integration requires native build.\nUse COD for now in Expo Go.');
      }
    } catch (err: any) {
      if (referral && err.message === REFERRAL_GENERIC) {
        // The code stopped being valid between "Apply" and "Place order". Never charge a different
        // amount silently: drop the code, show the normal total, let the shopper decide.
        removeReferral();
        Alert.alert('Referral code removed', 'That code can no longer be used on this order. Please review the total and place the order again.');
      } else {
        Alert.alert('Error', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Checkout</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Delivery Address</Text>
        <Input label="Full Name *" value={name} onChangeText={setName} placeholder="As on ID" autoCapitalize="words" />
        {!user && (
          <Input label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="For order confirmation" />
        )}
        <Input label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit number" />
        <Input label="Address Line 1 *" value={line1} onChangeText={setLine1} placeholder="Building, street" />
        <Input label="Address Line 2" value={line2} onChangeText={setLine2} placeholder="Landmark (optional)" />
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Input label="City *" value={city} onChangeText={setCity} placeholder="City" /></View>
          <View style={{ width: spacing.sm }} />
          <View style={{ flex: 1 }}><Input label="State *" value={state} onChangeText={setState} placeholder="State" /></View>
        </View>
        <Input label="Pincode *" value={pincode} onChangeText={setPincode} keyboardType="number-pad" placeholder="6-digit" />

        <Text style={styles.sectionTitle}>Payment Method</Text>
        {(['COD'] as PaymentMethod[]).map((m) => (
          <TouchableOpacity key={m} style={styles.payOption} onPress={() => setPayment(m)}>
            <View style={[styles.radio, payment === m && styles.radioActive]} />
            <Text style={styles.payLabel}>{m === 'COD' ? 'Cash on Delivery' : 'Pay Online (Razorpay)'}</Text>
          </TouchableOpacity>
        ))}

        {referralOn && (
          <View style={styles.summary}>
            <Text style={styles.sectionTitle}>Referral code</Text>
            {referral ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Code {referral.code} applied</Text>
                <TouchableOpacity onPress={removeReferral}><Text style={styles.linkText}>Remove</Text></TouchableOpacity>
              </View>
            ) : (
              <>
                <Input label="Have a referral code?" value={referralInput} onChangeText={setReferralInput} autoCapitalize="characters" placeholder="Enter code" />
                <Button label={referralBusy ? 'Checking...' : 'Apply'} onPress={applyReferral} loading={referralBusy} />
                {!!referralMsg && <Text style={styles.errorText}>{referralMsg}</Text>}
              </>
            )}
          </View>
        )}

        <View style={styles.summary}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>₹{subtotal.toLocaleString('en-IN')}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Shipping</Text><Text style={styles.summaryValue}>{shipping === 0 ? 'FREE' : `₹${shipping}`}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>GST (5%)</Text><Text style={styles.summaryValue}>₹{gst.toLocaleString('en-IN')}</Text></View>
          {referral && (
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Referral discount</Text><Text style={styles.summaryValue}>-₹{referral.discount.toLocaleString('en-IN')}</Text></View>
          )}
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
          </View>
        </View>

        <Button label={loading ? 'Placing order...' : `Place Order · ₹${total.toLocaleString('en-IN')}`} onPress={placeOrder} loading={loading} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  linkText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.gold },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: '#dc2626', marginTop: spacing.sm },
  screen: { flex: 1, backgroundColor: colors.light },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  topTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.black },
  content: { padding: spacing.lg, paddingBottom: 60 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.black, marginBottom: spacing.md, marginTop: spacing.md },
  row: { flexDirection: 'row' },
  payOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  payLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.black },
  summary: { backgroundColor: colors.white, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.gray },
  summaryValue: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm, marginBottom: 0 },
  totalLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.black },
  totalValue: { fontFamily: fonts.heading, fontSize: 18, color: colors.black },
});
