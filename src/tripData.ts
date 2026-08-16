export type StopKind = "base" | "major" | "hidden";
export type TransportMode = "flight" | "bus" | "road" | "local";

export type TripEvent = {
  date: string;
  category: "Stay" | "Flight" | "Transport" | "Activity" | "Roadtrip" | "Day";
  title: string;
  note: string;
};

export type TripStop = {
  id: string;
  name: string;
  country: string;
  kind: StopKind;
  coordinates: [number, number];
  x: number;
  y: number;
  parentId?: string;
  accent: "north" | "patagonia" | "wine" | "water" | "city";
  dates: string;
  summary: string;
  events: TripEvent[];
};

export type TripLeg = {
  id: string;
  from: string;
  to: string;
  mode: TransportMode;
  label: string;
  parentId?: string;
  visibleOnStart?: boolean;
};

export const tripStops: TripStop[] = [
  {
    id: "santiago",
    name: "Santiago",
    country: "Chile",
    kind: "base",
    coordinates: [-70.6693, -33.4489],
    x: 137,
    y: 145,
    accent: "city",
    dates: "18-19 Nov",
    summary: "Landing, first night, and the jump-off flight into Patagonia.",
    events: [
      { date: "18 Nov", category: "Stay", title: "Arrive in Santiago", note: "Chill, hostel, recover from travel." },
      { date: "19 Nov", category: "Flight", title: "Santiago to Puerto Natales", note: "Flight and Patagonia prep day." },
    ],
  },
  {
    id: "puerto-natales",
    name: "Puerto Natales",
    country: "Chile",
    kind: "base",
    coordinates: [-72.505, -51.7309],
    x: 148,
    y: 535,
    accent: "patagonia",
    dates: "19-25 Nov",
    summary: "Base for Torres del Paine and the border crossing to Argentina.",
    events: [
      { date: "19 Nov", category: "Stay", title: "Prep day", note: "Food, gear, park logistics." },
      { date: "20-24 Nov", category: "Activity", title: "Torres del Paine", note: "Five-day hiking block, ending back in Puerto Natales." },
      { date: "25 Nov", category: "Transport", title: "Bus to El Calafate", note: "About 5-6 hours with border crossing." },
    ],
  },
  {
    id: "torres-del-paine",
    name: "Torres del Paine",
    country: "Chile",
    kind: "major",
    parentId: "puerto-natales",
    coordinates: [-72.9824, -50.9423],
    x: 171,
    y: 508,
    accent: "patagonia",
    dates: "20-24 Nov",
    summary: "The long hiking centerpiece of the Chilean Patagonia leg.",
    events: [
      { date: "20 Nov", category: "Activity", title: "Hike day 1", note: "Enter the park." },
      { date: "21 Nov", category: "Activity", title: "Hike day 2", note: "Mountain and lake day." },
      { date: "22 Nov", category: "Activity", title: "Hike day 3", note: "Middle section of the trek." },
      { date: "23 Nov", category: "Activity", title: "Hike day 4", note: "Final full hiking day." },
      { date: "24 Nov", category: "Activity", title: "Hike day 5", note: "Exit back to Puerto Natales." },
    ],
  },
  {
    id: "el-calafate",
    name: "El Calafate",
    country: "Argentina",
    kind: "base",
    coordinates: [-72.2768, -50.337],
    x: 200,
    y: 558,
    accent: "patagonia",
    dates: "25-27 Nov",
    summary: "Glacier base before heading north to El Chalten.",
    events: [
      { date: "25 Nov", category: "Transport", title: "Puerto Natales to El Calafate", note: "Bus, border day." },
      { date: "26 Nov", category: "Activity", title: "Perito Moreno Glacier", note: "Walkways and glacier views." },
      { date: "27 Nov", category: "Transport", title: "Bus to El Chalten", note: "About 3 hours." },
    ],
  },
  {
    id: "perito-moreno",
    name: "Perito Moreno",
    country: "Argentina",
    kind: "major",
    parentId: "el-calafate",
    coordinates: [-73.0498, -50.4967],
    x: 184,
    y: 574,
    accent: "water",
    dates: "26 Nov",
    summary: "Glacier day trip from El Calafate.",
    events: [
      { date: "26 Nov", category: "Activity", title: "Glacier walkways", note: "Main boardwalk viewpoints." },
    ],
  },
  {
    id: "el-chalten",
    name: "El Chalten",
    country: "Argentina",
    kind: "base",
    coordinates: [-72.8863, -49.3315],
    x: 206,
    y: 520,
    accent: "patagonia",
    dates: "27-30 Nov",
    summary: "Hiking base for Fitz Roy and Laguna Torre.",
    events: [
      { date: "27 Nov", category: "Transport", title: "El Calafate to El Chalten", note: "Bus into the hiking village." },
      { date: "28 Nov", category: "Activity", title: "Laguna de los Tres", note: "Fitz Roy hike." },
      { date: "29 Nov", category: "Activity", title: "Laguna Torre", note: "Second big hiking day." },
      { date: "30 Nov", category: "Flight", title: "Toward Mendoza", note: "Bus back to Calafate, flight via Buenos Aires." },
    ],
  },
  {
    id: "laguna-tres",
    name: "Laguna de los Tres",
    country: "Argentina",
    kind: "hidden",
    parentId: "el-chalten",
    coordinates: [-72.9797, -49.2726],
    x: 221,
    y: 508,
    accent: "patagonia",
    dates: "28 Nov",
    summary: "Fitz Roy day hike from El Chalten.",
    events: [
      { date: "28 Nov", category: "Activity", title: "Fitz Roy hike", note: "Laguna de los Tres route." },
    ],
  },
  {
    id: "laguna-torre",
    name: "Laguna Torre",
    country: "Argentina",
    kind: "hidden",
    parentId: "el-chalten",
    coordinates: [-72.9579, -49.2939],
    x: 193,
    y: 502,
    accent: "patagonia",
    dates: "29 Nov",
    summary: "Laguna Torre day hike from El Chalten.",
    events: [
      { date: "29 Nov", category: "Activity", title: "Laguna Torre", note: "Second El Chalten hiking day." },
    ],
  },
  {
    id: "mendoza",
    name: "Mendoza",
    country: "Argentina",
    kind: "base",
    coordinates: [-68.8272, -32.8895],
    x: 183,
    y: 188,
    accent: "wine",
    dates: "30 Nov-3 Dec",
    summary: "Wine, city reset, and a slower couple of days.",
    events: [
      { date: "30 Nov", category: "Flight", title: "El Calafate to Mendoza", note: "Via Buenos Aires." },
      { date: "1 Dec", category: "Day", title: "Mendoza chill day", note: "City, food, wine, easy pace." },
      { date: "2 Dec", category: "Day", title: "Bodega tour", note: "Wine tour day." },
      { date: "3 Dec", category: "Flight", title: "Mendoza to Salta", note: "Northwest Argentina flight." },
    ],
  },
  {
    id: "bodegas",
    name: "Bodegas",
    country: "Argentina",
    kind: "hidden",
    parentId: "mendoza",
    coordinates: [-68.8661, -33.0375],
    x: 168,
    y: 204,
    accent: "wine",
    dates: "2 Dec",
    summary: "Wine tour day around Mendoza.",
    events: [
      { date: "2 Dec", category: "Day", title: "Wijntour bodegas", note: "Vineyards and tasting route." },
    ],
  },
  {
    id: "salta",
    name: "Salta",
    country: "Argentina",
    kind: "base",
    coordinates: [-65.4117, -24.7821],
    x: 207,
    y: 79,
    accent: "north",
    dates: "3-8 Dec",
    summary: "Northwest Argentina base for a road-trip loop.",
    events: [
      { date: "3 Dec", category: "Flight", title: "Mendoza to Salta", note: "Arrival in the northwest." },
      { date: "4 Dec", category: "Day", title: "City and car", note: "Arrange rental car, short city walk." },
      { date: "5 Dec", category: "Roadtrip", title: "Cafayate", note: "RN68 and wine tasting." },
      { date: "6 Dec", category: "Roadtrip", title: "Salinas Grandes", note: "Salt flats road day." },
      { date: "7 Dec", category: "Roadtrip", title: "Humahuaca", note: "Quebrada, Tilcara, maybe Hornocal." },
      { date: "8 Dec", category: "Flight", title: "Salta to Iguazu", note: "Fly east." },
    ],
  },
  {
    id: "cafayate",
    name: "Cafayate",
    country: "Argentina",
    kind: "major",
    parentId: "salta",
    coordinates: [-65.9761, -26.0731],
    x: 200,
    y: 126,
    accent: "north",
    dates: "5 Dec",
    summary: "RN68 road-trip day with wine tasting.",
    events: [
      { date: "5 Dec", category: "Roadtrip", title: "RN68 to Cafayate", note: "Road landscapes and wine." },
    ],
  },
  {
    id: "salinas-grandes",
    name: "Salinas Grandes",
    country: "Argentina",
    kind: "major",
    parentId: "salta",
    coordinates: [-66.0023, -23.5868],
    x: 181,
    y: 58,
    accent: "north",
    dates: "6 Dec",
    summary: "Salt flats road-trip stop from Salta.",
    events: [
      { date: "6 Dec", category: "Roadtrip", title: "Salt flats", note: "High-desert drive and flats." },
    ],
  },
  {
    id: "humahuaca",
    name: "Humahuaca",
    country: "Argentina",
    kind: "major",
    parentId: "salta",
    coordinates: [-65.3505, -23.2056],
    x: 218,
    y: 48,
    accent: "north",
    dates: "7 Dec",
    summary: "Quebrada route, Tilcara, and maybe Hornocal.",
    events: [
      { date: "7 Dec", category: "Roadtrip", title: "Quebrada day", note: "Humahuaca, Tilcara, optional Hornocal." },
    ],
  },
  {
    id: "iguazu",
    name: "Iguazu",
    country: "Argentina",
    kind: "base",
    coordinates: [-54.5786, -25.5972],
    x: 319,
    y: 142,
    accent: "water",
    dates: "8-11 Dec",
    summary: "Waterfall base with Argentina and Brazil sides.",
    events: [
      { date: "8 Dec", category: "Flight", title: "Salta to Iguazu", note: "Arrival day." },
      { date: "9 Dec", category: "Activity", title: "Argentina side", note: "Main falls day." },
      { date: "10 Dec", category: "Activity", title: "Brazil side", note: "Views and optional boat." },
      { date: "11 Dec", category: "Flight", title: "Iguazu to Buenos Aires", note: "Fly to the city." },
    ],
  },
  {
    id: "iguazu-falls",
    name: "Iguazu Falls",
    country: "Brazil",
    kind: "major",
    parentId: "iguazu",
    coordinates: [-54.4367, -25.6953],
    x: 333,
    y: 127,
    accent: "water",
    dates: "9-10 Dec",
    summary: "Two-sided waterfall days from Iguazu.",
    events: [
      { date: "9 Dec", category: "Activity", title: "Argentina side", note: "Falls trails and viewpoints." },
      { date: "10 Dec", category: "Activity", title: "Brazil side", note: "Panoramic side, boat optional." },
    ],
  },
  {
    id: "buenos-aires",
    name: "Buenos Aires",
    country: "Argentina",
    kind: "base",
    coordinates: [-58.3816, -34.6037],
    x: 265,
    y: 242,
    accent: "city",
    dates: "11-14 Dec",
    summary: "Final city days: food, neighborhoods, culture, maybe tango.",
    events: [
      { date: "11 Dec", category: "Flight", title: "Iguazu to Buenos Aires", note: "Arrive for the final leg." },
      { date: "12 Dec", category: "Day", title: "City day", note: "Food and neighborhoods." },
      { date: "13 Dec", category: "Day", title: "Day trip", note: "Flexible city-side day trip." },
      { date: "14 Dec", category: "Day", title: "Culture day", note: "City, culture, maybe tango." },
    ],
  },
  {
    id: "ba-day-trip",
    name: "Day trip",
    country: "Argentina",
    kind: "hidden",
    parentId: "buenos-aires",
    coordinates: [-58.5796, -34.4251],
    x: 287,
    y: 220,
    accent: "city",
    dates: "13 Dec",
    summary: "Placeholder for the Buenos Aires side trip.",
    events: [
      { date: "13 Dec", category: "Day", title: "Flexible day trip", note: "Keep open until the route is decided." },
    ],
  },
];

