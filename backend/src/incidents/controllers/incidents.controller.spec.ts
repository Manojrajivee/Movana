import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from '../services/incidents.service';
import { IncidentsController } from './incidents.controller';

describe('IncidentsController', () => {
  let controller: IncidentsController;
  let service: jest.Mocked<IncidentsService>;

  const userId = '11111111-1111-4111-a111-111111111111';
  const incidentId = '88888888-8888-4888-a888-888888888888';
  const tripId = '44444444-4444-4444-a444-444444444444';

  const mockUser = {
    id: userId,
    email: 'user@example.com',
    roles: ['PASSENGER'],
  };

  const mockIncident = {
    id: incidentId,
    incident_number: 'INC-20261028-123456',
    trip_id: tripId,
    vehicle_id: null,
    driver_id: null,
    reported_by: userId,
    incident_type_id: 'type-1',
    severity: 'MEDIUM',
    title: 'Bus Breakdown',
    description: 'The bus engine stopped working unexpectedly.',
    latitude: 13.0827,
    longitude: 80.2707,
    occurred_at: new Date().toISOString(),
    reported_at: new Date().toISOString(),
    status: 'OPEN',
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockService = {
      getIncidentTypes: jest
        .fn()
        .mockResolvedValue([
          { id: 'type-1', code: 'MECHANICAL', name: 'Mechanical Issue', category: 'FLEET' },
        ]),
      getSeverityLevels: jest
        .fn()
        .mockResolvedValue([{ id: 'sev-1', code: 'MEDIUM', name: 'Medium', level_rank: 2 }]),
      reportIncident: jest.fn().mockResolvedValue(mockIncident),
      getMyIncidents: jest.fn().mockResolvedValue([mockIncident]),
      getIncidents: jest.fn().mockResolvedValue({ items: [mockIncident], total: 1 }),
      getIncidentById: jest.fn().mockResolvedValue(mockIncident),
      addWitnessStatement: jest.fn().mockResolvedValue({
        id: 'rep-1',
        incident_id: incidentId,
        submitted_by: userId,
        report_details: 'Witness confirmed smoke',
        witnesses: [],
        created_at: new Date().toISOString(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncidentsController],
      providers: [{ provide: IncidentsService, useValue: mockService }],
    }).compile();

    controller = module.get<IncidentsController>(IncidentsController);
    service = module.get(IncidentsService);
  });

  describe('getIncidentTypes & getSeverityLevels', () => {
    it('should return incident types', async () => {
      const types = await controller.getIncidentTypes();
      expect(types).toHaveLength(1);
      expect(service.getIncidentTypes).toHaveBeenCalled();
    });

    it('should return severity levels', async () => {
      const severities = await controller.getSeverityLevels();
      expect(severities).toHaveLength(1);
      expect(service.getSeverityLevels).toHaveBeenCalled();
    });
  });

  describe('reportIncident', () => {
    it('should validate DTO and call service.reportIncident', async () => {
      const dto = {
        tripId,
        incidentTypeId: 'type-1',
        severity: 'MEDIUM',
        title: 'Bus Breakdown',
        description: 'The bus engine stopped working unexpectedly.',
      };

      const result = await controller.reportIncident(dto, mockUser);
      expect(result).toEqual(mockIncident);
      expect(service.reportIncident).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Bus Breakdown' }),
        mockUser,
      );
    });

    it('should throw validation error when description is too short', async () => {
      const invalidDto = {
        incidentTypeId: 'type-1',
        title: 'Title',
        description: 'Short', // below 10 chars
      };

      await expect(controller.reportIncident(invalidDto, mockUser)).rejects.toThrow();
    });
  });

  describe('getMyIncidents', () => {
    it('should return incidents reported by current user', async () => {
      const result = await controller.getMyIncidents(mockUser);
      expect(result).toHaveLength(1);
      expect(service.getMyIncidents).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('getIncidents', () => {
    it('should return filtered incidents for staff', async () => {
      const query = { limit: 10, offset: 0 };
      const result = await controller.getIncidents(query, mockUser);
      expect(result.items).toHaveLength(1);
      expect(service.getIncidents).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 0 }),
        mockUser,
      );
    });
  });

  describe('getIncidentById', () => {
    it('should return incident by ID', async () => {
      const result = await controller.getIncidentById(incidentId, mockUser);
      expect(result).toEqual(mockIncident);
      expect(service.getIncidentById).toHaveBeenCalledWith(incidentId, mockUser);
    });
  });

  describe('addWitnessStatement', () => {
    it('should validate payload and call service.addWitnessStatement', async () => {
      const body = {
        reportDetails: 'Interviewed bystander',
        witnesses: [
          {
            name: 'Witness 1',
            statement: 'Saw bus pulled over.',
          },
        ],
      };

      const result = await controller.addWitnessStatement(incidentId, body, mockUser);
      expect(result.id).toBe('rep-1');
      expect(service.addWitnessStatement).toHaveBeenCalledWith(
        incidentId,
        expect.objectContaining({ reportDetails: 'Interviewed bystander' }),
        mockUser,
      );
    });
  });
});
