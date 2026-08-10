import type { FunnelConfig } from "@/lib/validation/funnels";

export const defaultFunnelConfig: FunnelConfig = {
  intro: {
    kicker: "Lead Value Calculator",
    title: "Check how many booked jobs you may be leaving behind.",
    subtitle: "Answer 4 quick questions and get a simple estimate.",
    startButton: "Start",
  },
  questions: [
    {
      id: "owner",
      kicker: "Authority gate",
      title: "Do you own or manage the business?",
      subtitle: "This works best for owners and decision-makers.",
      options: [
        { label: "Yes, I make decisions", value: "owner", imageUrl: "" },
        { label: "No, I am researching", value: "not_owner", imageUrl: "" },
      ],
    },
    {
      id: "missed",
      kicker: "The pain",
      title: "Do calls ever get missed during busy hours?",
      subtitle: "Missed calls often turn into booked jobs for someone else.",
      options: [
        { label: "Yes, it happens regularly", value: "miss_regular", imageUrl: "" },
        { label: "No, calls are always answered", value: "miss_never", imageUrl: "" },
      ],
    },
    {
      id: "value",
      kicker: "The money",
      title: "Is one booked job worth more than $300 in profit?",
      subtitle: "This keeps the estimate simple and conservative.",
      options: [
        { label: "Yes, more than $300", value: "value_high", imageUrl: "" },
        { label: "No, less than $300", value: "value_low", imageUrl: "" },
      ],
    },
    {
      id: "want",
      kicker: "The fix",
      title: "Would you want missed calls answered and booked automatically?",
      subtitle: "No extra hiring or training required.",
      options: [
        { label: "Yes, book jobs for me", value: "want_yes", imageUrl: "" },
        { label: "No, voicemail is fine", value: "want_no", imageUrl: "" },
      ],
    },
  ],
  result: {
    type: "formula",
    formulaKey: "missed_call_loss_v1",
    currency: "USD",
    constants: {
      missedCallsRegular: 6,
      missedCallsFloor: 1,
      highValuePerMissedCall: 450,
      lowValuePerMissedCall: 300,
      lossFactor: 0.6,
      subscriptionComparisonMonthly: 49,
    },
  },
  leadFields: [{ name: "email", type: "email", required: true }],
  submit: {
    buttonLabel: "Get my result",
    successMode: "message",
    redirectUrl: null,
  },
};
