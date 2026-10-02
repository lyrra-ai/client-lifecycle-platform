import { describe, it, expect } from "vitest";
import { looksLikeCredential } from "@/lib/credential-check";

describe("looksLikeCredential", () => {
  it("flags text containing the word 'password'", () => {
    expect(looksLikeCredential("my password is hunter2")).toBe(true);
    expect(looksLikeCredential("Password: hunter2")).toBe(true);
    expect(looksLikeCredential("PASSWORD hunter2")).toBe(true);
  });

  it("flags common credential-pair shapes", () => {
    expect(looksLikeCredential("me@example.com: hunter2")).toBe(true);
    expect(looksLikeCredential("login: me@example.com pass: hunter2")).toBe(true);
  });

  it("does not flag ordinary access-request notes", () => {
    expect(looksLikeCredential("Done, added you as an editor")).toBe(false);
    expect(looksLikeCredential("Invited you via the Users page")).toBe(false);
    expect(looksLikeCredential("Can't find this option, can we call?")).toBe(false);
  });

  it("does not flag a bare email address with no separator/second token", () => {
    expect(looksLikeCredential("Contact me at me@example.com")).toBe(false);
  });
});
