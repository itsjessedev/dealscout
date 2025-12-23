import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

interface LoginScreenProps {
  onSkip?: () => void;
}

export default function LoginScreen({ onSkip }: LoginScreenProps) {
  const { login, isLoading } = useAuth();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async () => {
    setIsAuthenticating(true);
    try {
      const authUrl = await login();
      await Linking.openURL(authUrl);
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert(
        'Authentication Error',
        'Failed to start eBay login. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4ecca3" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo/Branding */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>💎</Text>
          <Text style={styles.logoText}>DealScout</Text>
          <Text style={styles.tagline}>Find profitable flips</Text>
        </View>

        {/* Login Button */}
        <TouchableOpacity
          style={[styles.loginButton, isAuthenticating && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isAuthenticating}
        >
          {isAuthenticating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.loginButtonText}>Sign in with eBay</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          We use eBay authentication to verify your account and provide personalized deal recommendations.
        </Text>

        {onSkip && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipButtonText}>Skip for Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '80%',
    maxWidth: 400,
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  loginButton: {
    backgroundColor: '#4ecca3',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 16,
  },
  skipButton: {
    marginTop: 24,
    padding: 12,
  },
  skipButtonText: {
    color: '#666',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
