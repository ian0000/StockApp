import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type PlaceholderScreenProps = PropsWithChildren<{
  subtitle?: string;
  title: string;
}>;

export function PlaceholderScreen({
  children,
  subtitle,
  title,
}: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    gap: 20,
    marginTop: 28,
    maxWidth: 360,
    width: '100%',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
});
