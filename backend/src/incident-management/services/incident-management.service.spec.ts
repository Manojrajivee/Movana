import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../notifications/services/notifications.service';
import {
  IncidentActionEntity,
  IncidentEntity,
  IncidentManagementRepository,
  IncidentReportEntity,
  InvestigatorAssignment,
} from '../repositories/incident-management.repository';
import { IncidentManagementService } from './incident-management.service';

describe('IncidentManagementService', () => {
  let service: IncidentManagementService;
  let repository: jest.Mocked<IncidentManagementRepository>;
  let notificationsService: jest.Mocked<NotificationsService>;

  const reporterId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const staffUserId = '33333333-3333-4333-a333-333333333333';
  const adminUserId = '44444444-4444-4444-a444-444444444444';
  const investigatorId = '55555555-5555-4555-a555-555555555555';
  const incidentId = '88888888-8888-4888-a888-888888888888';

  const mockReporter = {
    id: reporterId,
    email: 'passenger@example.com',
    roles: ['PASSENGER'],
  };

  const mockOtherUser = {
    id: otherUserId,
    email: 'other@example.com',
    roles: ['PASSENGER'],
  };

  const mockStaffUser = {
    id: staffUserId,
    email: 'safety@example.com',
    roles: ['SAFETY_OFFICER'],
  };

  const mockAdminUser = {
    id: adminUserId,
    email: 'admin@example.com',
    roles: ['ADMIN'],
  };

  const baseIncident: IncidentEntity = {
    id: incidentId,
    incident_number: 'INC-20261028-001',
    trip_id: null,
    vehicle_id: null,
    driver_id: null,
    reported_by: reporterId,
    incident_type_id: 'type-1',
    incident_type_name: 'Overcrowding',
    incident_type_code: 'OVERCROWDED',
    reporter_name: 'Passenger Jane',
    reporter_email: 'passenger@example.com',
    severity: 'MEDIUM',
    title: 'Bus was overcrowded',
    description: 'Bus exceeded safe capacity at rush hour',
    latitude: 6.9271,
    longitude: 79.8612,
    occurred_at: '2026-10-28T10:00:00Z',
    reported_at: '2026-10-28T10:05:00Z',
    status: 'OPEN',
    resolved_at: null,
    created_at: '2026-10-28T10:05:00Z',
    updated_at: '2026-10-28T10:05:00Z',
  };

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<IncidentManagementRepository>> = {
      findIncidentById: jest.fn(),
      updateIncidentStatus: jest.fn(),
      createIncidentAction: jest.fn(),
      findActionsByIncidentId: jest.fn(),
      createIncidentReport: jest.fn(),
      findReportsByIncidentId: jest.fn(),
      validateUserExistsAndStaff: jest.fn(),
      findIncidents: jest.fn(),
      getAssignment: jest.fn(),
      saveAssignment: jest.fn(),
    };

    const mockNotifications: Partial<jest.Mocked<NotificationsService>> = {
      dispatch: jest.fn().mockResolvedValue({} as any),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentManagementService,
        {
          provide: IncidentManagementRepository,
          useValue: mockRepo,
        },
        {
          provide: NotificationsService,
          useValue: mockNotifications,
        },
      ],
    }).compile();

    service = module.get<IncidentManagementService>(IncidentManagementService);
    repository = module.get(IncidentManagementRepository);
    notificationsService = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getIncidentLifecycle', () => {
    it('throws NotFoundException if incident does not exist', async () => {
      repository.findIncidentById.mockResolvedValue(null);

      await expect(service.getIncidentLifecycle(incidentId, mockStaffUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if non-staff user is not the reporter', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);

      await expect(service.getIncidentLifecycle(incidentId, mockOtherUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows the original reporter to view lifecycle history', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);
      repository.findActionsByIncidentId.mockResolvedValue([]);
      repository.findReportsByIncidentId.mockResolvedValue([]);
      repository.getAssignment.mockResolvedValue(null);

      const result = await service.getIncidentLifecycle(incidentId, mockReporter);
      expect(result.incident.id).toBe(incidentId);
      expect(result.timeline.length).toBeGreaterThanOrEqual(1);
      expect(result.timeline[0].type).toBe('CREATION');
    });

    it('returns full timeline, reports, actions, and assignment for staff', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);
      const mockAction: IncidentActionEntity = {
        id: 'act-1',
        incident_id: incidentId,
        action_taken: 'Investigator assigned: John Doe (john@example.com)',
        taken_by: staffUserId,
        action_date: '2026-10-28T10:15:00Z',
        status: 'COMPLETED',
        created_at: '2026-10-28T10:15:00Z',
      };
      const mockReport: IncidentReportEntity = {
        id: 'rep-1',
        incident_id: incidentId,
        submitted_by: staffUserId,
        report_details: 'Investigation in progress: inspected depot log',
        witnesses: [],
        created_at: '2026-10-28T10:20:00Z',
      };
      const mockAssignment: InvestigatorAssignment = {
        incidentId,
        assignedTo: investigatorId,
        assignedToName: 'John Doe',
        assignedToEmail: 'john@example.com',
        assignedBy: staffUserId,
        assignedAt: '2026-10-28T10:15:00Z',
      };

      repository.findActionsByIncidentId.mockResolvedValue([mockAction]);
      repository.findReportsByIncidentId.mockResolvedValue([mockReport]);
      repository.getAssignment.mockResolvedValue(mockAssignment);

      const result = await service.getIncidentLifecycle(incidentId, mockStaffUser);
      expect(result.incident.id).toBe(incidentId);
      expect(result.actions).toHaveLength(1);
      expect(result.reports).toHaveLength(1);
      expect(result.assignment).toEqual(mockAssignment);
      expect(result.timeline).toHaveLength(3); // CREATION, ASSIGNMENT, REPORT
    });
  });

  describe('assignInvestigator', () => {
    it('throws NotFoundException if incident does not exist', async () => {
      repository.findIncidentById.mockResolvedValue(null);

      await expect(
        service.assignInvestigator(
          incidentId,
          { assignedTo: investigatorId, assignmentNotes: 'Check cameras' },
          mockStaffUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if incident is CLOSED', async () => {
      repository.findIncidentById.mockResolvedValue({ ...baseIncident, status: 'CLOSED' });

      await expect(
        service.assignInvestigator(incidentId, { assignedTo: investigatorId }, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if investigator user does not exist', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);
      repository.validateUserExistsAndStaff.mockResolvedValue({ exists: false, isStaff: false });

      await expect(
        service.assignInvestigator(incidentId, { assignedTo: investigatorId }, mockStaffUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if investigator user is not staff', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);
      repository.validateUserExistsAndStaff.mockResolvedValue({
        exists: true,
        isStaff: false,
        user: {
          id: investigatorId,
          email: 'p@test.com',
          fullName: 'Passenger',
          roles: ['PASSENGER'],
        },
      });

      await expect(
        service.assignInvestigator(incidentId, { assignedTo: investigatorId }, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully assigns investigator, updates status from OPEN to INVESTIGATING, and logs action', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);
      repository.validateUserExistsAndStaff.mockResolvedValue({
        exists: true,
        isStaff: true,
        user: {
          id: investigatorId,
          email: 'investigator@movana.com',
          fullName: 'Bob Investigator',
          roles: ['SAFETY_OFFICER'],
        },
      });
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'INVESTIGATING',
      });
      repository.saveAssignment.mockResolvedValue();
      repository.createIncidentAction.mockResolvedValue({
        id: 'act-new',
        incident_id: incidentId,
        action_taken:
          'Investigator assigned: Bob Investigator (investigator@movana.com) - Notes: Review footage',
        taken_by: staffUserId,
        action_date: new Date().toISOString(),
        status: 'COMPLETED',
        created_at: new Date().toISOString(),
      });

      const result = await service.assignInvestigator(
        incidentId,
        { assignedTo: investigatorId, assignmentNotes: 'Review footage' },
        mockStaffUser,
      );

      expect(repository.updateIncidentStatus).toHaveBeenCalledWith(
        incidentId,
        'INVESTIGATING',
        null,
      );
      expect(repository.saveAssignment).toHaveBeenCalled();
      expect(repository.createIncidentAction).toHaveBeenCalled();
      expect(result.assignment.assignedTo).toBe(investigatorId);
      expect(result.incident.status).toBe('INVESTIGATING');
      expect(notificationsService.dispatch).toHaveBeenCalled();
    });
  });

  describe('transitionStatus', () => {
    it('throws NotFoundException if incident does not exist', async () => {
      repository.findIncidentById.mockResolvedValue(null);

      await expect(
        service.transitionStatus(incidentId, { status: 'INVESTIGATING' }, mockStaffUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns unchanged incident if status is identical', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);

      const result = await service.transitionStatus(incidentId, { status: 'OPEN' }, mockStaffUser);
      expect(result).toEqual(baseIncident);
      expect(repository.updateIncidentStatus).not.toHaveBeenCalled();
    });

    it('rejects illegal transition: OPEN -> RESOLVED', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);

      await expect(
        service.transitionStatus(incidentId, { status: 'RESOLVED' }, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects illegal transition: OPEN -> CLOSED', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);

      await expect(
        service.transitionStatus(incidentId, { status: 'CLOSED' }, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects illegal transition: ACTION_REQUIRED -> CLOSED', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'ACTION_REQUIRED',
      });

      await expect(
        service.transitionStatus(incidentId, { status: 'CLOSED' }, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows valid transition: OPEN -> INVESTIGATING', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'INVESTIGATING',
      });

      const result = await service.transitionStatus(
        incidentId,
        { status: 'INVESTIGATING', notes: 'Commencing CCTV review' },
        mockStaffUser,
      );

      expect(result.status).toBe('INVESTIGATING');
      expect(repository.createIncidentAction).toHaveBeenCalled();
      expect(repository.createIncidentReport).toHaveBeenCalled();
      expect(notificationsService.dispatch).toHaveBeenCalled();
    });

    it('allows valid transition: INVESTIGATING -> ACTION_REQUIRED', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'INVESTIGATING',
      });
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'ACTION_REQUIRED',
      });

      const result = await service.transitionStatus(
        incidentId,
        { status: 'ACTION_REQUIRED' },
        mockStaffUser,
      );

      expect(result.status).toBe('ACTION_REQUIRED');
      expect(repository.createIncidentAction).toHaveBeenCalled();
    });

    it('allows valid transition: INVESTIGATING -> RESOLVED and records resolved_at', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'INVESTIGATING',
      });
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
      });

      const result = await service.transitionStatus(
        incidentId,
        { status: 'RESOLVED' },
        mockStaffUser,
      );

      expect(result.status).toBe('RESOLVED');
      expect(repository.updateIncidentStatus).toHaveBeenCalledWith(
        incidentId,
        'RESOLVED',
        expect.any(Date),
      );
    });

    it('allows valid transition: RESOLVED -> CLOSED', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
      });
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'CLOSED',
      });

      const result = await service.transitionStatus(
        incidentId,
        { status: 'CLOSED' },
        mockStaffUser,
      );

      expect(result.status).toBe('CLOSED');
    });

    it('allows reopening RESOLVED -> INVESTIGATING and clears resolved_at', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
      });
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'INVESTIGATING',
        resolved_at: null,
      });

      const result = await service.transitionStatus(
        incidentId,
        { status: 'INVESTIGATING', notes: 'New witness came forward' },
        mockStaffUser,
      );

      expect(result.status).toBe('INVESTIGATING');
      expect(repository.updateIncidentStatus).toHaveBeenCalledWith(
        incidentId,
        'INVESTIGATING',
        null,
      );
    });

    it('forbids reopening CLOSED -> INVESTIGATING if user is not ADMIN', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'CLOSED',
      });

      await expect(
        service.transitionStatus(incidentId, { status: 'INVESTIGATING' }, mockStaffUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows reopening CLOSED -> INVESTIGATING if user is ADMIN', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'CLOSED',
      });
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'INVESTIGATING',
        resolved_at: null,
      });

      const result = await service.transitionStatus(
        incidentId,
        { status: 'INVESTIGATING', notes: 'Reopened by executive audit' },
        mockAdminUser,
      );

      expect(result.status).toBe('INVESTIGATING');
      expect(repository.updateIncidentStatus).toHaveBeenCalledWith(
        incidentId,
        'INVESTIGATING',
        null,
      );
    });
  });

  describe('recordCorrectiveAction', () => {
    it('throws NotFoundException if incident does not exist', async () => {
      repository.findIncidentById.mockResolvedValue(null);

      await expect(
        service.recordCorrectiveAction(
          incidentId,
          { actionTaken: 'Driver retrained on capacity limits', status: 'COMPLETED' },
          mockStaffUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if incident is CLOSED', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'CLOSED',
      });

      await expect(
        service.recordCorrectiveAction(
          incidentId,
          { actionTaken: 'Retrain driver', status: 'COMPLETED' },
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates action successfully for active incident', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'ACTION_REQUIRED',
      });
      const mockAction: IncidentActionEntity = {
        id: 'act-1',
        incident_id: incidentId,
        action_taken: 'Driver retrained on passenger safety protocols',
        taken_by: staffUserId,
        action_date: new Date().toISOString(),
        status: 'COMPLETED',
        created_at: new Date().toISOString(),
      };
      repository.createIncidentAction.mockResolvedValue(mockAction);

      const result = await service.recordCorrectiveAction(
        incidentId,
        { actionTaken: 'Driver retrained on passenger safety protocols', status: 'COMPLETED' },
        mockStaffUser,
      );

      expect(result).toEqual(mockAction);
      expect(repository.createIncidentAction).toHaveBeenCalledWith(
        incidentId,
        'Driver retrained on passenger safety protocols',
        staffUserId,
        'COMPLETED',
      );
    });
  });

  describe('resolveIncident', () => {
    it('throws NotFoundException if incident does not exist', async () => {
      repository.findIncidentById.mockResolvedValue(null);

      await expect(
        service.resolveIncident(
          incidentId,
          { resolutionNotes: 'Fully investigated and verified' },
          mockStaffUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if incident status is OPEN', async () => {
      repository.findIncidentById.mockResolvedValue(baseIncident);

      await expect(
        service.resolveIncident(
          incidentId,
          { resolutionNotes: 'Cannot resolve directly from open' },
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if incident is already RESOLVED or CLOSED', async () => {
      repository.findIncidentById.mockResolvedValue({ ...baseIncident, status: 'RESOLVED' });

      await expect(
        service.resolveIncident(
          incidentId,
          { resolutionNotes: 'Duplicate resolve' },
          mockStaffUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('resolves incident from INVESTIGATING, creates reports and actions', async () => {
      repository.findIncidentById.mockResolvedValue({ ...baseIncident, status: 'INVESTIGATING' });
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
      });
      repository.findReportsByIncidentId.mockResolvedValue([]);
      repository.findActionsByIncidentId.mockResolvedValue([]);

      const result = await service.resolveIncident(
        incidentId,
        {
          resolutionNotes: 'Driver disciplined and schedule adjusted',
          correctiveAction: 'Dispatch added relief bus',
        },
        mockStaffUser,
      );

      expect(result.incident.status).toBe('RESOLVED');
      expect(repository.createIncidentReport).toHaveBeenCalled();
      expect(repository.createIncidentAction).toHaveBeenCalledTimes(2); // corrective action + resolution action
      expect(notificationsService.dispatch).toHaveBeenCalled();
    });
  });

  describe('closeIncident', () => {
    it('throws NotFoundException if incident does not exist', async () => {
      repository.findIncidentById.mockResolvedValue(null);

      await expect(
        service.closeIncident(incidentId, { notes: 'Closing' }, mockStaffUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if incident is not RESOLVED (e.g. still INVESTIGATING)', async () => {
      repository.findIncidentById.mockResolvedValue({ ...baseIncident, status: 'INVESTIGATING' });

      await expect(
        service.closeIncident(incidentId, { notes: 'Premature close' }, mockStaffUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('closes RESOLVED incident successfully', async () => {
      repository.findIncidentById.mockResolvedValue({
        ...baseIncident,
        status: 'RESOLVED',
        resolved_at: new Date().toISOString(),
      });
      repository.updateIncidentStatus.mockResolvedValue({
        ...baseIncident,
        status: 'CLOSED',
        resolved_at: new Date().toISOString(),
      });

      const result = await service.closeIncident(
        incidentId,
        { notes: 'All actions completed and signed off' },
        mockStaffUser,
      );

      expect(result.status).toBe('CLOSED');
      expect(repository.createIncidentAction).toHaveBeenCalledWith(
        incidentId,
        'Incident closed: All actions completed and signed off',
        staffUserId,
        'COMPLETED',
      );
      expect(notificationsService.dispatch).toHaveBeenCalled();
    });
  });

  describe('listIncidents', () => {
    it('calls repository.findIncidents with parsed query', async () => {
      repository.findIncidents.mockResolvedValue({
        incidents: [baseIncident],
        total: 1,
      });

      const result = await service.listIncidents({
        status: 'OPEN',
        limit: 20,
        offset: 0,
      });

      expect(result.total).toBe(1);
      expect(result.incidents).toHaveLength(1);
      expect(repository.findIncidents).toHaveBeenCalledWith({
        status: 'OPEN',
        limit: 20,
        offset: 0,
      });
    });
  });
});
