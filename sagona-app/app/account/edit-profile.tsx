import React, { useState } from 'react';
import { View, ScrollView, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/authStore';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing } from '../../src/lib/theme';

// Wired to the existing PUT /auth/me (updateProfile) — no backend changes.
// Note: the backend's response never echoes back `phone` (formatUser omits
// it), so on success we merge the submitted values into the store directly
// via updateUser() rather than trusting the server response to reflect them.
export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name');
      return;
    }
    if (phone && !/^\d{10}$/.test(phone)) {
      Alert.alert('Invalid phone', 'Enter a 10-digit phone number, or leave it blank');
      return;
    }
    try {
      setSaving(true);
      await api.put('/auth/me', { name: name.trim(), phone: phone.trim() });
      await updateUser({ name: name.trim(), phone: phone.trim() || undefined });
      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Edit Profile" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Input label="Full Name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Your name" />
        <Input label="Email" value={user?.email ?? ''} editable={false} style={styles.disabledInput} />
        <Input label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit number" />
        <Button label={saving ? 'Saving...' : 'Save Changes'} onPress={save} loading={saving} style={{ marginTop: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  content: { padding: spacing.lg },
  disabledInput: { color: colors.lightGray },
});
