import { describe, expect, it } from "vitest";
import { defaultFunnelConfig } from "@/modules/forms/default-funnel";
import { calculateMissedCallLoss } from "@/modules/forms/formula";

describe("missed_call_loss_v1", () => {
  it("calculates the default weekly and monthly leak", () => {
    const result = calculateMissedCallLoss(
      {
        owner: "owner",
        missed: "miss_regular",
        value: "value_high",
        want: "want_yes",
      },
      defaultFunnelConfig
    );
    expect(result.weeklyLost).toBe(1620);
    expect(result.monthlyLost).toBe(6480);
    expect(result.qualified).toBe(true);
  });
});
