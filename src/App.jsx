import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/useAuth";
import { NotificationsProvider } from "./context/NotificationsProvider";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Home from "./pages/Home";
import PlaceBoard from "./pages/PlaceBoard";
import Compose from "./pages/Compose";
import StoryPage from "./pages/StoryPage";
import MyKatha from "./pages/MyKatha";
import Messages from "./pages/Messages";
import Profile from "./pages/Profile";

function Spinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-lamp border-t-transparent" />
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user && profile) return <Navigate to="/" replace />;
  if (user && !profile) return <Navigate to="/onboarding" replace />;
  return children;
}

function RequireOnboarding({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to="/" replace />;
  return children;
}

const signedIn = (page) => <RequireAuth>{page}</RequireAuth>;

export default function App() {
  return (
    <BrowserRouter>
      <NotificationsProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
          <Route path="/onboarding" element={<RequireOnboarding><Onboarding /></RequireOnboarding>} />
          <Route path="/" element={signedIn(<Home />)} />
          <Route path="/place/:id" element={signedIn(<PlaceBoard />)} />
          <Route path="/compose" element={signedIn(<Compose />)} />
          <Route path="/story/:id" element={signedIn(<StoryPage />)} />
          <Route path="/me" element={signedIn(<MyKatha />)} />
          <Route path="/messages" element={signedIn(<Messages />)} />
          <Route path="/messages/:id" element={signedIn(<Messages />)} />
          <Route path="/profile" element={signedIn(<Profile />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NotificationsProvider>
    </BrowserRouter>
  );
}
