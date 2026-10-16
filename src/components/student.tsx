import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, ArrowUpRight, History } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useStudentRecords } from "../lib/workspace";
import { rpc } from "../lib/supabase";
import { date, effectiveStatus, isOverdue } from "../lib/types";
import {
  Badge,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  Loading,
  PageTitle,
  submit,
  textValue,
  useAction,
} from "./ui";
export function Student({ view = "dashboard" }: { view?: string }) {
  const auth = useAuth();
  const data = useStudentRecords();
  const action = useAction(data.refresh);
  const [cancel, setCancel] = useState<string | null>(null);
  if (data.loading) return <Loading />;
  const active = data.loans.filter((l) => !l.returned_at),
    history = data.loans.filter((l) => l.returned_at),
    pending = data.requests.filter((r) =>
      ["pending", "approved"].includes(effectiveStatus(r)),
    );
  return (
    <>
      <PageTitle
        eyebrow="MY LIBRARY"
        title={
          (
            {
              dashboard: `Welcome, ${auth.profile?.full_name.split(" ")[0] || "reader"}`,
              requests: "My requests",
              loans: "My active loans",
              history: "Borrowing history",
              profile: "My profile",
            } as Record<string, string>
          )[view] || "My library"
        }
      >
        <Link className="button secondary" to="/catalogue">
          Browse catalogue <ArrowUpRight size={16} />
        </Link>
      </PageTitle>
      <ErrorBox message={data.error || action.error} />
      {auth.profile?.account_status !== "approved" && (
        <div className="notice">
          Membership status:{" "}
          <Badge value={auth.profile?.account_status || "pending"} />
          <span>
            You can browse now. Borrowing begins after email verification and
            librarian approval.
          </span>
        </div>
      )}
      {view === "dashboard" && (
        <>
          <div className="stats">
            <Link to="/student/loans">
              <BookOpen />
              <strong>{active.length}</strong>
              <span>Books with you</span>
            </Link>
            <Link to="/student/requests">
              <Clock />
              <strong>{pending.length}</strong>
              <span>Open requests</span>
            </Link>
            <Link to="/student/history">
              <History />
              <strong>{history.length}</strong>
              <span>Books returned</span>
            </Link>
          </div>
          <h2>Due dates at a glance</h2>
        </>
      )}
      {["dashboard", "loans", "history"].includes(view) && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Book / accession</th>
                <th>Issued</th>
                <th>{view === "history" ? "Returned" : "Due date"}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(view === "history" ? history : active).map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link to={"/books/" + l.book_id}>{l.title}</Link>
                    <small className="accession">{l.accession_number}</small>
                  </td>
                  <td>{date(l.checkout_at)}</td>
                  <td>{date(view === "history" ? l.returned_at : l.due_at)}</td>
                  <td>
                    <Badge
                      value={
                        l.returned_at
                          ? "returned"
                          : isOverdue(l)
                            ? "overdue"
                            : "active"
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(view === "history" ? history : active).length && (
            <Empty>
              {view === "history"
                ? "Your returned books will appear here."
                : "No active loans. Explore the catalogue to find a book."}
            </Empty>
          )}
        </div>
      )}
      {view === "requests" && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Book / accession</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Collection deadline / note</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={"/books/" + r.book_id}>{r.title}</Link>
                    <small className="accession">{r.accession_number}</small>
                  </td>
                  <td>{date(r.requested_at)}</td>
                  <td>
                    <Badge value={effectiveStatus(r)} />
                  </td>
                  <td>
                    {r.expires_at && date(r.expires_at)}
                    <small>{r.review_note}</small>
                  </td>
                  <td>
                    {["pending", "approved"].includes(effectiveStatus(r)) && (
                      <button
                        className="button secondary"
                        disabled={action.busy}
                        onClick={() => setCancel(r.id)}
                      >
                        Cancel request
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.requests.length && (
            <Empty>
              No requests yet. Request an available copy from the catalogue.
            </Empty>
          )}
        </div>
      )}
      {view === "profile" && auth.profile && (
        <div className="panel narrow">
          <h2>Membership information</h2>
          <p className="muted">
            Changing your name, student ID, programme, or department returns
            your membership to the approval queue.
          </p>
          <p>Email: {auth.profile.email}</p>
          <form
            onSubmit={submit(async (d) => {
              await action.run(async () => {
                await rpc(
                  "update_my_profile",
                  Object.fromEntries(
                    [
                      "full_name",
                      "student_id",
                      "academic_programme",
                      "department",
                    ].map((k) => ["p_" + k, textValue(d, k)]),
                  ),
                );
                await auth.refresh();
              }, "Profile saved. Changed identity information requires approval.");
            })}
          >
            <Field
              label="Full name"
              name="full_name"
              defaultValue={auth.profile.full_name}
              required
              maxLength={150}
            />
            <Field
              label="Student ID / roll number"
              name="student_id"
              defaultValue={auth.profile.student_id}
              required
              maxLength={100}
            />
            <Field
              label="Academic programme"
              name="academic_programme"
              defaultValue={auth.profile.academic_programme}
              required
              maxLength={150}
            />
            <Field
              label="Department"
              name="department"
              defaultValue={auth.profile.department}
              required
              maxLength={150}
            />
            <button className="button" disabled={action.busy}>
              Save profile
            </button>
          </form>
          <Link className="text-link" to="/reset">
            Reset password
          </Link>
        </div>
      )}
      {cancel && (
        <Confirm
          title="Cancel this request?"
          onClose={() => setCancel(null)}
          busy={action.busy}
          onConfirm={() =>
            void action
              .run(
                () => rpc("cancel_request", { p_request_id: cancel }),
                "Request cancelled.",
              )
              .then((ok) => {
                if (ok) setCancel(null);
              })
          }
        >
          An approved reservation will be released so another student can
          request the copy.
        </Confirm>
      )}
    </>
  );
}
