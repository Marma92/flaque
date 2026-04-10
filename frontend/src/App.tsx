import { requestPasswordReset, resetPasswordWithToken } from "./api";
import { AuthenticatedApp } from "./AuthenticatedApp";
import { LoginPage } from "./components/LoginPage";
import { useSessionRoutingState } from "./hooks/useSessionRoutingState";

export default function App(): JSX.Element {
  const {
    user, setUser,
    sessionChecked,
    activeView, setActiveView,
    activeLibrarySection, setActiveLibrarySection,
    activeConfigSection, setActiveConfigSection,
    handleLogin, notifyAuthStateChanged
  } = useSessionRoutingState();

  if (!sessionChecked) {
    return <main className="p-8 text-flaque-ink">Loading session...</main>;
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onRequestPasswordReset={requestPasswordReset}
        onResetPassword={resetPasswordWithToken}
      />
    );
  }

  return (
    <AuthenticatedApp
      user={user}
      setUser={setUser}
      activeView={activeView}
      setActiveView={setActiveView}
      activeLibrarySection={activeLibrarySection}
      setActiveLibrarySection={setActiveLibrarySection}
      activeConfigSection={activeConfigSection}
      setActiveConfigSection={setActiveConfigSection}
      notifyAuthStateChanged={notifyAuthStateChanged}
    />
  );
}
