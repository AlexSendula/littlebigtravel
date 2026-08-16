export function normalizePlaceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .split(",")[0]
    .replace(/[^a-z0-9]+/g, "");
}

export function normalizeFullPlaceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function displayBaseName(value: string) {
  return value.split(",")[0]?.trim() || value.trim();
}

export function flagFromCountryCode(countryCode: string) {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(...[...normalized].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

export function buildPlaceDisplayLabel(city: string, countryCode: string) {
  const flag = flagFromCountryCode(countryCode);
  return flag ? `${city}, ${flag}` : city;
}
