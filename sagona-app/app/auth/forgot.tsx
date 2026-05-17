import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import api from '../../src/lib/api';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import { colors, fonts, spacing } from '../../src/lib/theme';

export default function ForgotScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    if (!email) return Alert.alert('Error', 'Enter your email');
    try {
      setLoading(true);
      await api.post('/auth/forgot-password', { email: email.trim() });
      setStep('otp');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (!otp || !newPassword) return Alert.alert('Error', 'Enter OTP and new password');
    try {
      setLoading(true);
      await api.post('/auth/reset-password', { email: email.trim(), otp, newPassword });
      Alert.alert('Success', 'Password updated! Please sign in.', [
        { text: 'OK', onPress: () => router.replace('/auth/login' as any) }
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>SAGONA</Text>
      <Text style={styles.title}>{step === 'email' ? 'Reset password' : 'Enter OTP'}</Text>
      <Text style={styles.sub}>
        {step === 'email' ? "We'll send a 6-digit OTP to your email." : `OTP sent to ${email}`}
      </Text>

      {step === 'email' ? (
        <>
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
          <Button label="Send OTP" onPress={sendOtp} loading={loading} />
        </>
      ) : (
        <>
          <Input label="OTP" value={otp} onChangeText={setOtp} keyboardType="number-pad" placeholder="6-digit code" />
          <Input label="New Password" value={newPassword} onChangeText={setNewPassword} secureToggle placeholder="Min 6 characters" />
          <Button label="Reset Password" onPress={resetPassword} loading={loading} />
          <TouchableOpacity onPress={() => setStep('email')} style={styles.back}>
            <Text style={styles.backText}>← Change email</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back to sign in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  content: { padding: spacing.lg, paddingTop: 80, flexGrow: 1 },
  brand: { fontFamily: fonts.heading, fontSize: 32, color: colors.gold, letterSpacing: 4, marginBottom: spacing.xl },
  title: { fontFamily: fonts.headingItalic, fontSize: 28, color: colors.white, marginBottom: spacing.sm },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.lightGray, marginBottom: spacing.xl },
  back: { marginTop: spacing.lg, alignItems: 'center' },
  backText: { fontFamily: fonts.body, fontSize: 14, color: colors.lightGray },
});
