import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { AssignIncidentDto } from '../dto/assign-incident.dto';
import { CloseIncidentDto } from '../dto/close-incident.dto';
import { CreateIncidentActionDto } from '../dto/create-action.dto';
import { QueryIncidentManagementDto } from '../dto/query-incident-management.dto';
import { ResolveIncidentDto } from '../dto/resolve-incident.dto';
import { TransitionIncidentStatusDto } from '../dto/transition-status.dto';
import {
  IncidentActionEntity,
  IncidentEntity,
  IncidentManagementRepository,
  IncidentReportEntity,
  InvestigatorAssignment,
} from '../repositories/incident-management.repository';

export interface TimelineEvent {
  type:
    'CREATION' | 'STATUS_CHANGE' | 'ASSIGNMENT' | 'ACTION' | 'REPORT' | 'RESOLUTION' | 'CLOSURE';
  timestamp: string;
  actorId?: string;
  actorName?: string;
  details: string;
  metadata?: Record<string, any>;
}

export interface IncidentLifecycleDetails {
  incident: IncidentEntity;
  assignment: InvestigatorAssignment | null;
  actions: IncidentActionEntity[];
  reports: IncidentReportEntity[];
  timeline: TimelineEvent[];
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['INVESTIGATING'],
  INVESTIGATING: ['ACTION_REQUIRED', 'RESOLVED'],
  ACTION_REQUIRED: ['RESOLVED', 'INVESTIGATING'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: ['INVESTIGATING'],
};

@Injectable()
export class IncidentManagementService {
  private readonly logger = new Logger(IncidentManagementService.name);

  constructor(
    private readonly repository: IncidentManagementRepository,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  private isStaff(user: any): boolean {
    const roles: string[] = user?.roles || [];
    return (
      roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('SAFETY_OFFICER')
    );
  }

  private isAdmin(user: any): boolean {
    const roles: string[] = user?.roles || [];
    return roles.includes('ADMIN');
  }

  private async notifyReporterSafe(
    reporterId: string,
    title: string,
    message: string,
  ): Promise<void> {
    if (!this.notificationsService) {
      return;
    }
    try {
      await this.notificationsService.dispatch({
        userId: reporterId,
        title,
        message,
        channel: 'IN_APP',
        category: 'SECURITY_ALERT',
      });
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch notification to reporter ${reporterId}: ${err.message}`);
    }
  }

  async getIncidentLifecycle(
    incidentId: string,
    currentUser: any,
  ): Promise<IncidentLifecycleDetails> {
    const incident = await this.repository.findIncidentById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident with id '${incidentId}' not found`);
    }

    const isStaffUser = this.isStaff(currentUser);
    const isReporter = currentUser?.id === incident.reported_by;

    if (!isStaffUser && !isReporter) {
      throw new ForbiddenException('You do not have permission to view this incident');
    }

    const [actions, reports, assignment] = await Promise.all([
      this.repository.findActionsByIncidentId(incidentId),
      this.repository.findReportsByIncidentId(incidentId),
      this.repository.getAssignment(incidentId),
    ]);

    const timeline: TimelineEvent[] = [];

    // 1. Initial report creation
    timeline.push({
      type: 'CREATION',
      timestamp: incident.reported_at || incident.created_at,
      actorId: incident.reported_by,
      actorName: incident.reporter_name,
      details: `Incident reported: ${incident.title} (${incident.severity})`,
      metadata: {
        incidentNumber: incident.incident_number,
        severity: incident.severity,
      },
    });

    // 2. Incident reports / findings
    for (const report of reports) {
      timeline.push({
        type: 'REPORT',
        timestamp: report.created_at,
        actorId: report.submitted_by,
        actorName: report.submitted_by_name,
        details: report.report_details,
        metadata: {
          witnessCount: Array.isArray(report.witnesses) ? report.witnesses.length : 0,
        },
      });
    }

    // 3. Actions taken
    for (const action of actions) {
      let eventType: TimelineEvent['type'] = 'ACTION';
      if (action.action_taken.startsWith('Investigator assigned:')) {
        eventType = 'ASSIGNMENT';
      } else if (action.action_taken.startsWith('Status changed')) {
        eventType = 'STATUS_CHANGE';
      } else if (action.action_taken.startsWith('Incident resolved')) {
        eventType = 'RESOLUTION';
      } else if (action.action_taken.startsWith('Incident closed')) {
        eventType = 'CLOSURE';
      }

      timeline.push({
        type: eventType,
        timestamp: action.action_date || action.created_at,
        actorId: action.taken_by,
        actorName: action.taken_by_name,
        details: action.action_taken,
        metadata: {
          status: action.status,
        },
      });
    }

    // Sort timeline ascending by timestamp
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      incident,
      assignment,
      actions,
      reports,
      timeline,
    };
  }

