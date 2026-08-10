import type { FunnelConfig } from "@/lib/validation/funnels";

export type FunnelAnswers = Record<string, string>;

export function calculateMissedCallLoss(
  answers: FunnelAnswers,
  config: Pick<FunnelConfig, "result">
) {
  const constants = {
    missedCallsRegular: 6,
    missedCallsFloor: 1,
    highValuePerMissedCall: 450,
    lowValuePerMissedCall: 300,
    lossFactor: 0.6,
    subscriptionComparisonMonthly: 49,
    ...(config.result.constants ?? {}),
  };
  const owner = answers.owner === "owner";
  const misses = answers.missed === "miss_regular";
  const highValue = answers.value === "value_high";
  const wants = answers.want === "want_yes";
  const missedCallsPerWeek = misses ? constants.missedCallsRegular : constants.missedCallsFloor;
  const valuePerMissedCall = highValue
    ? constants.highValuePerMissedCall
    : constants.lowValuePerMissedCall;
  const weeklyLost = Math.round(missedCallsPerWeek * valuePerMissedCall * constants.lossFactor);
  const monthlyLost = weeklyLost * 4;
  const comparisonMultiple =
    constants.subscriptionComparisonMonthly > 0
      ? monthlyLost / constants.subscriptionComparisonMonthly
      : null;

  const bullets = [
    `Missed calls/week: ${missedCallsPerWeek}.`,
    `Value per missed call: ${formatMoney(valuePerMissedCall)}.`,
    `Loss factor applied: ${Math.round(constants.lossFactor * 100)}%.`,
    `Estimated loss: ${formatMoney(weeklyLost)}/week (${formatMoney(monthlyLost)}/month).`,
  ];

  if (misses && wants && comparisonMultiple) {
    bullets.push(
      `The monthly leak is roughly ${comparisonMultiple.toFixed(1)}x the comparison cost.`
    );
  } else if (misses && !wants) {
    bullets.push("Voicemail may be acceptable, but it has a measurable opportunity cost.");
  } else if (!misses) {
    bullets.push("Even high-performing teams usually have some after-hours or overflow leakage.");
  }

  return {
    weeklyLost,
    monthlyLost,
    missedCallsPerWeek,
    valuePerMissedCall,
    lossFactor: constants.lossFactor,
    comparisonMonthly: constants.subscriptionComparisonMonthly,
    comparisonMultiple,
    qualified: owner && (misses || wants),
    lead: !owner
      ? "This is most useful for owners and decision-makers."
      : misses
        ? "Missed calls usually mean lost jobs."
        : "Even strong teams can leak value after hours or during rushes.",
    bullets,
    resultText: [
      `Weekly estimated leak: ${formatMoney(weeklyLost)}`,
      `Monthly estimated leak: ${formatMoney(monthlyLost)}`,
      `Inputs: owner=${owner}, misses=${misses}, highValue=${highValue}, wants=${wants}`,
    ].join("\n"),
  };
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
