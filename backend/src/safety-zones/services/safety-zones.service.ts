import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IncidentsService } from '../../incidents/services/incidents.service';
import { RealTimeService } from '../../real-time/services/real-time.service';
import { CreateSafetyZoneDto } from '../dto/create-safety-zone.dto';
import { EvaluateSafetyZoneDto } from '../dto/evaluate-safety-zone.dto';
import { QuerySafetyZonesDto } from '../dto/query-safety-zones.dto';
import { UpdateSafetyZoneDto } from '../dto/update-safety-zone.dto';
import {
  GeofenceRecord,
  SafetyZoneConfig,
  SafetyZoneWithGeofence,
  SafetyZonesRepository,
} from '../repositories/safety-zones.repository';

export interface SafetyZoneViolation {
  geofenceId: string;
  geofenceName: string;
  zoneCategory: string;
  riskLevel: string;
  speedLimitKmh: number;
  actualSpeedKmh: number;
  overspeedKmh: number;
  alertDispatched: boolean;
  deduplicated: boolean;
  incidentId?: string;
  occurredAt: string;
}

export interface SafetyZoneEvaluationResult {
  vehicleId: string;
  tripId?: string;
  latitude: number;
  longitude: number;
  actualSpeedKmh: number;
  evaluatedCount: number;
  insideZoneCount: number;
  violations: SafetyZoneViolation[];
}

@Injectable()
export class SafetyZonesService {
  private readonly logger = new Logger(SafetyZonesService.name);

  constructor(
    private readonly repository: SafetyZonesRepository,
    @Optional() private readonly incidentsService?: IncidentsService,
    @Optional() private readonly realTimeService?: RealTimeService,
  ) {}

  /**
   * Calculates Haversine distance in meters between two WGS-84 coordinates.
   */
  public calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Checks whether the current time falls within configured active hours (HH:mm).
   */
  private isWithinActiveHours(
    startTime?: string,
    endTime?: string,
    now: Date = new Date(),
  ): boolean {
    if (!startTime || !endTime) return true;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
    // Overnight window (e.g. 22:00 to 06:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  async createSafetyZone(
    dto: CreateSafetyZoneDto,
    _currentUser?: any,
  ): Promise<SafetyZoneWithGeofence> {
    const geofence = await this.repository.findGeofenceById(dto.geofenceId);
    if (!geofence) {
      throw new NotFoundException(`Geofence with ID '${dto.geofenceId}' not found`);
    }

    if (geofence.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot configure safety zone policy on inactive geofence '${dto.geofenceId}'`,
      );
    }

    const existingConfig = await this.repository.findSafetyZoneConfig(dto.geofenceId);
    if (existingConfig) {
      throw new ConflictException(
        `Safety zone policy already configured for geofence '${dto.geofenceId}'`,
      );
    }

    const now = new Date().toISOString();
    const config: SafetyZoneConfig = {
      geofenceId: dto.geofenceId,
      speedLimitKmh: dto.speedLimitKmh,
      riskLevel: dto.riskLevel || 'MEDIUM',
      zoneCategory: dto.zoneCategory || 'ACCIDENT_PRONE_AREA',
      cooldownMinutes: dto.cooldownMinutes ?? 15,
      autoReportIncident: dto.autoReportIncident ?? false,
      active: true,
      activeTimeStart: dto.activeTimeStart,
      activeTimeEnd: dto.activeTimeEnd,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.repository.saveSafetyZoneConfig(config);
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Unable to persist safety zone configuration: ${err?.message || 'Cache service unavailable'}`,
      );
    }

    this.logger.log(
      `Safety zone policy established on geofence '${geofence.name}' (${dto.geofenceId}) with speed limit ${dto.speedLimitKmh} km/h`,
    );

