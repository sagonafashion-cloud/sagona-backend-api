import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import ErrorState from '../../src/components/ui/ErrorState';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';
import { Address } from '../../src/types';

// Smoother list <-> form transition on the toggle below (Android needs the
// experimental flag enabled once; iOS supports LayoutAnimation out of the box).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Wired to the existing GET/POST/PUT/DELETE /auth/addresses[/:id] — all
// already implemented server-side (authController.js), no backend changes.
// Validation mirrors backend's addressRules (line1/city/state/pincode
// required, pincode 6 digits, phone 10 digits if present).

type FormState = {
  label: string; name: string; line1: string; line2: string;
  city: string; state: string; pincode: string; phone: string; isDefault: boolean;
};
const emptyForm: FormState = { label: '', name: '', line1: '', line2: '', city: '', state: '', pincode: '', phone: '', isDefault: false };

export default function AddressesScreen() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null); // address _id, or 'new'
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: addresses, isLoading, isError, refetch } = useQuery<Address[]>({
    queryKey: ['addresses'],
    queryFn: async () => {
      const { data } = await api.get('/auth/addresses');
      return data.data ?? [];
    },
  });

  const startAdd = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setForm(emptyForm);
    setEditingId('new');
  };
  const startEdit = (a: Address) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setForm({
      label: a.label ?? '', name: a.name ?? '', line1: a.line1, line2: a.line2 ?? '',
      city: a.city, state: a.state, pincode: a.pincode, phone: a.phone ?? '', isDefault: !!a.isDefault,
    });
    setEditingId(a._id ?? 'new');
  };
  const cancel = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingId(null);
  };
  const setField = (key: keyof FormState) => (val: string) => setForm((f) => ({ ...f, [key]: val }));

  const validate = () => {
    if (!form.line1 || !form.city || !form.state || !form.pincode) {
      Alert.alert('Incomplete', 'Please fill address line 1, city, state, and pincode');
      return false;
    }
    if (!/^\d{6}$/.test(form.pincode)) { Alert.alert('Invalid pincode', 'Enter a 6-digit pincode'); return false; }
    if (form.phone && !/^\d{10}$/.test(form.phone)) { Alert.alert('Invalid phone', 'Enter a 10-digit phone number, or leave it blank'); return false; }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    const payload = {
      label: form.label || undefined,
      name: form.name || undefined,
      line1: form.line1,
      line2: form.line2 || undefined,
      city: form.city,
      state: form.state,
      pincode: form.pincode,
      phone: form.phone || undefined,
      isDefault: form.isDefault,
    };
    try {
      setSaving(true);
      const { data } = editingId && editingId !== 'new'
        ? await api.put(`/auth/addresses/${editingId}`, payload)
        : await api.post('/auth/addresses', payload);
      queryClient.setQueryData(['addresses'], data.data ?? []);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEditingId(null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (id?: string) => {
    if (!id) return;
    Alert.alert('Remove address', 'Are you sure you want to delete this address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            setDeletingId(id);
            const { data } = await api.delete(`/auth/addresses/${id}`);
            queryClient.setQueryData(['addresses'], data.data ?? []);
          } catch (err: any) {
            Alert.alert('Error', err.message);
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  if (editingId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title={editingId === 'new' ? 'Add Address' : 'Edit Address'} onBack={cancel} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Input label="Label" value={form.label} onChangeText={setField('label')} placeholder="Home, Work..." />
          <Input label="Full Name" value={form.name} onChangeText={setField('name')} autoCapitalize="words" placeholder="Recipient name" />
          <Input label="Address Line 1 *" value={form.line1} onChangeText={setField('line1')} placeholder="Building, street" />
          <Input label="Address Line 2" value={form.line2} onChangeText={setField('line2')} placeholder="Landmark (optional)" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Input label="City *" value={form.city} onChangeText={setField('city')} placeholder="City" /></View>
            <View style={{ width: spacing.sm }} />
            <View style={{ flex: 1 }}><Input label="State *" value={form.state} onChangeText={setField('state')} placeholder="State" /></View>
          </View>
          <Input label="Pincode *" value={form.pincode} onChangeText={setField('pincode')} keyboardType="number-pad" placeholder="6-digit" />
          <Input label="Phone" value={form.phone} onChangeText={setField('phone')} keyboardType="phone-pad" placeholder="10-digit number" />
          <TouchableOpacity style={styles.defaultRow} onPress={() => setForm((f) => ({ ...f, isDefault: !f.isDefault }))}>
            <View style={[styles.checkbox, form.isDefault && styles.checkboxActive]}>
              {form.isDefault && <Ionicons name="checkmark" size={14} color={colors.black} />}
            </View>
            <Text style={styles.defaultLabel}>Set as default address</Text>
          </TouchableOpacity>
          <Button label={saving ? 'Saving...' : 'Save Address'} onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Saved Addresses" />
      <ScrollView contentContainerStyle={styles.content}>
        {isLoading && <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />}
        {!isLoading && isError && (
          <ErrorState title="Couldn't load your addresses" onRetry={refetch} />
        )}
        {!isLoading && !isError && (!addresses || addresses.length === 0) && (
          <EmptyState icon="location-outline" title="No saved addresses" subtitle="Add an address to speed up checkout next time." />
        )}
        {(addresses ?? []).map((a) => (
          <View key={a._id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>{a.label || 'Address'}</Text>
              {a.isDefault && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>DEFAULT</Text></View>}
            </View>
            {!!a.name && <Text style={styles.cardName}>{a.name}</Text>}
            <Text style={styles.cardText}>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</Text>
            <Text style={styles.cardText}>{a.city}, {a.state} {a.pincode}</Text>
            {!!a.phone && <Text style={styles.cardText}>{a.phone}</Text>}
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => startEdit(a)} style={styles.actionBtn}>
                <Ionicons name="pencil-outline" size={16} color={colors.gray} />
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(a._id)} style={styles.actionBtn} disabled={deletingId === a._id}>
                {deletingId === a._id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                )}
                <Text style={[styles.actionText, { color: colors.error }]}>{deletingId === a._id ? 'Deleting...' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <Button label="+ Add New Address" onPress={startAdd} variant="outline" style={{ marginTop: spacing.sm }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  content: { padding: spacing.lg, paddingBottom: 60 },
  row: { flexDirection: 'row' },
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.black, textTransform: 'uppercase', letterSpacing: 0.5 },
  defaultBadge: { backgroundColor: colors.gold + '22', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  defaultBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: colors.goldDark, letterSpacing: 0.5 },
  cardName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black, marginTop: 2 },
  cardText: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.gray },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.md },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  defaultLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.black },
});
