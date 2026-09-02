import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import OwnerDashboard from './pages/OwnerDashboard';
import PendingApproval from './pages/PendingApproval';
import ScreenLoader from './components/ui/ScreenLoader';

function ProtectedRoute({ children, allowedRole }) {
  const { currentUser, userData, loading } = useAuth();

  if (loading) {
    return <ScreenLoader message="Signing you in…" />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!userData) {
    return <ScreenLoader message="Checking your account…" />;
  }

  if (userData.role === 'owner' && !userData.is_approved) {
    return <Navigate to="/pending" replace />;
  }

  if (allowedRole && userData.role !== allowedRole) {
    return <Navigate to={userData.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }

  return children;
}

function PendingRoute() {
  const { currentUser, userData, loading } = useAuth();

  if (loading) return <ScreenLoader />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userData?.role === 'admin') return <Navigate to="/admin" replace />;
  if (userData?.role === 'owner' && userData.is_approved) return <Navigate to="/dashboard" replace />;
  return <PendingApproval />;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster
        position="top-center"
        richColors
        toastOptions={{
          className: 'font-sans',
          duration: 5000,
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/pending" element={<PendingRoute />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRole="owner">
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
