import type { ImportSource } from "../../src/domain/imports/types";
import type { PlannerSnapshot, Trip } from "../../src/domain/trip/types";

type ImportEvalFixture = {
  id: string;
  description: string;
  source: ImportSource;
  trip: Trip;
  planner: PlannerSnapshot;
    expected: {
      selected: boolean;
      candidateKinds: Array<"startingTravel" | "transport" | "stay" | "activity">;
      candidates?: Array<Record<string, unknown>>;
      appliedItemCount?: number;
      appliedBaseNames?: string[];
    };
};

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-import-eval",
    name: "Patagonia, Chile & Argentina",
    startDate: "2026-04-29",
    endDate: "2026-05-10",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    planner: { items: [], customBases: [] },
    ...overrides,
  };
}

function source(id: string, subject: string, bodyText: string): ImportSource {
  return {
    id: `gmail:${id}`,
    provider: "gmail",
    messageId: id,
    historyId: "10",
    subject,
    from: "Booking <booking@example.com>",
    snippet: bodyText.slice(0, 180),
    bodyText,
    receivedAt: "2026-04-01T09:00:00.000Z",
  };
}

const emptyPlanner: PlannerSnapshot = { items: [], customBases: [] };

export const importEmailFixtures: ImportEvalFixture[] = [
  {
    id: "round-trip-flight",
    description: "A confirmed return flight imports starting travel plus the return transport leg.",
    trip: trip(),
    planner: emptyPlanner,
    source: source(
      "flight-round-trip",
      "Booking #JVFVK confirmation",
      [
        "Booking reference: JVFVK",
        "Outbound flight: Amsterdam Schiphol (AMS) - Santiago Arturo Merino Benitez (SCL)",
        "Departure: Wed, 29 Apr 2026, 13:05",
        "Arrival: Thu, 30 Apr 2026, 10:15",
        "Return flight: Santiago Arturo Merino Benitez (SCL) - Amsterdam Schiphol (AMS)",
        "Departure: Sun, 3 May 2026, 20:00",
        "Arrival: Mon, 4 May 2026, 14:20",
      ].join("\n"),
    ),
    expected: {
      selected: true,
      candidateKinds: ["startingTravel", "transport"],
      candidates: [
        {
          kind: "startingTravel",
          fromLabel: "Amsterdam Schiphol",
          toLabel: "Santiago Arturo Merino Benitez",
          startDate: "2026-04-29",
          endDate: "2026-04-30",
          startTime: "13:05",
          endTime: "10:15",
        },
        {
          kind: "transport",
          fromLabel: "Santiago Arturo Merino Benitez",
          toLabel: "Amsterdam Schiphol",
          startDate: "2026-05-03",
          endDate: "2026-05-04",
          startTime: "20:00",
          endTime: "14:20",
        },
      ],
      appliedItemCount: 2,
      appliedBaseNames: ["Santiago Arturo Merino Benitez", "Amsterdam Schiphol"],
    },
  },
  {
    id: "mid-trip-stay-without-starting-flight",
    description: "A stay booking in the middle of a trip can create a base and stay without a booked starting flight.",
    trip: trip(),
    planner: emptyPlanner,
    source: source(
      "stay-mid-trip",
      "Booking #HTL123 confirmation",
      [
        "Booking reference: HTL123",
        "Stay: Walking Santiago Boutique Hostel",
        "City: Santiago, Chile",
        "Check-in: 3 May 2026, 15:00",
        "Check-out: 6 May 2026, 10:00",
      ].join("\n"),
    ),
    expected: {
      selected: true,
      candidateKinds: ["stay"],
      candidates: [
        {
          kind: "stay",
          title: "Walking Santiago Boutique Hostel",
          startDate: "2026-05-03",
          endDate: "2026-05-06",
          startTime: "15:00",
          endTime: "10:00",
          baseLabel: "Santiago, Chile",
        },
      ],
      appliedItemCount: 1,
      appliedBaseNames: ["Santiago, Chile"],
    },
  },
  {
    id: "flight-confirmation-with-terms-text",
    description: "A real flight confirmation is still selected when it contains receipt or terms text.",
    trip: trip(),
    planner: emptyPlanner,
    source: source(
      "flight-with-terms",
      "Booking #FL998 ticket and receipt",
      [
        "Booking reference: FL998",
        "Flight itinerary",
        "Route: Amsterdam Schiphol (AMS) - Berlin Brandenburg (BER)",
        "Travel date: 29/04/26",
        "Receipt attached for your records.",
        "Terms and conditions apply to this ticket.",
      ].join("\n"),
    ),
    expected: {
      selected: true,
      candidateKinds: ["startingTravel"],
      candidates: [
        {
          kind: "startingTravel",
          fromLabel: "Amsterdam Schiphol",
          toLabel: "Berlin Brandenburg",
          startDate: "2026-04-29",
          endDate: "2026-04-29",
        },
      ],
      appliedItemCount: 1,
      appliedBaseNames: ["Berlin Brandenburg"],
    },
  },
  {
    id: "stay-confirmation-with-date-range",
    description: "A stay confirmation with one date-range line extracts check-in and check-out dates.",
    trip: trip(),
    planner: emptyPlanner,
    source: source(
      "stay-date-range",
      "Booking #STY456 confirmation",
      [
        "Booking reference: STY456",
        "Property: Las Torres Patagonia",
        "City: Puerto Natales, Chile",
        "Reservation dates: 3 May - 6 May 2026",
        "Terms and conditions apply to this reservation.",
      ].join("\n"),
    ),
    expected: {
      selected: true,
      candidateKinds: ["stay"],
      candidates: [
        {
          kind: "stay",
          title: "Las Torres Patagonia",
          startDate: "2026-05-03",
          endDate: "2026-05-06",
          baseLabel: "Puerto Natales, Chile",
        },
      ],
      appliedItemCount: 1,
      appliedBaseNames: ["Puerto Natales, Chile"],
    },
  },
  {
    id: "discount-program-email",
    description: "A promotional/program text with booking-like words is not an importable travel reservation.",
    trip: trip({ startDate: "2026-11-03", endDate: "2026-12-30" }),
    planner: emptyPlanner,
    source: source(
      "promo-las-torres",
      "Las Torres Patagonia programs and discounts",
      [
        "The published Las Torres Patagonia programs are not modifiable with regard to the accommodation sectors specified by each.",
        "For programs other than those priced, described and published by Las Torres Patagonia, please contact your reservations executive for a customized quote.",
        "In accordance with current local municipal regulations, Las Torres Patagonia operates groups with one guide for every six guests.",
        "Las Torres Patagonia does not provide luggage transportation services without passengers.",
        "Valid period: 2026-10-01-2026-04-02.",
      ].join("\n"),
    ),
    expected: {
      selected: false,
      candidateKinds: [],
      appliedItemCount: 0,
    },
  },
  {
    id: "receipt-without-itinerary",
    description: "A receipt-only email without itinerary details is not auto-imported as a planner item.",
    trip: trip(),
    planner: emptyPlanner,
    source: source(
      "receipt-only",
      "The receipts of your purchase for booking ABCD123",
      [
        "Receipt number: 123456",
        "Payment received for booking ABCD123.",
        "Total paid: EUR 349.00.",
        "This receipt is not a ticket and does not contain itinerary details.",
      ].join("\n"),
    ),
    expected: {
      selected: false,
      candidateKinds: [],
      appliedItemCount: 0,
    },
  },
  {
    id: "long-marketing-title",
    description: "Long paragraph-like labels are rejected instead of becoming planner titles.",
    trip: trip(),
    planner: emptyPlanner,
    source: source(
      "long-label",
      "Tour booking information",
      [
        "Activity: The published program is not modifiable with regard to the accommodation sectors specified by each and please contact your reservations executive for a customized quote.",
        "Departure: 3 May 2026, 09:00",
      ].join("\n"),
    ),
    expected: {
      selected: false,
      candidateKinds: [],
      appliedItemCount: 0,
    },
  },
];

export const duplicateBookingEmailFixtures = [
  source(
    "flight-duplicate-confirmation",
      "Booking #FL123 confirmation",
      [
        "Booking reference: FL123",
        "Flight itinerary",
        "Amsterdam, Netherlands to Santiago, Chile",
        "Departure: 29 Apr 2026, 13:05",
        "Arrival: 30 Apr 2026, 10:15",
    ].join("\n"),
  ),
  source(
    "flight-duplicate-ticket",
    "Booking #FL123 created",
    [
      "Booking reference: FL123",
      "Flight ticket",
      "Amsterdam, Netherlands to Santiago, Chile",
      "Departure: 29 Apr 2026, 13:05",
      "Arrival: 30 Apr 2026, 10:15",
    ].join("\n"),
  ),
];
