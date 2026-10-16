import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";
export function Loading() {
  return (
    <div role="status" className="empty">
      <LoaderCircle className="animate-spin" size={24} /> Loading library
      records…
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="notice danger">
      <AlertCircle size={18} />
      {message}
    </div>
  ) : null;
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`badge ${["approved", "available", "good", "active", "fulfilled"].includes(value) ? "green" : ["overdue", "rejected", "damaged", "suspended", "lost"].includes(value) ? "red" : "amber"}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  required = false,
  maxLength = 500,
  min,
  max,
  children,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {children ?? (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          min={min}
          max={max}
        />
      )}
    </label>
  );
}
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
const NotifyContext = createContext<(s: string) => void>(() => {});
export const useNotify = () => useContext(NotifyContext);
export function Notifications({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  return (
    <NotifyContext.Provider value={(s) => setMessage(s)}>
      {children}
      {message && (
        <div role="status" className="toast">
          <CheckCircle2 size={20} />
          {message}
          <button
            aria-label="Dismiss notification"
            className="icon-button"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </NotifyContext.Provider>
  );
}
export function useAction(refresh?: () => void | Promise<void>) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const notify = useNotify();
  return {
    busy,
    error,
    run: async (action: () => Promise<unknown>, message: string) => {
      setBusy(true);
      setError("");
      try {
        await action();
        notify(message);
        await refresh?.();
        return true;
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "The action failed. Please try again.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
  };
}
export function submit(handler: (data: FormData) => Promise<unknown>) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handler(
      new FormData(
        event.currentTarget,
        (event.nativeEvent as SubmitEvent).submitter,
      ),
    );
  };
}
export const textValue = (data: FormData, key: string) =>
  String(data.get(key) ?? "");
export function Confirm({
  title,
  children,
  onConfirm,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <div className="muted">{children}</div>
      <div className="actions">
        <button onClick={onClose} disabled={busy} className="button secondary">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={busy} className="button">
          {busy ? "Saving…" : "Confirm"}
        </button>
      </div>
    </dialog>
  );
}
