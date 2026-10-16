import { useEffect, useState, type ReactNode } from "react";
import {
  HashRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  BookOpen,
  ArrowUpRight,
  Menu,
  LogOut,
  UserRound,
  X,
} from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth";
import { configured, db } from "./lib/supabase";
import { AuthPage, Catalogue, Home } from "./components/public";
import { Student } from "./components/student";
import { Staff } from "./components/staff";
import { Admin } from "./components/admin";
import { ErrorBox, Loading, Notifications } from "./components/ui";
function Gate({
  staff = false,
  admin = false,
  children,
}: {
  staff?: boolean;
  admin?: boolean;
  children: ReactNode;
}) {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (!auth.session) return <Navigate to="/login" replace />;
  if ((staff && !auth.role) || (admin && auth.role !== "admin"))
    return (
      <div className="panel">
        <h1>Access restricted</h1>
        <p>
          This page requires {admin ? "administrator" : "librarian"} access.
        </p>
        <Link to="/student">Return to my library</Link>
      </div>
    );
  if (auth.error) return <ErrorBox message={auth.error} />;
  return <>{children}</>;
}
const studentLinks = [
  ["/student", "Overview"],
  ["/student/requests", "My requests"],
  ["/student/loans", "Active loans"],
  ["/student/history", "History"],
  ["/student/profile", "My profile"],
];
const staffLinks = [
  ["/staff", "Overview"],
  ["/staff/members", "Memberships"],
  ["/staff/requests", "Requests"],
  ["/staff/checkout", "Checkout"],
  ["/staff/checkin", "Check-in"],
  ["/staff/loans", "Active & overdue"],
  ["/staff/catalogue", "Catalogue"],
  ["/staff/import", "CSV import"],
  ["/staff/reports", "Reports"],
];
const adminLinks = [
  ["/admin/roles", "Staff access"],
  ["/admin/settings", "Policies"],
  ["/admin/audit", "Audit history"],
];
function Layout() {
  const auth = useAuth(),
    location = useLocation();
  const [menu, setMenu] = useState(false),
    [logoutError, setLogoutError] = useState("");
  const section = location.pathname.split("/")[1];
  const workspace = ["student", "staff", "admin"].includes(section);
  const links =
    section === "admin"
      ? adminLinks
      : section === "staff"
        ? staffLinks
        : studentLinks;
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!db) return;
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") window.location.hash = "/password";
    });
    return () => subscription.unsubscribe();
  }, []);
  return (
    <>
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="institution-bar">
        <div>SIKSHA-BHAVANA, VISVA-BHARATI</div>
        <span>Santiniketan, West Bengal, India</span>
      </div>
      <header>
        <div className="header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <BookOpen size={28} strokeWidth={1.4} />
            </span>
            <span>
              Zoology Department<small>LIBRARY MANAGEMENT SYSTEM</small>
            </span>
          </Link>
          <button
            className="icon-button mobile-menu"
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <nav aria-label="Main navigation" className={menu ? "open" : ""}>
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/catalogue">Catalogue</NavLink>
            {auth.session ? (
              <>
                <NavLink to="/student">My library</NavLink>
                {auth.role && <NavLink to="/staff">Librarian</NavLink>}
                {auth.role === "admin" && (
                  <NavLink to="/admin/roles">Admin</NavLink>
                )}
                <button
                  className="button secondary small-button"
                  onClick={() => {
                    setLogoutError("");
                    void db?.auth.signOut().then(({ error }) => {
                      if (error) setLogoutError(error.message);
                    });
                  }}
                >
                  <LogOut size={16} /> Sign out
                </button>
              </>
            ) : (
              <Link className="button secondary" to="/login">
                <UserRound size={16} /> Sign in <ArrowUpRight size={15} />
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={workspace ? "workspace-main" : ""}
      >
        {!configured && (
          <div className="setup-banner">
            <span className="setup-dot" />
            <span>
              Local setup · Connect Supabase to enable the live catalogue and
              account services.{" "}
              <a
                href="https://github.com/supabase/supabase"
                target="_blank"
                rel="noreferrer"
              >
                Supabase
              </a>
            </span>
          </div>
        )}
        <ErrorBox message={logoutError} />
        {workspace && (
          <nav className="workspace-nav" aria-label="Workspace navigation">
            {links.map(([path, label]) => (
              <NavLink key={path} to={path} end>
                {label}
              </NavLink>
            ))}
          </nav>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/books/:id" element={<Catalogue detail />} />
          {(["login", "register", "reset", "password"] as const).map((mode) => (
            <Route
              key={mode}
              path={"/" + mode}
              element={<AuthPage key={mode} mode={mode} />}
            />
          ))}
          <Route
            path="/student"
            element={
              <Gate>
                <Student />
              </Gate>
            }
          />
          {["requests", "loans", "history", "profile"].map((v) => (
            <Route
              key={v}
              path={"/student/" + v}
              element={
                <Gate>
                  <Student key={v} view={v} />
                </Gate>
              }
            />
          ))}
          <Route
            path="/staff"
            element={
              <Gate staff>
                <Staff />
              </Gate>
            }
          />
          {[
            "members",
            "requests",
            "checkout",
            "checkin",
            "loans",
            "catalogue",
            "import",
            "reports",
          ].map((v) => (
            <Route
              key={v}
              path={"/staff/" + v}
              element={
                <Gate staff>
                  <Staff key={v} view={v} />
                </Gate>
              }
            />
          ))}
          {["roles", "settings", "audit"].map((v) => (
            <Route
              key={v}
              path={"/admin/" + v}
              element={
                <Gate admin>
                  <Admin key={v} view={v} />
                </Gate>
              }
            />
          ))}
          <Route
            path="*"
            element={
              <div className="panel">
                <h1>Page not found</h1>
                <Link to="/catalogue">Browse the catalogue</Link>
              </div>
            }
          />
        </Routes>
      </main>
      <footer>
        <div>
          <BookOpen size={20} />
          <span>Zoology Department Library</span>
        </div>
        <p>Department of Zoology · Siksha-Bhavana · Visva-Bharati</p>
        <span>Find. Learn. Discover.</span>
      </footer>
    </>
  );
}
export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Notifications>
          <Layout />
        </Notifications>
      </AuthProvider>
    </HashRouter>
  );
}
