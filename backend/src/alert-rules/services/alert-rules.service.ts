import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  CreateAlertRuleDto,
  EvaluateAlertEventDto,
  UpdateAlertRuleDto,
} from '../dto/create-alert-rule.dto';
import { AlertRuleEntity, AlertRulesRepository } from '../repositories/alert-rules.repository';

@Injectable()
export class AlertRulesService {
  private readonly logger = new Logger(AlertRulesService.name);

  constructor(
    private readonly repository: AlertRulesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  private isStaffRole(user: any): boolean {
    const roles: string[] = user?.roles || [];
    return (
      roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('SAFETY_OFFICER')
    );
  }

  async createRule(dto: CreateAlertRuleDto, currentUser: any): Promise<AlertRuleEntity> {
    const isStaff = this.isStaffRole(currentUser);

    // 1. Permission check for SYSTEM rules
    if (dto.scope === 'SYSTEM' && !isStaff) {
      throw new ForbiddenException(
        'Only ADMIN, OPERATOR, or SAFETY_OFFICER can create system-wide alert rules.',
      );
    }

    // 2. Resolve target user
    let targetUserId = currentUser.id;
    if (dto.targetUserId && dto.targetUserId !== currentUser.id) {
      if (!isStaff) {
        throw new ForbiddenException('Cannot configure alert rules for other passenger accounts.');
      }
      targetUserId = dto.targetUserId;
    }

    // 3. Referential integrity validation against PostgreSQL schema
    if (dto.conditions?.routeId) {
      const exists = await this.repository.validateRouteExists(dto.conditions.routeId);
      if (!exists) {
        throw new NotFoundException(`Route '${dto.conditions.routeId}' not found`);
      }
    }

    if (dto.conditions?.stopId) {
      const exists = await this.repository.validateStopExists(dto.conditions.stopId);
      if (!exists) {
        throw new NotFoundException(`Stop '${dto.conditions.stopId}' not found`);
      }
    }

    if (dto.conditions?.geofenceId) {
      const exists = await this.repository.validateGeofenceExists(dto.conditions.geofenceId);
      if (!exists) {
        throw new NotFoundException(`Geofence '${dto.conditions.geofenceId}' not found`);
      }
    }

    if (dto.conditions?.vehicleId) {
      const exists = await this.repository.validateVehicleExists(dto.conditions.vehicleId);
      if (!exists) {
        throw new NotFoundException(`Vehicle '${dto.conditions.vehicleId}' not found`);
      }
    }

    const rule: AlertRuleEntity = {
      id: randomUUID(),
      name: dto.name,
      eventType: dto.eventType,
      scope: dto.scope || 'PERSONAL',
      conditions: dto.conditions || {},
      channels: dto.channels,
      targetUserId,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
      cooldownMinutes: dto.cooldownMinutes || 15,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.repository.saveRule(rule);
  }

  async getUserRules(currentUser: any, filterUserId?: string): Promise<AlertRuleEntity[]> {
    const isStaff = this.isStaffRole(currentUser);
    const target = filterUserId || currentUser.id;

    if (target !== currentUser.id && !isStaff) {
      throw new ForbiddenException('Cannot query alert rules for other accounts.');
    }

    return this.repository.findRulesByUserId(target);
  }

  async getRuleById(id: string, currentUser: any): Promise<AlertRuleEntity> {
    const rule = await this.repository.findRuleById(id);
    if (!rule) {
      throw new NotFoundException(`Alert rule '${id}' not found`);
    }

    const isOwner = rule.targetUserId === currentUser.id;
    const isStaff = this.isStaffRole(currentUser);
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('Access denied: cannot view alert rules of another user.');
    }

    return rule;
  }

  async updateRule(
    id: string,
    dto: UpdateAlertRuleDto,
    currentUser: any,
  ): Promise<AlertRuleEntity> {
    const rule = await this.getRuleById(id, currentUser);

    const updated: AlertRuleEntity = {
      ...rule,
      name: dto.name || rule.name,
      conditions: dto.conditions ? { ...rule.conditions, ...dto.conditions } : rule.conditions,
      channels: dto.channels || rule.channels,
      isActive: dto.isActive !== undefined ? dto.isActive : rule.isActive,
      cooldownMinutes: dto.cooldownMinutes || rule.cooldownMinutes,
      updatedAt: new Date().toISOString(),
    };

    return this.repository.saveRule(updated);
  }

  async toggleRuleActive(
    id: string,
    isActive: boolean,
    currentUser: any,
  ): Promise<AlertRuleEntity> {
    const rule = await this.getRuleById(id, currentUser);
    rule.isActive = isActive;
    rule.updatedAt = new Date().toISOString();
    return this.repository.saveRule(rule);
  }

  async deleteRule(id: string, currentUser: any): Promise<{ success: boolean }> {
    const rule = await this.getRuleById(id, currentUser);
    await this.repository.deleteRule(rule);
    return { success: true };
  }

  async evaluateEvent(
    dto: EvaluateAlertEventDto,
    currentUser: any,
  ): Promise<{
    eventType: string;
    evaluatedRulesCount: number;
    triggeredAlertsCount: number;
    triggeredAlerts: Array<{
      ruleId: string;
      ruleName: string;
      targetUserId: string;
      channel: string;
      status: string;
    }>;
  }> {
    const isStaff = this.isStaffRole(currentUser);
    if (!isStaff) {
      throw new ForbiddenException(
        'Only operations staff can evaluate events against alert rules.',
      );
    }

    const activeRules = await this.repository.findActiveRulesByEventType(dto.eventType);
    const triggeredAlerts: Array<{
      ruleId: string;
      ruleName: string;
      targetUserId: string;
      channel: string;
      status: string;
    }> = [];

    for (const rule of activeRules) {
      // 1. Evaluate condition match
      let matches = true;
      const c = rule.conditions || {};
      const p = dto.eventPayload || {};

      if (dto.eventType === 'TRIP_DELAY_DETECTED') {
        if (c.thresholdMinutes !== undefined && (p.delayMinutes ?? 0) < c.thresholdMinutes) {
          matches = false;
        }
        if (c.routeId && p.routeId !== c.routeId) {
          matches = false;
        }
        if (c.tripId && p.tripId !== c.tripId) {
          matches = false;
        }
      } else if (dto.eventType === 'GEOFENCE_ENTER' || dto.eventType === 'GEOFENCE_EXIT') {
        if (c.geofenceId && p.geofenceId !== c.geofenceId) {
          matches = false;
        }
        if (c.vehicleId && p.vehicleId !== c.vehicleId) {
          matches = false;
        }
      } else if (dto.eventType === 'VEHICLE_SPEED_EXCEEDED') {
        if (c.maxSpeedKmh !== undefined && (p.speedKmh ?? 0) <= c.maxSpeedKmh) {
          matches = false;
        }
        if (c.vehicleId && p.vehicleId !== c.vehicleId) {
          matches = false;
        }
      } else if (dto.eventType === 'SERVICE_DISRUPTION_BROADCAST') {
        if (c.severity && p.severity !== c.severity) {
          matches = false;
        }
        if (c.routeId && p.routeId !== c.routeId) {
          matches = false;
        }
      } else if (dto.eventType === 'STOP_ARRIVED' || dto.eventType === 'STOP_SKIPPED') {
        if (c.stopId && p.stopId !== c.stopId) {
          matches = false;
        }
        if (c.tripId && p.tripId !== c.tripId) {
          matches = false;
        }
      }

      if (!matches) {
        continue;
      }

      // 2. Anti-recursion / deduplication check via Redis
      const entityKey = p.tripId || p.vehicleId || p.geofenceId || p.stopId || 'system-event';
      const isDeduped = await this.repository.isDeduplicated(
        rule.id,
        entityKey,
        rule.cooldownMinutes,
      );

      if (isDeduped) {
        this.logger.debug(`Alert rule '${rule.id}' deduplicated for entity '${entityKey}'`);
        continue;
      }

      // 3. Dispatch notifications across configured channels
      for (const channel of rule.channels) {
        try {
          await this.notificationsService.dispatch(
            {
              userId: rule.targetUserId,
              title: `Alert: ${rule.name}`,
              message:
                p.message || `Alert triggered for event ${dto.eventType} on entity ${entityKey}`,
              channel,
              category:
                dto.eventType === 'TRIP_DELAY_DETECTED'
                  ? 'DELAY_ALERT'
                  : dto.eventType === 'SERVICE_DISRUPTION_BROADCAST'
                    ? 'DISRUPTION'
                    : 'SYSTEM',
              metadata: {
                ruleId: rule.id,
                eventType: dto.eventType,
                ...p,
              },
            },
            currentUser,
          );

          triggeredAlerts.push({
            ruleId: rule.id,
            ruleName: rule.name,
            targetUserId: rule.targetUserId,
            channel,
            status: 'DISPATCHED',
          });
        } catch (err: any) {
          this.logger.warn(
            `Failed to dispatch alert notification for rule ${rule.id} on channel ${channel}: ${err.message}`,
          );
          triggeredAlerts.push({
            ruleId: rule.id,
            ruleName: rule.name,
            targetUserId: rule.targetUserId,
            channel,
            status: `FAILED: ${err.message}`,
          });
        }
      }
    }

    return {
      eventType: dto.eventType,
      evaluatedRulesCount: activeRules.length,
      triggeredAlertsCount: triggeredAlerts.length,
      triggeredAlerts,
    };
  }
}
