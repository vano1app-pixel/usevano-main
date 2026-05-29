export const SUPPORTED_CITIES = ['Galway', 'Dublin', 'Cork', 'Limerick'] as const;
export type SupportedCity = typeof SUPPORTED_CITIES[number];
