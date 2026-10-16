import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { db } from "./supabase";
import type { Profile, StaffRole } from "./types";
type Auth = {
  session: Session | null;
  profile: Profile | null;
  role: StaffRole;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};
const Context = createContext<Auth>({
  session: null,
  profile: null,
  role: null,
  loading: true,
  error: "",
  refresh: async () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [role, setRole] = useState<StaffRole>(null),
    [loading, setLoading] = useState(!!db),
    [error, setError] = useState("");
  const generation = useRef(0);
  async function load(s: Session | null) {
    const current = ++generation.current;
    setError("");
    setProfile(null);
    setRole(null);
    if (!db || !s) {
      setLoading(false);
      return;
    }
    try {
      const [p, r] = await Promise.all([
        db.from("profiles").select("*").eq("id", s.user.id).single(),
        db
          .from("staff_roles")
          .select("role")
          .eq("user_id", s.user.id)
          .maybeSingle(),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      if (current !== generation.current) return;
      setProfile(p.data);
      setRole(r.data?.role ?? null);
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Unable to load membership.");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  async function refresh() {
    if (db) {
      const { data } = await db.auth.getSession();
      setSession(data.session);
      await load(data.session);
    }
  }
  useEffect(() => {
    if (!db) return;
    let active = true;
    db.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setSession(data.session);
      void load(data.session);
    });
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      setSession(s);
      setLoading(true);
      setTimeout(() => {
        if (active) void load(s);
      }, 0);
    });
    return () => {
      active = false;
      ++generation.current;
      subscription.unsubscribe();
    };
  }, []);
  return (
    <Context.Provider
      value={{ session, profile, role, loading, error, refresh }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
