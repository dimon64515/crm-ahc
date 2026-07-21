import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import WorkFormPage from './pages/WorkFormPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import WorkDetailPage from './pages/WorkDetailPage';
import PhotoBackupPage from './pages/PhotoBackupPage';
import MyWorksPage from './pages/MyWorksPage';
import RequestNewPage from './pages/RequestNewPage';
import RequestsListPage from './pages/RequestsListPage';
import RequestDetailPage from './pages/RequestDetailPage';
import MyRequestsPage from './pages/MyRequestsPage';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Загрузка...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'comendant') return <Navigate to="/requests/new" />;
    return user.role === 'contractor' ? <Navigate to="/works/new" /> : <Navigate to="/dashboard" />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/works/new"
        element={
          <ProtectedRoute allowedRoles={['contractor', 'director', 'admin']}>
            <Layout>
              <WorkFormPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={['director', 'admin']}>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/works/:id"
        element={
          <ProtectedRoute allowedRoles={['contractor', 'director', 'admin']}>
            <Layout>
              <WorkDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Layout>
              <SettingsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/photo-backup"
        element={
          <ProtectedRoute allowedRoles={['director', 'admin']}>
            <Layout>
              <PhotoBackupPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-works"
        element={
          <ProtectedRoute allowedRoles={['contractor', 'director', 'admin']}>
            <Layout>
              <MyWorksPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/requests/new"
        element={
          <ProtectedRoute allowedRoles={['comendant']}>
            <Layout>
              <RequestNewPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/requests"
        element={
          <ProtectedRoute allowedRoles={['contractor', 'director', 'admin']}>
            <Layout fullWidth>
              <RequestsListPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/requests/:id"
        element={
          <ProtectedRoute allowedRoles={['comendant', 'contractor', 'director', 'admin']}>
            <Layout>
              <RequestDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-requests"
        element={
          <ProtectedRoute allowedRoles={['comendant']}>
            <Layout>
              <MyRequestsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/login" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
