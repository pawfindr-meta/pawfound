import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function ProtectedRoute({ children, requireAdmin }) {
  const { currentUser, userData, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-charcoal text-ivory">Authenticating...</div>;
  }

  // Not logged in or no database profile found
  if (!currentUser || !userData) {
    return <Navigate to="/login" replace />;
  }

  // Admin route protection
  if (requireAdmin && userData.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // Approval Gate: Force sign-out if a pending user tries to log in
  if (userData.role === 'owner' && !userData.is_approved) {
    signOut(auth);
    alert("Access Denied: Your account is pending Master Admin approval.");
    return <Navigate to="/login" replace />;
  }

  return children;
}