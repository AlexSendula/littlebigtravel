export type PlaceRecommendationProviderStatus = {
  id: "future-places-recommendations";
  label: string;
  implemented: false;
  launchNote: string;
};

export const PLACE_RECOMMENDATION_PROVIDER_PLACEHOLDER: PlaceRecommendationProviderStatus = {
  id: "future-places-recommendations",
  label: "Future places and recommendations provider",
  implemented: false,
  launchNote:
    "Placeholder only. Future recommendation sources need provider terms, attribution, caching, quota, privacy, and backend-proxy decisions before implementation.",
};
