export interface PublicLocationResponse {
  tripId: string;
  tripNumber: string;
  routeCode?: string;
  routeName?: string;
  originStop?: string;
  destinationStop?: string;
  currentLatitude: number | null;
  currentLongitude: number | null;
  tripStatus: string;
  delayMinutes: number;
  lastTelemetryAt: string | null;
  expiresAt: string;
}
