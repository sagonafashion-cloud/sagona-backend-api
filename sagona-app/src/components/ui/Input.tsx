import React, { useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../../lib/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  secureToggle?: boolean;
}

export default function Input({ label, error, secureToggle, style, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const isSecure = secureToggle && !visible;

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.row, error ? styles.rowError : null]}>
        <TextInput
          style={[styles.input, style as any]}
          placeholderTextColor={colors.lightGray}
          secureTextEntry={isSecure}
          autoCapitalize="none"
          {...props}
        />
        {secureToggle && (
          <TouchableOpacity onPress={() => setVisible((v) => !v)} style={styles.eye}>
            <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.lightGray} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.gray, marginBottom: spacing.xs, letterSpacing: 0.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.white },
  rowError: { borderColor: colors.error },
  input: { flex: 1, height: 48, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: 15, color: colors.black },
  eye: { paddingHorizontal: spacing.md },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.error, marginTop: 4 },
});
