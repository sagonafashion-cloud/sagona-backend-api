import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import { colors, fonts, spacing } from '../../src/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please enter email and password');
    try {
      setLoading(true);
      await login(email.trim(), password);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return Alert.alert('Not set up', 'No biometrics enrolled on this device.');
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Log in to SAGONA' });
    if (result.success) {
      // If user already has saved credentials, hydrate will pick them up
      // This is a convenience shortcut — credentials must already be stored
      Alert.alert('Success', 'Biometric login verified');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>SAGONA</Text>
      <Text style={styles.tagline}>Premium Kidswear</Text>
      <Text style={styles.title}>Welcome back</Text>

      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
      <Input label="Password" value={password} onChangeText={setPassword} secureToggle placeholder="••••••••" />

      <TouchableOpacity onPress={() => router.push('/auth/forgot' as any)} style={styles.forgotRow}>
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      <Button label="Sign In" onPress={handleLogin} loading={loading} />

      <TouchableOpacity style={styles.bioBtn} onPress={handleBiometric}>
        <Ionicons name="finger-print-outline" size={22} color={colors.gold} />
        <Text style={styles.bioText}>Use biometrics</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>New to SAGONA? </Text>
        <TouchableOpacity onPress={() => router.push('/auth/register' as any)}>
          <Text style={styles.link}>Create account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  content: { padding: spacing.lg, paddingTop: 80, flexGrow: 1 },
  brand: { fontFamily: fonts.heading, fontSize: 32, color: colors.gold, letterSpacing: 4, marginBottom: 4 },
  tagline: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, letterSpacing: 3, textTransform: 'uppercase', marginBottom: spacing.xxl },
  title: { fontFamily: fonts.headingItalic, fontSize: 28, color: colors.white, marginBottom: spacing.xl },
  forgotRow: { alignItems: 'flex-end', marginBottom: spacing.lg, marginTop: -spacing.sm },
  forgotText: { fontFamily: fonts.body, fontSize: 13, color: colors.lightGray },
  bioBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.lg },
  bioText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.gold },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { fontFamily: fonts.body, fontSize: 14, color: colors.lightGray },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.gold },
});
