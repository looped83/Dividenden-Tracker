import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useCelebration } from "@/lib/hooks/useCelebration";

function Probe({ id }: { id: string | null }) {
  return <span>{useCelebration(id) ? "feiern" : "still"}</span>;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("useCelebration", () => {
  it("feiert einen Erfolg nur beim ersten Erscheinen", () => {
    const first = render(<Probe id="goal-1" />);
    expect(screen.getByText("feiern")).toBeTruthy();
    first.unmount();
    render(<Probe id="goal-1" />);
    expect(screen.getByText("still")).toBeTruthy();
  });

  it("feiert nichts ohne Erfolg", () => {
    render(<Probe id={null} />);
    expect(screen.getByText("still")).toBeTruthy();
  });
});