export const tripLegs: TripLeg[] = [
  { id: "santiago-pn", from: "santiago", to: "puerto-natales", mode: "flight", label: "19 Nov", visibleOnStart: true },
  { id: "pn-tdp", from: "puerto-natales", to: "torres-del-paine", mode: "local", label: "20-24 Nov", parentId: "puerto-natales", visibleOnStart: true },
  { id: "pn-calafate", from: "puerto-natales", to: "el-calafate", mode: "bus", label: "25 Nov", visibleOnStart: true },
  { id: "calafate-glacier", from: "el-calafate", to: "perito-moreno", mode: "local", label: "26 Nov", parentId: "el-calafate", visibleOnStart: true },
  { id: "calafate-chalten", from: "el-calafate", to: "el-chalten", mode: "bus", label: "27 Nov", visibleOnStart: true },
  { id: "chalten-tres", from: "el-chalten", to: "laguna-tres", mode: "local", label: "28 Nov", parentId: "el-chalten" },
  { id: "chalten-torre", from: "el-chalten", to: "laguna-torre", mode: "local", label: "29 Nov", parentId: "el-chalten" },
  { id: "chalten-mendoza", from: "el-chalten", to: "mendoza", mode: "flight", label: "30 Nov", visibleOnStart: true },
  { id: "mendoza-bodegas", from: "mendoza", to: "bodegas", mode: "local", label: "2 Dec", parentId: "mendoza" },
  { id: "mendoza-salta", from: "mendoza", to: "salta", mode: "flight", label: "3 Dec", visibleOnStart: true },
  { id: "salta-cafayate", from: "salta", to: "cafayate", mode: "road", label: "5 Dec", parentId: "salta", visibleOnStart: true },
  { id: "salta-salinas", from: "salta", to: "salinas-grandes", mode: "road", label: "6 Dec", parentId: "salta", visibleOnStart: true },
  { id: "salta-humahuaca", from: "salta", to: "humahuaca", mode: "road", label: "7 Dec", parentId: "salta", visibleOnStart: true },
  { id: "salta-iguazu", from: "salta", to: "iguazu", mode: "flight", label: "8 Dec", visibleOnStart: true },
  { id: "iguazu-falls", from: "iguazu", to: "iguazu-falls", mode: "local", label: "9-10 Dec", parentId: "iguazu", visibleOnStart: true },
  { id: "iguazu-ba", from: "iguazu", to: "buenos-aires", mode: "flight", label: "11 Dec", visibleOnStart: true },
  { id: "ba-day-trip", from: "buenos-aires", to: "ba-day-trip", mode: "local", label: "13 Dec", parentId: "buenos-aires" },
];

export const stopById = new Map(tripStops.map((stop) => [stop.id, stop]));
