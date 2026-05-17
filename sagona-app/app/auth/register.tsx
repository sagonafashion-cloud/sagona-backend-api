import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import { colors, fonts, spacing } from '../../src/lib/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) return Alert.alert('Error', 'All fields required');
    if (password.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters');
    try {
      setLoading(true);
      await register(name.trim(), email.trim(), password);
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>SAGONA</Text>
      <Text style={styles.title}>Create account</Text>

      <Input label="Full Name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
      <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="you@example.com" />
      <Input label="Password" value={password} onChangeText={setPassword} secureToggle placeholder="Min 6 characters" />

      <Button label="Create Account" onPress={handleRegister} loading={loading} style={{ marginTop: spacing.sm }} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.replace('/auth/login' as any)}>
          <Text style={styles.link}>Sign in</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  content: { padding: spacing.lg, paddingTop: 80, flexGrow: 1 },
  brand: { fontFamily: fonts.heading, fontSize: 32, color: colors.gold, letterSpacing: 4, marginBottom: spacing.xxl },
  title: { fontFamily: fonts.headingItalic, fontSize: 28, color: colors.white, marginBottom: spacing.xl },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  footerText: { fontFamily: fonts.body, fontSize: 14, color: colors.lightGray },
  link: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.gold },
});
