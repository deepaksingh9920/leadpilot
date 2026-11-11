import { describe, expect, it } from "vitest";

import {
  canApproveOutreach,
  canManageBilling,
  canManageTeam,
  canExportLeads,
  roleAtLeast,
} from "./roles";

describe("role hierarchy", () => {
  it("orders VIEWER < MEMBER < ADMIN < OWNER", () => {
    expect(roleAtLeast("VIEWER", "VIEWER")).toBe(true);
    expect(roleAtLeast("VIEWER", "MEMBER")).toBe(false);
    expect(roleAtLeast("MEMBER", "ADMIN")).toBe(false);
    expect(roleAtLeast("ADMIN", "ADMIN")).toBe(true);
    expect(roleAtLeast("OWNER", "ADMIN")).toBe(true);
  });

  it("rejects unknown or missing roles", () => {
    expect(roleAtLeast(null, "VIEWER")).toBe(false);
    expect(roleAtLeast("SUPERADMIN", "VIEWER")).toBe(false);
  });

  it("enforces the documented capability rules", () => {
    expect(canApproveOutreach("ADMIN")).toBe(true);
    expect(canApproveOutreach("ADMIN", "ADMIN_OR_OWNER")).toBe(true);
    expect(canApproveOutreach("ADMIN", "OWNER_ONLY")).toBe(false);
    expect(canApproveOutreach("OWNER", "OWNER_ONLY")).toBe(true);
    expect(canApproveOutreach("MEMBER")).toBe(false);
    expect(canManageBilling("ADMIN")).toBe(false);
    expect(canManageBilling("OWNER")).toBe(true);
    expect(canManageTeam("ADMIN")).toBe(true);
    expect(canExportLeads("MEMBER")).toBe(true);
    expect(canExportLeads("VIEWER")).toBe(false);
  });
});
