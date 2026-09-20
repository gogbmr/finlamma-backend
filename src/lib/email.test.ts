import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  RESEND_API_KEY: "re_test_key" as string | undefined,
  EMAIL_FROM: "Finlamma <consent@mail.finlamma.in>" as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

const mockSend = vi.fn();
vi.mock("resend", () => ({
  // A real class (not an arrow function) so `new Resend(...)` works under
  // the mock the same way it does against the real package.
  Resend: class {
    emails = { send: mockSend };
  },
}));

import { sendEmail } from "./email";

function fakeElement() {
  return { type: "div", props: {}, key: null } as unknown as React.ReactElement;
}

describe("sendEmail", () => {
  beforeEach(() => {
    mockEnv.RESEND_API_KEY = "re_test_key";
    mockEnv.EMAIL_FROM = "Finlamma <consent@mail.finlamma.in>";
    mockSend.mockReset();
  });

  it("throws SERVICE_UNAVAILABLE when RESEND_API_KEY is not configured", async () => {
    mockEnv.RESEND_API_KEY = undefined;

    await expect(
      sendEmail({ to: "parent@example.com", subject: "Hi", react: fakeElement() }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("throws SERVICE_UNAVAILABLE when EMAIL_FROM is not configured", async () => {
    mockEnv.EMAIL_FROM = undefined;

    await expect(
      sendEmail({ to: "parent@example.com", subject: "Hi", react: fakeElement() }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends via Resend with the configured from address", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "email_1" }, error: null });

    await sendEmail({ to: "parent@example.com", subject: "Hi", react: fakeElement() });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Finlamma <consent@mail.finlamma.in>",
        to: "parent@example.com",
        subject: "Hi",
      }),
    );
  });

  it("throws SERVICE_UNAVAILABLE (without leaking the error body) when Resend returns an error", async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { name: "validation_error", message: "invalid recipient" },
    });

    await expect(
      sendEmail({ to: "parent@example.com", subject: "Hi", react: fakeElement() }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
