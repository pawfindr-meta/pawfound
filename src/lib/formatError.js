const AUTH_MESSAGES = {
  'auth/invalid-credential': 'Wrong email or password. Try again.',
  'auth/invalid-email': 'That email address does not look valid.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Wrong email or password. Try again.',
  'auth/email-already-in-use': 'That email is already registered. Sign in instead.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'Network hiccup. Check your connection.',
};

export function formatAuthError(error) {
  const code = error?.code;
  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  if (typeof error?.message === 'string' && !error.message.includes('Firebase')) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
