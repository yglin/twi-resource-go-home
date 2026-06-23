import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getDocument } from './services/firestoreService';
import { UserProfile } from './types';
import { Toaster } from '@/components/ui/sonner';

// Pages (will create these next)
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import MakerDashboard from './pages/MakerDashboard';
import GoingHomeDashboard from './pages/GoingHomeDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ProfileSetup from './pages/ProfileSetup';
import Unauthorized from './pages/Unauthorized';
import MakerScenarios from './pages/MakerScenarios';
import RayScenarios from './pages/RayScenarios';

// Recycle Contract Pages
import ContractDashboard from './pages/contract/ContractDashboard';
import NewRecycleContract from './pages/contract/NewRecycleContract';
import ContractDetails from './pages/contract/ContractDetails';
import { evaluateAndGenerateScheduledRecords } from './services/contractService';

const AuthContext = React.createContext<{
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
  refreshProfile: async () => {},
});

export const useAuth = () => React.useContext(AuthContext);

const ProtectedRoute = ({ children, roles }: { children: React.ReactNode; roles?: string[] }) => {
  const { user, profile, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="h-screen w-screen flex items-center justify-center">Loading...</div>;

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Handle Admin access first
  if (roles?.includes('SYSTEM_ADMIN')) {
    if (!isAdmin) return <Navigate to="/unauthorized" replace />;
    return <>{children}</>;
  }

  if (profile && !profile.roles?.length && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  // Profile Integrity Check (Scenarios 7 & 8)
  const isProfileIncomplete = () => {
    if (!profile) return false;

    // Check basic info
    if (!profile.displayName) return true;

    // Role-specific required fields
    if (profile.roles.includes('MAKER_FISH')) {
      if (!profile.address || !profile.phoneNumber || !profile.coordinates) return true;
    }
    if (profile.roles.includes('GOING_HOME') || profile.roles.includes('RECYCLER')) {
      const hasLocation = profile.address && profile.phoneNumber && profile.coordinates;
      const hasCategories = profile.acceptedCategories && profile.acceptedCategories.length > 0;
      const hasGuides = profile.recoveryGuides && profile.recoveryGuides.length === profile.acceptedCategories?.length;
      
      if (!hasLocation || !hasCategories || !hasGuides) return true;
    }

    return false;
  };

  if (profile && isProfileIncomplete() && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  if (roles && profile) {
    const hasRole = roles.some(role => profile.roles.includes(role as any));
    if (!hasRole) return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string, email: string | null, googleUser?: User) => {
    let data = await getDocument<UserProfile>('users', uid);
    
    // Auto-sync if profile exists but lacks name/photo
    if (data && googleUser && (!data.displayName || !data.photoURL)) {
      const updates = {
        displayName: data.displayName || googleUser.displayName || email?.split('@')[0] || '使用者',
        photoURL: data.photoURL || googleUser.photoURL || '',
      };
      await setDoc(doc(db, 'users', uid), updates, { merge: true });
      data = { ...data, ...updates };
    }

    // Check admin status
    let adminStatus = false;
    try {
      const adminDoc = await getDocument('admins', uid);
      if (adminDoc) {
        adminStatus = true;
      } else {
        const configAdmins = await getDocument<{ emails: string[] }>('config', 'admins');
        if (configAdmins?.emails?.includes(email || '')) {
          adminStatus = true;
        }
      }
    } catch (e) {
      // If the collections don't exist yet or permission denied, they are not admin
      console.warn('Admin check skipped or failed', e);
    }
    
    setProfile(data);
    setIsAdmin(adminStatus);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      try {
        setUser(u);
        if (u) {
          await fetchProfile(u.uid, u.email, u);
          // Run background scheduled evaluations silently
          evaluateAndGenerateScheduledRecords().catch(err => console.error("Scheduler Error:", err));
        } else {
          setProfile(null);
          setIsAdmin(false);
        }
      } catch (err) {
        console.error('Error fetching auth data:', err);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.uid, user.email, user);
  };

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loading, refreshProfile }}>
      <Router>
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="/maker-scenarios" element={<MakerScenarios />} />
            <Route path="/ray-scenarios" element={<RayScenarios />} />
            
            <Route path="/setup" element={
              <ProtectedRoute>
                <ProfileSetup />
              </ProtectedRoute>
            } />

            <Route path="/maker/*" element={
              <ProtectedRoute roles={['MAKER_FISH']}>
                <MakerDashboard />
              </ProtectedRoute>
            } />

            <Route path="/going-home/*" element={
              <ProtectedRoute roles={['GOING_HOME', 'RECYCLER']}>
                <GoingHomeDashboard />
              </ProtectedRoute>
            } />

            <Route path="/admin/*" element={
              <ProtectedRoute roles={['SYSTEM_ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />

            {/* Recycle Contract Routes */}
            <Route path="/recycleContract" element={
              <ProtectedRoute>
                <ContractDashboard />
              </ProtectedRoute>
            } />
            <Route path="/newRecycleContract" element={
              <ProtectedRoute roles={['GOING_HOME']}>
                <NewRecycleContract />
              </ProtectedRoute>
            } />
            <Route path="/recycleContract/:id" element={
              <ProtectedRoute>
                <ContractDetails />
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
      <Toaster position="top-center" richColors />
    </AuthContext.Provider>
  );
}
