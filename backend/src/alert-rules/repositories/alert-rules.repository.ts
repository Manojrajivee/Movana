import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { AlertConditionsDto, AlertEventType, AlertRuleScope } from '../dto/create-alert-rule.dto';
import { NotificationChannel } from '../../notifications/dto/create-notification.dto';

export interface AlertRuleEntity {
  id: string;
  name: string;
  eventType: AlertEventType;
  scope: AlertRuleScope;
  conditions: AlertConditionsDto;
  channels: NotificationChannel[];
  targetUserId: string;
  isActive: boolean;
  cooldownMinutes: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class AlertRulesRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async saveRule(rule: AlertRuleEntity): Promise<AlertRuleEntity> {
    const key = `movana:alert_rules:${rule.id}`;
    await this.redis.set(key, JSON.stringify(rule), 2592000); // 30 days
    await this.redis.sadd(`movana:alert_rules:user:${rule.targetUserId}`, rule.id);
    await this.redis.sadd(`movana:alert_rules:type:${rule.eventType}`, rule.id);
    return rule;
  }

  async findRuleById(id: string): Promise<AlertRuleEntity | null> {
    const key = `movana:alert_rules:${id}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AlertRuleEntity;
    } catch {
      return null;
    }
  }

  async findRulesByUserId(userId: string): Promise<AlertRuleEntity[]> {
    const ruleIds = await this.redis.smembers(`movana:alert_rules:user:${userId}`);
    if (!ruleIds || ruleIds.length === 0) return [];

    const rules: AlertRuleEntity[] = [];
    for (const id of ruleIds) {
      const rule = await this.findRuleById(id);
      if (rule) rules.push(rule);
    }
    return rules;
  }

  async findActiveRulesByEventType(eventType: AlertEventType): Promise<AlertRuleEntity[]> {
    const ruleIds = await this.redis.smembers(`movana:alert_rules:type:${eventType}`);
    if (!ruleIds || ruleIds.length === 0) return [];

    const rules: AlertRuleEntity[] = [];
    for (const id of ruleIds) {
      const rule = await this.findRuleById(id);
      if (rule && rule.isActive) rules.push(rule);
    }
    return rules;
  }

  async deleteRule(rule: AlertRuleEntity): Promise<boolean> {
    const key = `movana:alert_rules:${rule.id}`;
    await this.redis.del(key);
    await this.redis.srem(`movana:alert_rules:user:${rule.targetUserId}`, rule.id);
    await this.redis.srem(`movana:alert_rules:type:${rule.eventType}`, rule.id);
    return true;
  }

  async isDeduplicated(
    ruleId: string,
    eventEntityKey: string,
    cooldownMinutes: number,
  ): Promise<boolean> {
    const dedupKey = `movana:alert_rules:dedup:${ruleId}:${eventEntityKey}`;
    const exists = await this.redis.get(dedupKey);
    if (exists) {
      return true;
    }
    const ttlSeconds = Math.max(60, cooldownMinutes * 60);
    await this.redis.set(dedupKey, '1', ttlSeconds);
    return false;
  }

  async validateRouteExists(routeId: string): Promise<boolean> {
    const query = `SELECT 1 FROM routes WHERE id = $1;`;
    const res = await this.db.query(query, [routeId]);
    return res.rows.length > 0;
  }

  async validateStopExists(stopId: string): Promise<boolean> {
    const query = `SELECT 1 FROM stops WHERE id = $1;`;
    const res = await this.db.query(query, [stopId]);
    return res.rows.length > 0;
  }

  async validateGeofenceExists(geofenceId: string): Promise<boolean> {
    const query = `SELECT 1 FROM geofences WHERE id = $1;`;
    const res = await this.db.query(query, [geofenceId]);
    return res.rows.length > 0;
  }

  async validateVehicleExists(vehicleId: string): Promise<boolean> {
    const query = `SELECT 1 FROM vehicles WHERE id = $1;`;
    const res = await this.db.query(query, [vehicleId]);
    return res.rows.length > 0;
  }

  async validateUserExists(userId: string): Promise<boolean> {
    const query = `SELECT 1 FROM users WHERE id = $1;`;
    const res = await this.db.query(query, [userId]);
    return res.rows.length > 0;
  }
}
