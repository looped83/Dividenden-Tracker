import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/auth-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Der Abfrage-Cache gehoert genau einem Nutzer (SECURITY_MODEL.md §2): Nach
 * dem Abmelden duerfen die Finanzdaten nicht fuer das naechste Konto im selben
 * Tab lesbar bleiben.
 */
type AuthCallback = (event: string, session: Session | null) => void;

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({ supabase: { auth } }));

const { SessionProvider } = await import("@/app/auth/SessionProvider");

const KEY = ["payments", "list"];

function sessionOf(userId: string): Session {
  return { user: { id: userId } } as Session;
}

let emit: AuthCallback;

async function mount(initial: Session | null): Promise<QueryClient> {
  auth.getSession.mockResolvedValue({ data: { session: initial } });
  const queryClient = new QueryClient();
  await act(async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{null}</SessionProvider>
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });
  queryClient.setQueryData(KEY, ["Zahlung von A"]);
  return queryClient;
}

beforeEach(() => {
  auth.getSession.mockReset();
  auth.onAuthStateChange.mockReset();
  auth.onAuthStateChange.mockImplementation((callback: AuthCallback) => {
    emit = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

describe("SessionProvider", () => {
  it("leert den Cache beim Abmelden", async () => {
    const queryClient = await mount(sessionOf("a"));

    act(() => {
      emit("SIGNED_OUT", null);
    });

    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });

  it("leert den Cache, wenn ein anderes Konto angemeldet wird", async () => {
    const queryClient = await mount(null);

    act(() => {
      emit("SIGNED_IN", sessionOf("b"));
    });

    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });

  it("behaelt den Cache bei erneuertem Token desselben Nutzers", async () => {
    const queryClient = await mount(sessionOf("a"));

    act(() => {
      emit("TOKEN_REFRESHED", sessionOf("a"));
    });

    expect(queryClient.getQueryData(KEY)).toEqual(["Zahlung von A"]);
  });
});
