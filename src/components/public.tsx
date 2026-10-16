import { useEffect, useState } from "react";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Search,
  CheckCircle2,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import { rpc, configured, client, authRedirect } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import type { CatalogueItem } from "../lib/types";
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  Loading,
  PageTitle,
  submit,
  textValue,
  useAction,
} from "./ui";
export function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">DEPARTMENT OF ZOOLOGY · SIKSHA-BHAVANA</p>
          <h1>
            A world of life.
            <br />
            <em>A library to explore it.</em>
          </h1>
          <p className="hero-description">
            Find your next reference, follow a new question, and make room for
            discovery. Your departmental library, now within reach.
          </p>
          <form
            action="#/catalogue"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q");
              window.location.hash =
                "/catalogue?q=" + encodeURIComponent(String(q ?? ""));
            }}
            className="hero-search"
          >
            <Search size={21} />
            <input
              name="q"
              aria-label="Search library catalogue"
              placeholder="Search titles, authors, or accession numbers"
            />
            <button className="button" type="submit">
              Search <ArrowRight size={18} />
            </button>
          </form>
          <p className="hero-note">
            <CheckCircle2 size={15} /> Browse freely. Sign in to request a book.
          </p>
        </div>
        <div className="specimen" aria-hidden="true">
          <span className="specimen-top">THE LIVING COLLECTION</span>
          <svg viewBox="0 0 360 320" fill="none">
            <g stroke="currentColor" strokeWidth="1.2">
              <path d="M181 269C175 223 180 178 175 115M175 161C145 142 119 114 106 70M177 190C210 166 231 135 242 88M178 221C140 208 111 186 84 155M179 241C216 225 244 205 264 177" />
              <path d="M174 138C132 134 111 104 106 70C141 78 163 100 174 138ZM179 177C218 156 239 121 242 88C207 100 186 134 179 177ZM170 210C127 211 95 184 84 155C127 153 159 177 170 210ZM184 234C226 237 253 210 264 177C224 180 192 201 184 234ZM174 113C150 87 152 52 171 25C191 57 191 90 174 113Z" />
              <path
                d="M106 70L173 138M242 88L179 177M84 155L170 210M264 177L184 234M171 25L174 113"
                strokeDasharray="2 3"
              />
              <ellipse cx="179" cy="286" rx="72" ry="5" opacity=".2" />
            </g>
          </svg>
          <div className="specimen-caption">
            <span>01 / A PLACE FOR CURIOSITY</span>
            <span>Explore. Learn. Return.</span>
          </div>
        </div>
      </section>
      <section className="home-intro">
        <div>
          <p className="eyebrow">YOUR LIBRARY, CONNECTED</p>
          <h2>
            More time with the books.
            <br />
            Less time finding them.
          </h2>
        </div>
        <p>
          Explore the catalogue before you visit. See which physical copies are
          available, request one online, and collect it from the librarian.
        </p>
        <Link to="/catalogue" className="text-link">
          Explore the catalogue <ArrowRight size={17} />
        </Link>
      </section>
      <div className="feature-grid">
        <article>
          <span className="step">01</span>
          <BookOpen />
          <h3>Find a reference</h3>
          <p>
            Search by title, author, subject, or the exact accession number.
          </p>
        </article>
        <article>
          <span className="step">02</span>
          <ShieldCheck />
          <h3>Request with confidence</h3>
          <p>
            After membership approval, request an available copy and follow its
            progress.
          </p>
        </article>
        <article>
          <span className="step">03</span>
          <MapPin />
          <h3>Collect at the library</h3>
          <p>
            The librarian verifies your identity, issues your book, and sets the
            due date.
          </p>
        </article>
      </div>
    </>
  );
}
export function Catalogue({ detail = false }: { detail?: boolean }) {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const [items, setItems] = useState<CatalogueItem[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const auth = useAuth();
  const action = useAction();
  const page = Math.max(0, Number(search.get("page")) || 0);
  useEffect(() => {
    let alive = true;
    if (!configured) return;
    setLoading(true);
    setError("");
    rpc<{ items: CatalogueItem[]; total: number }>("catalogue", {
      p_query: search.get("q") || "",
      p_author: search.get("author") || "",
      p_subject: search.get("subject") || "",
      p_available: search.get("available") === "true",
      p_book_id: detail ? id : null,
      p_limit: 24,
      p_offset: page * 24,
    })
      .then((d) => {
        if (alive) {
          setItems(d.items);
          setTotal(d.total);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [search, detail, id, page, action.busy]);
  return (
    <>
      <PageTitle
        eyebrow={detail ? "COLLECTION DETAIL" : "EXPLORE THE COLLECTION"}
        title={
          detail ? items[0]?.title || "Book details" : "The library catalogue"
        }
      >
        <span className="muted">Physical copies · Department of Zoology</span>
      </PageTitle>
      {!detail && (
        <form
          className="filter-bar"
          onSubmit={submit(async (d) => {
            const s = new URLSearchParams();
            for (const key of ["q", "author", "subject"])
              if (textValue(d, key)) s.set(key, textValue(d, key));
            if (d.has("available")) s.set("available", "true");
            setSearch(s);
          })}
        >
          <Field
            key={"q" + search.get("q")}
            label="Title, author, ISBN or accession"
            name="q"
            defaultValue={search.get("q") || ""}
          />
          <Field
            key={"author" + search.get("author")}
            label="Author"
            name="author"
            defaultValue={search.get("author") || ""}
          />
          <Field
            key={"subject" + search.get("subject")}
            label="Subject"
            name="subject"
            defaultValue={search.get("subject") || ""}
          />
          <label className="check">
            <input
              type="checkbox"
              name="available"
              defaultChecked={search.get("available") === "true"}
            />{" "}
            Available only
          </label>
          <button className="button">
            <Search size={17} /> Search
          </button>
        </form>
      )}
      <ErrorBox message={error || action.error} />
      {!configured ? (
        <Empty>
          The catalogue will be available once the department connects its
          Supabase project. No holdings have been added.
        </Empty>
      ) : loading ? (
        <Loading />
      ) : !items.length ? (
        <Empty>
          {detail
            ? "No copies found for this title."
            : "No copies match your search. Try another title or remove a filter."}
        </Empty>
      ) : (
        <>
          <div className="result-heading">
            <span>
              {total} {total === 1 ? "copy" : "copies"} found
            </span>
            <span>Accession numbers identify individual copies</span>
          </div>
          {detail && (
            <article className="panel book-description">
              <p className="eyebrow">{items[0].subject || "ZOOLOGY LIBRARY"}</p>
              <h2>{items[0].title}</h2>
              <p>{items[0].authors}</p>
              <p className="muted">
                {[
                  items[0].publisher,
                  items[0].edition,
                  items[0].publication_year,
                  items[0].isbn && `ISBN ${items[0].isbn}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p>{items[0].description}</p>
            </article>
          )}
          <div className="catalogue-grid">
            {items.map((item) => (
              <article className="book-card" key={item.copy_id}>
                <div className="book-icon">
                  <BookOpen size={28} />
                  <span>{item.subject || "REFERENCE"}</span>
                </div>
                <div className="book-card-content">
                  <Badge value={item.available ? "available" : "unavailable"} />
                  <h2>
                    <Link to={"/books/" + item.book_id}>{item.title}</Link>
                  </h2>
                  <p>{item.authors}</p>
                  <p className="muted small">
                    {[item.publisher, item.edition, item.publication_year]
                      .filter(Boolean)
                      .join(" · ") || "Publication details not recorded"}
                  </p>
                  <dl className="copy-meta">
                    <div>
                      <dt>Accession</dt>
                      <dd className="accession">{item.accession_number}</dd>
                    </div>
                    <div>
                      <dt>Shelf</dt>
                      <dd>{item.shelf_location || "Ask the librarian"}</dd>
                    </div>
                  </dl>
                  {detail && (
                    <p className="muted small">
                      ISBN: {item.isbn || "Not recorded"}
                    </p>
                  )}
                  {item.available &&
                    (auth.session ? (
                      <button
                        className="button secondary full"
                        disabled={
                          action.busy ||
                          auth.profile?.account_status !== "approved"
                        }
                        onClick={() =>
                          void action.run(
                            () =>
                              rpc("submit_request", {
                                p_copy_id: item.copy_id,
                              }),
                            "Request submitted. Await librarian review.",
                          )
                        }
                      >
                        {auth.profile?.account_status === "approved"
                          ? "Request this copy"
                          : "Membership approval required"}
                      </button>
                    ) : (
                      <Link className="text-link" to="/login">
                        Sign in to request <ArrowRight size={15} />
                      </Link>
                    ))}
                </div>
              </article>
            ))}
          </div>
          <div className="pagination">
            <button
              className="button secondary"
              disabled={page === 0}
              onClick={() =>
                setSearch((s) => {
                  s.set("page", String(page - 1));
                  return s;
                })
              }
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {Math.ceil(total / 24)}
            </span>
            <button
              className="button secondary"
              disabled={(page + 1) * 24 >= total}
              onClick={() =>
                setSearch((s) => {
                  s.set("page", String(page + 1));
                  return s;
                })
              }
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "reset" | "password";
}) {
  const navigate = useNavigate();
  const auth = useAuth();
  const action = useAction();
  const [sent, setSent] = useState(false);
  const title = {
    login: "Welcome back",
    register: "Join the library",
    reset: "Reset your password",
    password: "Choose a new password",
  }[mode];
  async function handle(d: FormData) {
    await action.run(
      async () => {
        const supa = client(),
          email = textValue(d, "email"),
          password = textValue(d, "password");
        if (mode === "register") {
          const { error } = await supa.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: authRedirect(),
              data: Object.fromEntries(
                [
                  "full_name",
                  "student_id",
                  "academic_programme",
                  "department",
                ].map((k) => [k, textValue(d, k).trim()]),
              ),
            },
          });
          if (error) throw error;
          setSent(true);
        } else if (mode === "reset") {
          const { error } = await supa.auth.resetPasswordForEmail(email, {
            redirectTo: authRedirect(),
          });
          if (error) throw error;
          setSent(true);
        } else if (mode === "password") {
          const { error } = await supa.auth.updateUser({ password });
          if (error) throw error;
          navigate("/student");
        } else {
          const { error } = await supa.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          await auth.refresh();
          navigate("/student");
        }
      },
      mode === "register"
        ? "Registration submitted. Verify your email, then await librarian approval."
        : mode === "reset"
          ? "If an account exists, a reset link has been requested."
          : mode === "password"
            ? "Password updated."
            : "Signed in.",
    );
  }
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <p className="eyebrow">ZOOLOGY DEPARTMENT LIBRARY</p>
        <h1>
          {mode === "register"
            ? "Your next chapter starts here."
            : "A place for your next question."}
        </h1>
        <p>
          Department of Zoology
          <br />
          Siksha-Bhavana, Visva-Bharati
          <br />
          Santiniketan, West Bengal, India
        </p>
        <BookOpen size={60} strokeWidth={1} />
      </div>
      <div className="panel auth-panel">
        <h2>{title}</h2>
        <p className="muted">
          {mode === "register"
            ? "Create a student account. Email verification and librarian approval are both required before borrowing."
            : mode === "password"
              ? "Use at least 12 characters for your new password."
              : "Use the email address associated with your library account."}
        </p>
        <ErrorBox message={action.error} />
        {sent ? (
          <div role="status" className="notice">
            {mode === "register"
              ? "Check your email to verify your account. You can then sign in to follow your approval status."
              : "Check your email for further instructions."}
          </div>
        ) : (
          <form onSubmit={submit(handle)}>
            {mode === "register" && (
              <>
                <Field
                  label="Full name"
                  name="full_name"
                  required
                  maxLength={150}
                />
                <div className="form-grid">
                  <Field
                    label="Student ID / roll number"
                    name="student_id"
                    required
                    maxLength={100}
                  />
                  <Field
                    label="Academic programme"
                    name="academic_programme"
                    required
                    maxLength={150}
                  />
                </div>
                <Field
                  label="Department"
                  name="department"
                  defaultValue="Zoology"
                  required
                  maxLength={150}
                />
              </>
            )}
            {mode !== "password" && (
              <Field
                label={
                  mode === "register"
                    ? "Email (university email where available)"
                    : "Email"
                }
                name="email"
                type="email"
                required
              />
            )}
            {mode !== "reset" && (
              <label className="field">
                <span>
                  Password {mode !== "login" ? "(at least 12 characters)" : ""}
                </span>
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  required
                />
              </label>
            )}
            <button
              disabled={action.busy || !configured}
              className="button full"
            >
              {action.busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create student account"
                  : mode === "reset"
                    ? "Send reset link"
                    : mode === "password"
                      ? "Update password"
                      : "Sign in"}{" "}
              <ArrowRight size={16} />
            </button>
          </form>
        )}
        {!configured && (
          <p className="notice">
            Account services require the department’s Supabase configuration.
          </p>
        )}
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <Link to="/register">Create a student account</Link>
              <Link to="/reset">Forgot password?</Link>
            </>
          ) : (
            <Link to="/login">Return to sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}