  async assignInvestigator(
    incidentId: string,
    dto: AssignIncidentDto,
    currentUser: any,
  ): Promise<{
    incident: IncidentEntity;
    assignment: InvestigatorAssignment;
  }> {
    const incident = await this.repository.findIncidentById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident with id '${incidentId}' not found`);
    }

    if (incident.status === 'CLOSED') {
      throw new BadRequestException(
        'Cannot assign an investigator to a closed incident. Reopen it first.',
      );
    }

    const investigatorCheck = await this.repository.validateUserExistsAndStaff(dto.assignedTo);
    if (!investigatorCheck.exists || !investigatorCheck.user) {
      throw new NotFoundException(`Investigator user '${dto.assignedTo}' not found`);
    }

    if (!investigatorCheck.isStaff) {
      throw new BadRequestException(
        `User '${dto.assignedTo}' is not eligible. Investigator must have a staff role (ADMIN, OPERATOR, SAFETY_OFFICER).`,
      );
    }

    let updatedIncident = incident;
    // Auto-transition OPEN to INVESTIGATING upon assigning investigator
    if (incident.status === 'OPEN') {
      const transitioned = await this.repository.updateIncidentStatus(
        incidentId,
        'INVESTIGATING',
        null,
      );
      if (transitioned) {
        updatedIncident = transitioned;
      }
    }

    const assignment: InvestigatorAssignment = {
      incidentId,
      assignedTo: dto.assignedTo,
      assignedToName: investigatorCheck.user.fullName,
      assignedToEmail: investigatorCheck.user.email,
      assignedBy: currentUser.id,
      assignedAt: new Date().toISOString(),
      notes: dto.assignmentNotes,
    };

    await this.repository.saveAssignment(assignment);

    const actionText = `Investigator assigned: ${investigatorCheck.user.fullName} (${investigatorCheck.user.email})${
      dto.assignmentNotes ? ` - Notes: ${dto.assignmentNotes}` : ''
    }`;

    await this.repository.createIncidentAction(incidentId, actionText, currentUser.id, 'COMPLETED');

    // Notify assigned investigator
    await this.notifyReporterSafe(
      dto.assignedTo,
      'Incident Investigation Assignment',
      `You have been assigned to investigate incident ${incident.incident_number}: "${incident.title}".`,
    );

    return {
      incident: updatedIncident,
      assignment,
    };
  }

  async transitionStatus(
    incidentId: string,
    dto: TransitionIncidentStatusDto,
    currentUser: any,
  ): Promise<IncidentEntity> {
    const incident = await this.repository.findIncidentById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident with id '${incidentId}' not found`);
    }

    const currentStatus = incident.status;
    const targetStatus = dto.status;

    if (currentStatus === targetStatus) {
      return incident;
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid status transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions from '${currentStatus}': [${allowed.join(
          ', ',
        )}]`,
      );
    }

    // Special constraint: Reopening a CLOSED incident requires ADMIN
    if (
      currentStatus === 'CLOSED' &&
      targetStatus === 'INVESTIGATING' &&
      !this.isAdmin(currentUser)
    ) {
      throw new ForbiddenException('Only administrators can reopen a closed incident');
    }

    let resolvedAt: Date | null = incident.resolved_at ? new Date(incident.resolved_at) : null;
    if (targetStatus === 'RESOLVED') {
      resolvedAt = new Date();
    } else if (
      (currentStatus === 'RESOLVED' || currentStatus === 'CLOSED') &&
      targetStatus === 'INVESTIGATING'
    ) {
      resolvedAt = null;
    }

    const updated = await this.repository.updateIncidentStatus(
      incidentId,
      targetStatus,
      resolvedAt,
    );
    if (!updated) {
      throw new NotFoundException(`Failed to update incident '${incidentId}'`);
    }

    const actionDetail = `Status changed from ${currentStatus} to ${targetStatus}${
      dto.notes ? `: ${dto.notes}` : ''
    }`;

    await this.repository.createIncidentAction(
      incidentId,
      actionDetail,
      currentUser.id,
      'COMPLETED',
    );

    if (dto.notes) {
      await this.repository.createIncidentReport(
        incidentId,
        currentUser.id,
        `Status transition to ${targetStatus}: ${dto.notes}`,
        [],
      );
    }

    // Notify reporter on status change
    await this.notifyReporterSafe(
      incident.reported_by,
      `Incident Status Updated: ${targetStatus}`,
      `Your incident (${incident.incident_number}) status is now ${targetStatus}.`,
    );

    return updated;
  }

  async recordCorrectiveAction(
    incidentId: string,
    dto: CreateIncidentActionDto,
    currentUser: any,
  ): Promise<IncidentActionEntity> {
    const incident = await this.repository.findIncidentById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident with id '${incidentId}' not found`);
    }

    if (incident.status === 'CLOSED') {
      throw new BadRequestException(
        'Cannot record corrective actions on a closed incident. Reopen the incident first.',
      );
    }

    return this.repository.createIncidentAction(
      incidentId,
      dto.actionTaken,
      currentUser.id,
      dto.status,
    );
  }

  async resolveIncident(
    incidentId: string,
    dto: ResolveIncidentDto,
    currentUser: any,
  ): Promise<{
    incident: IncidentEntity;
    reports: IncidentReportEntity[];
    actions: IncidentActionEntity[];
  }> {
    const incident = await this.repository.findIncidentById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident with id '${incidentId}' not found`);
    }

    if (incident.status === 'OPEN') {
      throw new BadRequestException(
        'Cannot resolve an incident directly from OPEN status. An investigation must be started first.',
      );
    }

    if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') {
      throw new BadRequestException(
        `Incident is already ${incident.status.toLowerCase()}. Cannot resolve again.`,
      );
    }

    const resolvedAt = new Date();
    const updated = await this.repository.updateIncidentStatus(incidentId, 'RESOLVED', resolvedAt);
    if (!updated) {
      throw new NotFoundException(`Failed to resolve incident '${incidentId}'`);
    }

    // Add resolution report
    await this.repository.createIncidentReport(
      incidentId,
      currentUser.id,
      `Resolution: ${dto.resolutionNotes}`,
      [],
    );

    // If corrective action specified, record action
    if (dto.correctiveAction) {
      await this.repository.createIncidentAction(
        incidentId,
        `Corrective Action: ${dto.correctiveAction}`,
        currentUser.id,
        'COMPLETED',
      );
    }

    // Record resolution action
    await this.repository.createIncidentAction(
      incidentId,
      `Incident resolved: ${dto.resolutionNotes}`,
      currentUser.id,
      'COMPLETED',
    );

    const [reports, actions] = await Promise.all([
      this.repository.findReportsByIncidentId(incidentId),
      this.repository.findActionsByIncidentId(incidentId),
    ]);

    await this.notifyReporterSafe(
      incident.reported_by,
      'Incident Resolved',
      `Your incident (${incident.incident_number}) has been marked as RESOLVED. Notes: ${dto.resolutionNotes}`,
    );

    return {
      incident: updated,
      reports,
      actions,
    };
  }

  async closeIncident(
    incidentId: string,
    dto: CloseIncidentDto,
    currentUser: any,
  ): Promise<IncidentEntity> {
    const incident = await this.repository.findIncidentById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident with id '${incidentId}' not found`);
    }

    if (incident.status !== 'RESOLVED') {
      throw new BadRequestException(
        `Only RESOLVED incidents can be closed. Current status is '${incident.status}'.`,
      );
    }

    const updated = await this.repository.updateIncidentStatus(
      incidentId,
      'CLOSED',
      incident.resolved_at ? new Date(incident.resolved_at) : new Date(),
    );
    if (!updated) {
      throw new NotFoundException(`Failed to close incident '${incidentId}'`);
    }

    const closingDetail = `Incident closed${dto.notes ? `: ${dto.notes}` : ''}`;
    await this.repository.createIncidentAction(
      incidentId,
      closingDetail,
      currentUser.id,
      'COMPLETED',
    );

    await this.notifyReporterSafe(
      incident.reported_by,
      'Incident Closed',
      `Your incident (${incident.incident_number}) investigation has been completed and officially closed.`,
    );

    return updated;
  }

  async listIncidents(query: QueryIncidentManagementDto): Promise<{
    incidents: IncidentEntity[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = query.limit !== undefined ? Number(query.limit) : 20;
    const offset = query.offset !== undefined ? Number(query.offset) : 0;
    const res = await this.repository.findIncidents({
      ...query,
      limit,
      offset,
    });
    return {
      incidents: res.incidents,
      total: res.total,
      limit,
      offset,
    };
  }
}
