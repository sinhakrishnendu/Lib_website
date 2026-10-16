import { useEffect, useState } from "react";
import { allRows, rpc } from "../lib/supabase";
import { date, type Audit, type Profile, type Settings } from "../lib/types";
import type { StaffEntry } from "../lib/workspace";
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
export function Admin({ view = "roles" }: { view?: string }) {
  const [profiles, setProfiles] = useState<Profile[]>([]),
    [roles, setRoles] = useState<StaffEntry[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [audit, setAudit] = useState<Audit[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  const [decision, setDecision] = useState<{
    title: string;
    body: string;
    action: () => Promise<unknown>;
  } | null>(null);
  async function refresh() {
    setError("");
    try {
      if (view === "roles") {
        const [p, r] = await Promise.all([
          allRows<Profile>("profiles"),
          allRows<StaffEntry>("staff_roles"),
        ]);
        setProfiles(p);
        setRoles(r);
      }
      if (view === "settings")
        setSettings((await allRows<Settings>("system_settings"))[0]);
      if (view === "audit")
        setAudit(
          (await allRows<Audit>("audit_events")).sort((a, b) => b.id - a.id),
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [view]);
  const action = useAction(refresh);
  if (loading) return <Loading />;
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION"
        title={
          view === "roles"
            ? "Staff access"
            : view === "settings"
              ? "Library policies"
              : "Audit history"
        }
      />
      <ErrorBox message={error || action.error} />
      {view === "roles" && (
        <>
          <div className="panel">
            <h2>Appoint a librarian or administrator</h2>
            <p className="muted">
              Staff must first register an account. Grant access only after
              independently verifying their identity. Administrator access
              includes staff appointments and policy changes.
            </p>
            <form
              className="form-grid"
              onSubmit={submit(async (d) => {
                const id = textValue(d, "user"),
                  role = textValue(d, "role");
                setDecision({
                  title: "Change staff access?",
                  body: `${profiles.find((p) => p.id === id)?.full_name}: ${role || "remove all staff access"}. The change takes effect on the next database operation.`,
                  action: () =>
                    rpc("set_staff_role", {
                      p_user_id: id,
                      p_role: role || null,
                    }),
                });
              })}
            >
              <Field label="Registered account" name="user">
                <select name="user" required defaultValue="">
                  <option value="" disabled>
                    Select verified account
                  </option>
                  {profiles.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.full_name} · {p.email} · {p.student_id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Access level" name="role">
                <select name="role">
                  <option value="librarian">Librarian</option>
                  <option value="admin">Administrator</option>
                  <option value="">Revoke staff access</option>
                </select>
              </Field>
              <div className="actions">
                <button className="button" disabled={action.busy}>
                  Review access change
                </button>
              </div>
            </form>
          </div>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Role</th>
                  <th>Granted</th>
                  <th>Granted by</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.user_id}>
                    <td>
                      {profiles.find((p) => p.id === r.user_id)?.full_name}
                      <small>
                        {profiles.find((p) => p.id === r.user_id)?.email}
                      </small>
                    </td>
                    <td>
                      <Badge value={r.role} />
                    </td>
                    <td>{date(r.granted_at)}</td>
                    <td>
                      {profiles.find((p) => p.id === r.granted_by)?.full_name ||
                        "Initial bootstrap"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {view === "settings" && settings && (
        <div className="panel narrow">
          <h2>Borrowing & reservation policies</h2>
          <p className="muted">
            These initial defaults are configurable starting values, not
            verified departmental policy. Existing due dates and reservation
            deadlines do not change when a policy is updated.
          </p>
          <form
            onSubmit={submit(async (d) => {
              const args = Object.fromEntries(
                [
                  "max_active_loans",
                  "loan_days",
                  "reservation_hours",
                  "max_active_requests",
                ].map((k) => ["p_" + k, Number(d.get(k))]),
              );
              setDecision({
                title: "Update library policies?",
                body: "New transactions will use these values. Existing loans and reservations keep their recorded deadlines.",
                action: () => rpc("update_settings", args),
              });
            })}
          >
            <Field
              label="Maximum active loans (including approved reservations)"
              name="max_active_loans"
              type="number"
              defaultValue={settings.max_active_loans}
              required
              min={1}
              max={50}
            />
            <Field
              label="Default loan period (days)"
              name="loan_days"
              type="number"
              defaultValue={settings.loan_days}
              required
              min={1}
              max={365}
            />
            <Field
              label="Reservation collection period (hours)"
              name="reservation_hours"
              type="number"
              defaultValue={settings.reservation_hours}
              required
              min={1}
              max={720}
            />
            <Field
              label="Maximum open requests per student"
              name="max_active_requests"
              type="number"
              defaultValue={settings.max_active_requests}
              required
              min={1}
              max={50}
            />
            <button className="button" disabled={action.busy}>
              Review policy changes
            </button>
          </form>
        </div>
      )}
      {view === "audit" && (
        <>
          <label className="field">
            <span>Search operation, entity, account ID or record ID</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time / actor</th>
                  <th>Operation</th>
                  <th>Record</th>
                  <th>Change details</th>
                </tr>
              </thead>
              <tbody>
                {audit
                  .filter((e) =>
                    [e.operation, e.entity_type, e.entity_id, e.actor_id]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((e) => (
                    <tr key={e.id}>
                      <td>
                        {date(e.event_time)}
                        <small>
                          {e.actor_id || "Trusted database operation"}
                        </small>
                      </td>
                      <td>{e.operation}</td>
                      <td>
                        {e.entity_type}
                        <small>{e.entity_id}</small>
                      </td>
                      <td>
                        <details>
                          <summary>Before / after</summary>
                          <pre>{JSON.stringify(e.details, null, 2)}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!audit.length && (
              <Empty>Important record changes will appear here.</Empty>
            )}
          </div>
        </>
      )}
      {decision && (
        <Confirm
          title={decision.title}
          busy={action.busy}
          onClose={() => setDecision(null)}
          onConfirm={() =>
            void action
              .run(decision.action, "Administration change saved.")
              .then((ok) => {
                if (ok) setDecision(null);
              })
          }
        >
          {decision.body}
          <ErrorBox message={action.error} />
        </Confirm>
      )}
    </>
  );
}
