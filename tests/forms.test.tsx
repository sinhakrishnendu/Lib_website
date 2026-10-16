import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const api = vi.hoisted(() => ({
  signUp: vi.fn(async () => ({ error: null })),
  signInWithPassword: vi.fn(async () => ({ error: null })),
  rpc: vi.fn(async () => ({
    total: 1,
    items: [
      {
        book_id: "b1",
        copy_id: "c1",
        title: "FICTIONAL TEST · Book",
        authors: "Test Author",
        accession_number: "000017",
        available: true,
        shelf_location: "TEST",
      },
    ],
  })),
}));
vi.mock("../src/lib/supabase", () => ({
  configured: true,
  client: () => ({ auth: api }),
  authRedirect: () => "http://localhost/",
  rpc: api.rpc,
}));
vi.mock("../src/lib/auth", () => ({
  useAuth: () => ({ session: null, profile: null, refresh: vi.fn() }),
}));
import { AuthPage, Catalogue } from "../src/components/public";
import { Notifications } from "../src/components/ui";
function wrap(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <Notifications>{node}</Notifications>
    </MemoryRouter>,
  );
}
describe("student registration", () => {
  it("sends identity fields through Supabase Auth and shows verification instructions", async () => {
    wrap(<AuthPage mode="register" />);
    for (const [label, value] of [
      ["Full name", "Fictional Student"],
      ["Student ID / roll number", "000S"],
      ["Academic programme", "Test MSc"],
      ["Email (university email where available)", "test@example.invalid"],
    ])
      fireEvent.change(
        screen.getByLabelText(new RegExp(label.replace(/[()/]/g, "\\$&"))),
        { target: { value } },
      );
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: "long-test-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Create student account/ }),
    );
    await waitFor(() => expect(api.signUp).toHaveBeenCalled());
    const call = api.signUp.mock.calls[0] as unknown as [
      { email: string; options: { data: Record<string, string> } },
    ];
    expect(call[0].options.data.student_id).toBe("000S");
    expect(call[0].options.data).not.toHaveProperty("account_status");
    expect(
      await screen.findByText(/Check your email to verify/),
    ).toBeInTheDocument();
  });
});
describe("catalogue", () => {
  it("displays accession exactly and searches using RPC filters", async () => {
    wrap(<Catalogue />);
    expect(await screen.findByText("000017")).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Title, author, ISBN or accession"),
      { target: { value: "Ecology" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(api.rpc).toHaveBeenCalledWith(
        "catalogue",
        expect.objectContaining({ p_query: "Ecology" }),
      ),
    );
    expect(screen.getByText("Sign in to request")).toBeInTheDocument();
  });
});
