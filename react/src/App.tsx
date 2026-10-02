import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ThemeProvider } from './context/ThemeContext';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RegisterPage } from './pages/RegisterPage';
import { TopupPage } from './pages/TopupPage';
import { TransferPage } from './pages/TransferPage';

/**
 * Routes.
 *
 * Public: /login and /register. Protected (inside the dashboard chrome): the overview at /, plus the
 * two screens that move money. Anything else is a 404 page. The layout is applied per route so the
 * signed-out screens are not wrapped in dashboard chrome.
 *
 * Every protected screen is guarded by the same `ProtectedRoute`; which wallet the money comes from is
 * never a route question — the API takes it from the bearer token.
 *
 * The theme provider wraps the routes here (rather than in main.tsx) so that every screen — the signed-out
 * ones included — can offer the toggle, and so a test that renders `<App />` gets the same wiring the
 * browser does.
 */
export function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/topup"
          element={
            <ProtectedRoute>
              <AppLayout>
                <TopupPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transfer"
          element={
            <ProtectedRoute>
              <AppLayout>
                <TransferPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route
          path="*"
          element={
            <AppLayout>
              <NotFoundPage />
            </AppLayout>
          }
        />
      </Routes>
    </ThemeProvider>
  );
}