    return {
      ...config,
      geofence,
    };
  }

  async getSafetyZones(
    query: QuerySafetyZonesDto,
  ): Promise<{ items: SafetyZoneWithGeofence[]; total: number }> {
    const activeGeofences = await this.repository.findActiveGeofences();
    const geofenceMap = new Map<string, GeofenceRecord>();
    for (const g of activeGeofences) {
      geofenceMap.set(g.id, g);
    }

    const configs = await this.repository.findAllSafetyZoneConfigs();

    // Ensure stale Redis configurations whose PostgreSQL geofences were deleted/deactivated are safely omitted
    let combined: SafetyZoneWithGeofence[] = configs
      .filter((cfg) => geofenceMap.has(cfg.geofenceId))
      .map((cfg) => ({
        ...cfg,
        geofence: geofenceMap.get(cfg.geofenceId)!,
      }));

    if (query.riskLevel) {
      combined = combined.filter((item) => item.riskLevel === query.riskLevel);
    }

    if (query.zoneCategory) {
      combined = combined.filter((item) => item.zoneCategory === query.zoneCategory);
    }

    if (query.activeOnly) {
      combined = combined.filter((item) => item.active);
    }

    const total = combined.length;
    const paginated = combined.slice(query.offset, query.offset + query.limit);

    return {
      items: paginated,
      total,
    };
  }

  async getSafetyZoneById(geofenceId: string): Promise<SafetyZoneWithGeofence> {
    const geofence = await this.repository.findGeofenceById(geofenceId);
    if (!geofence) {
      throw new NotFoundException(`Geofence with ID '${geofenceId}' not found`);
    }

    const config = await this.repository.findSafetyZoneConfig(geofenceId);
    if (!config) {
      // Default fallback when geofence exists without custom Redis policy
      const now = new Date().toISOString();
      return {
        geofenceId,
        speedLimitKmh: 40,
        riskLevel: 'MEDIUM',
        zoneCategory: 'ACCIDENT_PRONE_AREA',
        cooldownMinutes: 15,
        autoReportIncident: false,
        active: true,
        createdAt: now,
        updatedAt: now,
        geofence,
      };
    }

    return {
      ...config,
      geofence,
    };
  }

  async updateSafetyZone(
    geofenceId: string,
    dto: UpdateSafetyZoneDto,
    _currentUser?: any,
  ): Promise<SafetyZoneWithGeofence> {
    const existing = await this.getSafetyZoneById(geofenceId);

    const updatedConfig: SafetyZoneConfig = {
      geofenceId,
      speedLimitKmh: dto.speedLimitKmh ?? existing.speedLimitKmh,
      riskLevel: dto.riskLevel ?? existing.riskLevel,
      zoneCategory: dto.zoneCategory ?? existing.zoneCategory,
      cooldownMinutes: dto.cooldownMinutes ?? existing.cooldownMinutes,
      autoReportIncident: dto.autoReportIncident ?? existing.autoReportIncident,
      active: dto.active ?? existing.active,
      activeTimeStart: dto.activeTimeStart ?? existing.activeTimeStart,
      activeTimeEnd: dto.activeTimeEnd ?? existing.activeTimeEnd,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    try {
      await this.repository.saveSafetyZoneConfig(updatedConfig);
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Unable to update safety zone configuration: ${err?.message || 'Cache service unavailable'}`,
      );
    }
    this.logger.log(`Safety zone policy '${geofenceId}' updated successfully`);

    return {
      ...updatedConfig,
      geofence: existing.geofence,
    };
  }

  async deleteSafetyZone(geofenceId: string, _currentUser?: any): Promise<boolean> {
    const geofence = await this.repository.findGeofenceById(geofenceId);
    if (!geofence) {
      throw new NotFoundException(`Geofence with ID '${geofenceId}' not found`);
    }

    try {
      await this.repository.deleteSafetyZoneConfig(geofenceId);
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Unable to delete safety zone configuration: ${err?.message || 'Cache service unavailable'}`,
      );
    }
    this.logger.log(`Safety zone policy for geofence '${geofenceId}' removed`);
    return true;
  }

  async evaluatePosition(
    dto: EvaluateSafetyZoneDto,
    currentUser?: any,
  ): Promise<SafetyZoneEvaluationResult> {
    const activeGeofences = await this.repository.findActiveGeofences();
    const violations: SafetyZoneViolation[] = [];
    let insideZoneCount = 0;
    const now = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    for (const fence of activeGeofences) {
      const distance = this.calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        fence.latitude,
        fence.longitude,
      );

      const isInside = distance <= fence.radius_meters;
      if (!isInside) {
        continue;
      }

      insideZoneCount++;

      // Retrieve policy configuration from Redis or default
      let config = await this.repository.findSafetyZoneConfig(fence.id);
      if (!config) {
        config = {
          geofenceId: fence.id,
          speedLimitKmh: 40,
          riskLevel: 'MEDIUM',
          zoneCategory: 'ACCIDENT_PRONE_AREA',
          cooldownMinutes: 15,
          autoReportIncident: false,
          active: true,
          createdAt: fence.created_at,
          updatedAt: fence.updated_at,
        };
      }

      if (!config.active) {
        continue;
      }

      // Check operational active hours
      if (!this.isWithinActiveHours(config.activeTimeStart, config.activeTimeEnd, now)) {
        continue;
      }

      // Check Speed Restriction Violation
      if (dto.speedKmh > config.speedLimitKmh) {
        const overspeedKmh = Math.round((dto.speedKmh - config.speedLimitKmh) * 10) / 10;
        const cooldownSeconds = Math.max(config.cooldownMinutes * 60, 60);

        let isDuplicate = false;
        try {
          const cooldownCheck = await this.repository.checkAndSetAlertCooldown(
            fence.id,
            dto.vehicleId,
            cooldownSeconds,
          );
          isDuplicate = cooldownCheck.isDuplicate;
        } catch (err: any) {
          this.logger.warn(
            `Redis cooldown check failed for vehicle ${dto.vehicleId} in zone ${fence.id}: ${err?.message}`,
          );
        }

        let incidentId: string | undefined;

        if (!isDuplicate) {
          const alertPayload = {
            geofenceId: fence.id,
            geofenceName: fence.name,
            vehicleId: dto.vehicleId,
            tripId: dto.tripId,
            speedLimitKmh: config.speedLimitKmh,
            actualSpeedKmh: dto.speedKmh,
            overspeedKmh,
            riskLevel: config.riskLevel,
            zoneCategory: config.zoneCategory,
            latitude: dto.latitude,
            longitude: dto.longitude,
            occurredAt: now.toISOString(),
          };

          // Record alert in Redis recent alerts list
          try {
            await this.repository.recordRecentAlert(alertPayload);
          } catch (err: any) {
            this.logger.warn(`Failed to store recent alert in Redis: ${err?.message}`);
          }

          // Broadcast to operations room via real-time WebSocket service
          if (this.realTimeService) {
            try {
              await this.realTimeService.publishToRoom(
                'operations',
                'safety_zone_alert',
                alertPayload,
              );
            } catch (err: any) {
              this.logger.warn(`RealTime alert broadcast error: ${err?.message}`);
            }
          }

          // Integration with Module 43: Auto-report severe safety incident if configured or overspeed >= 30 km/h
          const isSevereViolation =
            config.autoReportIncident ||
            overspeedKmh >= 30 ||
            (config.riskLevel === 'CRITICAL' && overspeedKmh >= 15);

          if (isSevereViolation && this.incidentsService) {
            try {
              const systemUser = currentUser?.id
                ? currentUser
                : {
                    id: '00000000-0000-0000-0000-000000000000',
                    email: 'system.safety@movana.internal',
                    roles: ['SAFETY_OFFICER'],
                  };

              const incident = await this.incidentsService.reportIncident(
                {
                  tripId: dto.tripId,
                  vehicleId: dto.vehicleId,
                  incidentTypeId: 'TRAFFIC_COLLISION',
                  severity: config.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
                  title: `Safety Zone Speed Infraction: ${fence.name}`,
                  description: `Vehicle exceeded speed limit by ${overspeedKmh} km/h (actual: ${dto.speedKmh} km/h, limit: ${config.speedLimitKmh} km/h) inside safety zone '${fence.name}' [${config.zoneCategory}].`,
                  latitude: dto.latitude,
                  longitude: dto.longitude,
                  occurredAt: now.toISOString(),
                },
                systemUser,
              );
              incidentId = incident.id;
              this.logger.log(
                `Auto-reported safety incident ${incident.incident_number} for vehicle ${dto.vehicleId}`,
              );
            } catch (err: any) {
              this.logger.error(
                `Failed to auto-report incident in Module 43 for safety zone violation: ${err?.message}`,
              );
            }
          }
        }

        violations.push({
          geofenceId: fence.id,
          geofenceName: fence.name,
          zoneCategory: config.zoneCategory,
          riskLevel: config.riskLevel,
          speedLimitKmh: config.speedLimitKmh,
          actualSpeedKmh: dto.speedKmh,
          overspeedKmh,
          alertDispatched: !isDuplicate,
          deduplicated: isDuplicate,
          incidentId,
          occurredAt: now.toISOString(),
        });
      }
    }

    return {
      vehicleId: dto.vehicleId,
      tripId: dto.tripId,
      latitude: dto.latitude,
      longitude: dto.longitude,
      actualSpeedKmh: dto.speedKmh,
      evaluatedCount: activeGeofences.length,
      insideZoneCount,
      violations,
    };
  }

  async getRecentAlerts(limit = 50): Promise<any[]> {
    return this.repository.getRecentAlerts(limit);
  }
}
