import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AddWitnessStatementDto } from '../dto/add-witness.dto';
import { CreateIncidentDto } from '../dto/create-incident.dto';
import { QueryIncidentsDto } from '../dto/query-incidents.dto';
import {
  IncidentEntity,
  IncidentReportEntity,
  IncidentSeverityLevelEntity,
  IncidentTypeEntity,
  IncidentWithReportsEntity,
  IncidentsRepository,
} from '../repositories/incidents.repository';

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(private readonly repository: IncidentsRepository) {}

  private isStaffRole(user: any): boolean {
    const roles: string[] = user?.roles || [];
    return (
      roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('SAFETY_OFFICER')
    );
  }

  private generateIncidentNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `INC-${dateStr}-${randSuffix}`;
  }

  async getIncidentTypes(): Promise<IncidentTypeEntity[]> {
    return this.repository.findIncidentTypes();
  }

  async getSeverityLevels(): Promise<IncidentSeverityLevelEntity[]> {
    return this.repository.findSeverityLevels();
  }

  async reportIncident(
    dto: CreateIncidentDto,
    currentUser: any,
  ): Promise<IncidentWithReportsEntity> {
    // 1. Validate Incident Type
    const incidentType = await this.repository.findIncidentTypeByIdOrCode(dto.incidentTypeId);
    if (!incidentType) {
      throw new BadRequestException(`Invalid incident type: '${dto.incidentTypeId}'`);
    }

    let vehicleId = dto.vehicleId || null;
    let driverId = dto.driverId || null;

    // 2. Validate Trip and Authorization if trip is specified
    if (dto.tripId) {
      const tripInfo = await this.repository.validateTripExists(dto.tripId);
      if (!tripInfo.exists) {
        throw new NotFoundException(`Trip '${dto.tripId}' not found`);
      }

      const isAuthorized = await this.repository.validateReporterTripAuthorization(
        currentUser.id,
        dto.tripId,
        currentUser.roles || [],
      );
      if (!isAuthorized) {
        throw new ForbiddenException(
          `Access denied: you are not authorized to report an incident for trip '${dto.tripId}'`,
        );
      }

      // Anti-spoofing: Trip-derived vehicle and driver are authoritative.
      // Client-supplied fields cannot override the trip's assigned vehicle or driver.
      if (tripInfo.vehicleId) {
        vehicleId = tripInfo.vehicleId;
      } else if (this.isStaffRole(currentUser) && dto.vehicleId) {
        const vehExists = await this.repository.validateVehicleExists(dto.vehicleId);
        if (!vehExists) {
          throw new NotFoundException(`Vehicle '${dto.vehicleId}' not found`);
        }
        vehicleId = dto.vehicleId;
      } else {
        vehicleId = null;
      }

      if (tripInfo.driverId) {
        driverId = tripInfo.driverId;
      } else if (this.isStaffRole(currentUser) && dto.driverId) {
        const drvExists = await this.repository.validateDriverExists(dto.driverId);
        if (!drvExists) {
          throw new NotFoundException(`Driver '${dto.driverId}' not found`);
        }
        driverId = dto.driverId;
      } else {
        driverId = null;
      }
    } else {
      // Validate stand-alone vehicle / driver references if explicitly provided
      if (vehicleId) {
        const vehExists = await this.repository.validateVehicleExists(vehicleId);
        if (!vehExists) {
          throw new NotFoundException(`Vehicle '${vehicleId}' not found`);
        }
      }
      if (driverId) {
        const drvExists = await this.repository.validateDriverExists(driverId);
        if (!drvExists) {
          throw new NotFoundException(`Driver '${driverId}' not found`);
        }
      }
    }

    // 3. Create Master Incident Record with collision retry
    let incident: IncidentEntity | null = null;
    let attempts = 0;
    while (attempts < 3) {
      try {
        const incidentNumber = this.generateIncidentNumber();
        incident = await this.repository.createIncident({
          incidentNumber,
          tripId: dto.tripId || null,
          vehicleId,
          driverId,
          reportedBy: currentUser.id,
          incidentTypeId: incidentType.id,
          severity: dto.severity || 'MEDIUM',
          title: dto.title,
          description: dto.description,
          latitude: dto.latitude !== undefined ? dto.latitude : null,
          longitude: dto.longitude !== undefined ? dto.longitude : null,
          occurredAt: dto.occurredAt || null,
        });
        break;
      } catch (err: any) {
        attempts++;
        if (err?.code === '23505' && attempts < 3) {
          this.logger.warn(`Collision on incident_number, retrying attempt ${attempts}/3...`);
          continue;
        }
        throw err;
      }
    }

    if (!incident) {
      throw new BadRequestException('Unable to create incident record after retry attempts');
    }

    // 5. Create Incident Report / Witness Statements if provided
    let reports: IncidentReportEntity[] = [];
    if (dto.witnesses && dto.witnesses.length > 0) {
      const report = await this.repository.createIncidentReport(
        incident.id,
        currentUser.id,
        dto.description,
        dto.witnesses,
      );
      reports = [report];
    }

    this.logger.log(
      `Incident ${incident.incident_number} (${incident.id}) reported by user ${currentUser.id} [Severity: ${incident.severity}]`,
    );

    return {
      ...incident,
      incident_type_name: incidentType.name,
      incident_type_code: incidentType.code,
      reports,
    };
  }

  async addWitnessStatement(
    incidentId: string,
    dto: AddWitnessStatementDto,
    currentUser: any,
  ): Promise<IncidentReportEntity> {
    const incident = await this.repository.findIncidentById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident '${incidentId}' not found`);
    }

    const isReporter = incident.reported_by === currentUser.id;
    const isStaff = this.isStaffRole(currentUser);

    if (!isReporter && !isStaff) {
      throw new ForbiddenException(
        'Access denied: only the incident reporter or safety operations staff can add witness statements',
      );
    }

    const report = await this.repository.createIncidentReport(
      incidentId,
      currentUser.id,
      dto.reportDetails,
      dto.witnesses,
    );

    this.logger.log(
      `Witness statement report added to incident ${incidentId} by user ${currentUser.id}`,
    );

    return report;
  }

  async getMyIncidents(currentUser: any): Promise<IncidentEntity[]> {
    return this.repository.findIncidentsByReporter(currentUser.id);
  }

  async getIncidentById(id: string, currentUser: any): Promise<IncidentWithReportsEntity> {
    const incident = await this.repository.findIncidentById(id);
    if (!incident) {
      throw new NotFoundException(`Incident '${id}' not found`);
    }

    const isReporter = incident.reported_by === currentUser.id;
    const isStaff = this.isStaffRole(currentUser);

    if (!isReporter && !isStaff) {
      throw new ForbiddenException(
        'Access denied: you do not have permission to view this incident',
      );
    }

    return incident;
  }

  async getIncidents(
    filter: QueryIncidentsDto,
    currentUser: any,
  ): Promise<{ items: IncidentEntity[]; total: number }> {
    if (!this.isStaffRole(currentUser)) {
      throw new ForbiddenException(
        'Access denied: required role in [ADMIN, OPERATOR, SAFETY_OFFICER]',
      );
    }
    return this.repository.findIncidents(filter);
  }
}
