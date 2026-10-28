import { Test, TestingModule } from '@nestjs/testing';
import { ZodError } from 'zod';
import { IncidentManagementController } from './incident-management.controller';
import { IncidentManagementService } from '../services/incident-management.service';

describe('IncidentManagementController', () => {
  let controller: IncidentManagementController;
  let service: jest.Mocked<IncidentManagementService>;

  const incidentId = '88888888-8888-4888-a888-888888888888';
  const investigatorId = '55555555-5555-4555-a555-555555555555';
  const mockUser = {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'safety@movana.com',
    roles: ['SAFETY_OFFICER'],
  };

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<IncidentManagementService>> = {
      listIncidents: jest.fn(),
      getIncidentLifecycle: jest.fn(),
      assignInvestigator: jest.fn(),
      transitionStatus: jest.fn(),
      recordCorrectiveAction: jest.fn(),
      resolveIncident: jest.fn(),
      closeIncident: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncidentManagementController],
      providers: [
        {
          provide: IncidentManagementService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<IncidentManagementController>(IncidentManagementController);
    service = module.get(IncidentManagementService);
  });

  describe('listIncidents', () => {
    it('parses query params and delegates to service', async () => {
      service.listIncidents.mockResolvedValue({
        incidents: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      const res = await controller.listIncidents({ status: 'OPEN', limit: '10', offset: '5' });
      expect(service.listIncidents).toHaveBeenCalledWith({
        status: 'OPEN',
        limit: 10,
        offset: 5,
      });
      expect(res).toBeDefined();
    });
  });

  describe('getIncidentLifecycle', () => {
    it('delegates to service with incidentId and currentUser', async () => {
      service.getIncidentLifecycle.mockResolvedValue({} as any);

      await controller.getIncidentLifecycle(incidentId, mockUser);
      expect(service.getIncidentLifecycle).toHaveBeenCalledWith(incidentId, mockUser);
    });
  });

  describe('assignInvestigator', () => {
    it('validates body with schema and delegates to service', async () => {
      service.assignInvestigator.mockResolvedValue({} as any);

      await controller.assignInvestigator(
        incidentId,
        { assignedTo: investigatorId, assignmentNotes: 'Investigate depot CCTV' },
        mockUser,
      );

      expect(service.assignInvestigator).toHaveBeenCalledWith(
        incidentId,
        { assignedTo: investigatorId, assignmentNotes: 'Investigate depot CCTV' },
        mockUser,
      );
    });

    it('rejects invalid investigator UUID', async () => {
      await expect(
        controller.assignInvestigator(incidentId, { assignedTo: 'not-a-uuid' }, mockUser),
      ).rejects.toThrow(ZodError);
    });
  });

  describe('transitionStatus', () => {
    it('validates transition body and delegates to service', async () => {
      service.transitionStatus.mockResolvedValue({} as any);

      await controller.transitionStatus(
        incidentId,
        { status: 'INVESTIGATING', notes: 'Inspection scheduled' },
        mockUser,
      );

      expect(service.transitionStatus).toHaveBeenCalledWith(
        incidentId,
        { status: 'INVESTIGATING', notes: 'Inspection scheduled' },
        mockUser,
      );
    });

    it('rejects invalid status', async () => {
      await expect(
        controller.transitionStatus(incidentId, { status: 'UNKNOWN_STATUS' }, mockUser),
      ).rejects.toThrow(ZodError);
    });
  });

  describe('recordCorrectiveAction', () => {
    it('validates action body and delegates to service', async () => {
      service.recordCorrectiveAction.mockResolvedValue({} as any);

      await controller.recordCorrectiveAction(
        incidentId,
        { actionTaken: 'Repaired emergency brake valve', status: 'COMPLETED' },
        mockUser,
      );

      expect(service.recordCorrectiveAction).toHaveBeenCalledWith(
        incidentId,
        { actionTaken: 'Repaired emergency brake valve', status: 'COMPLETED' },
        mockUser,
      );
    });

    it('rejects action with too short description', async () => {
      await expect(
        controller.recordCorrectiveAction(incidentId, { actionTaken: 'Fix' }, mockUser),
      ).rejects.toThrow(ZodError);
    });
  });

  describe('resolveIncident', () => {
    it('validates resolution body and delegates to service', async () => {
      service.resolveIncident.mockResolvedValue({} as any);

      await controller.resolveIncident(
        incidentId,
        {
          resolutionNotes: 'Inspection passed and certified',
          correctiveAction: 'Replaced faulty relay',
        },
        mockUser,
      );

      expect(service.resolveIncident).toHaveBeenCalledWith(
        incidentId,
        {
          resolutionNotes: 'Inspection passed and certified',
          correctiveAction: 'Replaced faulty relay',
        },
        mockUser,
      );
    });

    it('rejects resolution with missing resolution notes', async () => {
      await expect(controller.resolveIncident(incidentId, {}, mockUser)).rejects.toThrow(ZodError);
    });
  });

  describe('closeIncident', () => {
    it('validates close body and delegates to service', async () => {
      service.closeIncident.mockResolvedValue({} as any);

      await controller.closeIncident(
        incidentId,
        { notes: 'Signed off by Chief Safety Officer' },
        mockUser,
      );

      expect(service.closeIncident).toHaveBeenCalledWith(
        incidentId,
        { notes: 'Signed off by Chief Safety Officer' },
        mockUser,
      );
    });

    it('accepts empty body for closeIncident', async () => {
      service.closeIncident.mockResolvedValue({} as any);

      await controller.closeIncident(incidentId, {}, mockUser);
      expect(service.closeIncident).toHaveBeenCalledWith(incidentId, {}, mockUser);
    });
  });
});
