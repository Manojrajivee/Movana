import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { SafetyZoneCategory, SafetyZoneRiskLevel } from '../dto/create-safety-zone.dto';

export interface GeofenceRecord {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SafetyZoneConfig {
  geofenceId: string;
  speedLimitKmh: number;
  riskLevel: SafetyZoneRiskLevel;
  zoneCategory: SafetyZoneCategory;
  cooldownMinutes: number;
  autoReportIncident: boolean;
  active: boolean;
  activeTimeStart?: string;
  activeTimeEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyZoneWithGeofence extends SafetyZoneConfig {
  geofence?: GeofenceRecord;
}

@Injectable()
export class SafetyZonesRepository {
  private readonly logger = new Logger(SafetyZonesRepository.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  // ==========================================
  // PostgreSQL Operations (Parameterized SQL)
  // ==========================================

  async findGeofenceById(geofenceId: string): Promise<GeofenceRecord | null> {
    const query = `
      SELECT
        id,
        name,
        description,
        latitude::float AS latitude,
        longitude::float AS longitude,
        radius_meters,
        type,
        status,
        created_at,
        updated_at
      FROM geofences
      WHERE id = $1;
    `;
    const res = await this.db.query<GeofenceRecord>(query, [geofenceId]);
    return res.rows[0] || null;
  }

  async findActiveGeofences(): Promise<GeofenceRecord[]> {
    const query = `
      SELECT
        id,
        name,
        description,
        latitude::float AS latitude,
        longitude::float AS longitude,
        radius_meters,
        type,
        status,
        created_at,
        updated_at
      FROM geofences
      WHERE status = 'ACTIVE'
      ORDER BY name ASC;
    `;
    const res = await this.db.query<GeofenceRecord>(query);
    return res.rows;
  }

  async validateVehicleExists(vehicleId: string): Promise<boolean> {
    const query = `SELECT 1 FROM vehicles WHERE id = $1;`;
    const res = await this.db.query(query, [vehicleId]);
    return res.rows.length > 0;
  }

  async recordGeofenceEvent(data: {
    geofenceId: string;
    vehicleId: string;
    tripId?: string | null;
    eventType: 'ENTER' | 'EXIT';
    latitude: number;
    longitude: number;
    occurredAt?: Date;
  }): Promise<void> {
    const query = `
      INSERT INTO geofence_events (
        geofence_id,
        vehicle_id,
        trip_id,
        event_type,
        latitude,
        longitude,
        occurred_at,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        COALESCE($7::timestamptz, CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
      );
    `;
    await this.db.query(query, [
      data.geofenceId,
      data.vehicleId,
      data.tripId || null,
      data.eventType,
      data.latitude,
      data.longitude,
      data.occurredAt ? data.occurredAt.toISOString() : null,
    ]);
  }

  // ==========================================
  // Redis Operations (Ephemeral Config & Alerts)
  // ==========================================

  private readonly localInflight = new Set<string>();

  async saveSafetyZoneConfig(config: SafetyZoneConfig): Promise<SafetyZoneConfig> {
    if (!this.redis.isAvailable()) {
      throw new Error(
        'Redis service is currently unavailable; safety zone policy cannot be safely persisted',
      );
    }
    const key = `movana:safety_zones:config:${config.geofenceId}`;
    const serialized = JSON.stringify(config);
    // 30 days retention for active policy configurations
    await this.redis.set(key, serialized, 2592000);
    await this.redis.sadd('movana:safety_zones:active_ids', config.geofenceId);
    return config;
  }

  async findSafetyZoneConfig(geofenceId: string): Promise<SafetyZoneConfig | null> {
    const key = `movana:safety_zones:config:${geofenceId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SafetyZoneConfig;
    } catch {
      return null;
    }
  }

  async findAllSafetyZoneConfigs(): Promise<SafetyZoneConfig[]> {
    const ids = await this.redis.smembers('movana:safety_zones:active_ids');
    if (!ids || ids.length === 0) return [];

    const configs: SafetyZoneConfig[] = [];
    for (const id of ids) {
      const cfg = await this.findSafetyZoneConfig(id);
      if (cfg) {
        configs.push(cfg);
      } else {
        // Self-heal: Clean up stale ID from active_ids set when underlying key has expired
        await this.redis.srem('movana:safety_zones:active_ids', id);
      }
    }
    return configs;
  }

  async deleteSafetyZoneConfig(geofenceId: string): Promise<boolean> {
    if (!this.redis.isAvailable()) {
      throw new Error(
        'Redis service is currently unavailable; safety zone policy cannot be modified',
      );
    }
    const key = `movana:safety_zones:config:${geofenceId}`;
    await this.redis.del(key);
    await this.redis.srem('movana:safety_zones:active_ids', geofenceId);
    return true;
  }

  async checkAndSetAlertCooldown(
    geofenceId: string,
    vehicleId: string,
    cooldownSeconds: number,
  ): Promise<{ isDuplicate: boolean }> {
    const cooldownKey = `movana:safety_zones:cooldown:${geofenceId}:${vehicleId}`;

    // Protect against concurrent evaluations within the same process
    if (this.localInflight.has(cooldownKey)) {
      return { isDuplicate: true };
    }
    this.localInflight.add(cooldownKey);
    setTimeout(
      () => {
        this.localInflight.delete(cooldownKey);
      },
      Math.min(cooldownSeconds * 1000, 30000),
    ).unref?.();

    const existing = await this.redis.get(cooldownKey);
    if (existing) {
      return { isDuplicate: true };
    }
    // Set alert cooldown key to suppress duplicate alerts across distributed instances
    await this.redis.set(cooldownKey, new Date().toISOString(), cooldownSeconds);
    return { isDuplicate: false };
  }

  async recordRecentAlert(alert: Record<string, any>): Promise<void> {
    const key = 'movana:safety_zones:recent_alerts_list';
    const existing = await this.redis.get(key);
    let list: any[] = [];
    if (existing) {
      try {
        list = JSON.parse(existing);
      } catch {
        list = [];
      }
    }
    list.unshift(alert);
    if (list.length > 100) {
      list = list.slice(0, 100);
    }
    await this.redis.set(key, JSON.stringify(list), 86400); // 24 hours
  }

  async getRecentAlerts(limit = 50): Promise<any[]> {
    const key = 'movana:safety_zones:recent_alerts_list';
    const raw = await this.redis.get(key);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw) as any[];
      return Array.isArray(list) ? list.slice(0, limit) : [];
    } catch {
      return [];
    }
  }
}
