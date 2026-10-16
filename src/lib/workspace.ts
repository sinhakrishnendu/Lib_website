import { useEffect, useState } from "react";
import { allRows, rpc } from "./supabase";
import type {
  Audit,
  Book,
  Copy,
  Loan,
  Profile,
  Request,
  Settings,
} from "./types";
export type LabeledRequest = Request & {
  title: string;
  accession_number: string;
  book_id: string;
};
export type LabeledLoan = Loan & {
  title: string;
  accession_number: string;
  book_id: string;
};
export function useStudentRecords() {
  const [data, setData] = useState<{
      requests: LabeledRequest[];
      loans: LabeledLoan[];
    }>({ requests: [], loans: [] }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function refresh() {
    setError("");
    try {
      setData(await rpc("my_circulation"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return { ...data, loading, error, refresh };
}
export type Workspace = {
  profiles: Profile[];
  books: Book[];
  copies: Copy[];
  requests: Request[];
  loans: Loan[];
  settings: Settings[];
};
export function useWorkspace() {
  const [data, setData] = useState<Workspace>({
      profiles: [],
      books: [],
      copies: [],
      requests: [],
      loans: [],
      settings: [],
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function refresh() {
    setError("");
    try {
      const [profiles, books, copies, requests, loans, settings] =
        await Promise.all([
          allRows<Profile>("profiles"),
          allRows<Book>("books"),
          allRows<Copy>("book_copies"),
          allRows<Request>("book_requests"),
          allRows<Loan>("loans"),
          allRows<Settings>("system_settings"),
        ]);
      setData({ profiles, books, copies, requests, loans, settings });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return { ...data, loading, error, refresh };
}
export type StaffEntry = {
  user_id: string;
  role: string;
  granted_by: string;
  granted_at: string;
};
export type { Audit };
