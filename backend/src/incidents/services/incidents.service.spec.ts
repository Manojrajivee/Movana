import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsRepository } from '../repositories/incidents.repository';
import { IncidentsService } from './incidents.service';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let repository: jest.Mocked<IncidentsRepository>;

  const userId = '11111111-1111-4111-a111-111111111111';
  const otherUserId = '22222222-2222-4222-a222-222222222222';
  const staffUserId = '33333333-3333-4333-a333-333333333333';
  const tripId = '44444444-4444-4444-a444-444444444444';
  const vehicleId = '55555555-5555-4555-a555-555555555555';
  const driverId = '66666666-6666-4666-a666-666666666666';
  const incidentTypeId = '77777777-7777-4777-a777-777777777777';
  const incidentId = '88888888-8888-4888-a888-888888888888';

  const mockUser = {
    id: userId,
    email: 'passenger@example.com',
    roles: ['PASSENGER'],
  };

  const mockDriverUser = {
    id: '99999999-9999-4999-a999-999999999999',
    email: 'driver@example.com',
    roles: ['DRIVER'],
  };

  const mockStaffUser = {
    id: staffUserId,
    email: 'safety@example.com',
    roles: ['SAFETY_OFFICER'],
  };

  const mockIncidentType = {
    id: incidentTypeId,
    code: 'MECHANICAL_BREAKDOWN',
    name: 'Engine Failure',
    category: 'MECHANICAL',
    description: 'Vehicle breakdown',
    created_at: new Date().toISOString(),
  };

  const mockSeverity = {
    id: 'sev-1',
    code: 'MEDIUM',
    name: 'Medium Severity',
    level_rank: 2,
    created_at: new Date().toISOString(),
  };

  const mockIncident = {
    id: incidentId,
    incident_number: 'INC-20261028-A1B2C3',
    trip_id: tripId,
    vehicle_id: vehicleId,
    driver_id: driverId,
    reported_by: userId,
    incident_type_id: incidentTypeId,
    severity: 'MEDIUM',
    title: 'Engine smoke observed',
    description: 'Smoke started coming from the rear engine compartment',
    latitude: 13.0827,
    longitude: 80.2707,
    occurred_at: new Date().toISOString(),
    reported_at: new Date().toISOString(),
    status: 'OPEN',
    resolved_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockReport = {
    id: 'rep-1',
    incident_id: incidentId,
    submitted_by: userId,
    report_details: 'Witness statements collected on board',
    witnesses: [
      {
        name: 'Jane Smith',
        contact: '+919876543210',
        statement: 'I saw black smoke before the bus pulled over.',
      },
    ],
    created_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const mockRepo = {
      findIncidentTypes: jest.fn().mockResolvedValue([mockIncidentType]),
      findSeverityLevels: jest.fn().mockResolvedValue([mockSeverity]),
      findIncidentTypeByIdOrCode: jest.fn().mockImplementation((id: string) => {
        if (id === incidentTypeId || id === 'MECHANICAL_BREAKDOWN') {
          return Promise.resolve(mockIncidentType);
        }
        return Promise.resolve(null);
      }),
      validateTripExists: jest.fn().mockImplementation((id: string) => {
        if (id === tripId) {
          return Promise.resolve({ exists: true, vehicleId, driverId });
        }
        return Promise.resolve({ exists: false, vehicleId: null, driverId: null });
      }),
      validateVehicleExists: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(id === vehicleId);
      }),
      validateDriverExists: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(id === driverId);
      }),
      validateReporterTripAuthorization: jest
        .fn()
        .mockImplementation((uId: string, _tId: string, roles: string[]) => {
          if (roles.includes('SAFETY_OFFICER') || roles.includes('ADMIN'))
            return Promise.resolve(true);
          if (uId === userId || uId === mockDriverUser.id) return Promise.resolve(true);
          return Promise.resolve(false);
        }),
      createIncident: jest.fn().mockResolvedValue(mockIncident),
      createIncidentReport: jest.fn().mockResolvedValue(mockReport),
      findIncidentById: jest.fn().mockImplementation((id: string) => {
        if (id === incidentId) {
          return Promise.resolve({
            ...mockIncident,
            incident_type_name: mockIncidentType.name,
            incident_type_code: mockIncidentType.code,
            reports: [mockReport],
          });
        }
        return Promise.resolve(null);
      }),
      findIncidentsByReporter: jest.fn().mockResolvedValue([mockIncident]),
      findIncidents: jest.fn().mockResolvedValue({ items: [mockIncident], total: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [IncidentsService, { provide: IncidentsRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
    repository = module.get(IncidentsRepository);
  });

  describe('getIncidentTypes & getSeverityLevels', () => {
    it('should return available incident types', async () => {
      const types = await service.getIncidentTypes();
      expect(types).toHaveLength(1);
      expect(types[0].code).toBe('MECHANICAL_BREAKDOWN');
    });

    it('should return available severity levels', async () => {
      const severities = await service.getSeverityLevels();
      expect(severities).toHaveLength(1);
      expect(severities[0].code).toBe('MEDIUM');
    });
  });

  describe('reportIncident', () => {
    it('should submit a valid incident report with trip reference and auto-fill vehicle/driver', async () => {
      const dto = {
        tripId,
        incidentTypeId,
        severity: 'HIGH' as const,
        title: 'Brake issue',
        description: 'Brakes felt unresponsive approaching stop.',
        witnesses: [
          {
            name: 'John Passenger',
            statement: 'Bus took longer than usual to stop.',
          },
        ],
      };

      const result = await service.reportIncident(dto, mockUser);

      expect(result).toBeDefined();
      expect(result.id).toBe(incidentId);
      expect(repository.createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId,
          vehicleId,
          driverId,
          reportedBy: userId,
          title: 'Brake issue',
        }),
      );
      expect(repository.createIncidentReport).toHaveBeenCalled();
    });

    it('should submit incident successfully for authorized driver', async () => {
      const dto = {
        tripId,
        incidentTypeId: 'MECHANICAL_BREAKDOWN',
        title: 'Flat tyre',
        description: 'Rear left tyre punctured on highway.',
      };

      const result = await service.reportIncident(dto, mockDriverUser);

      expect(result).toBeDefined();
      expect(repository.createIncident).toHaveBeenCalled();
    });

    it('should reject incident with invalid incident type', async () => {
      const dto = {
        incidentTypeId: 'NON_EXISTENT_TYPE',
        title: 'Incident',
        description: 'Some description text here.',
      };

      await expect(service.reportIncident(dto, mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should reject incident when referenced trip does not exist', async () => {
      const dto = {
        tripId: '00000000-0000-4000-a000-000000000000',
        incidentTypeId,
        title: 'Incident',
        description: 'Some description text here.',
      };

      await expect(service.reportIncident(dto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should reject incident when reporter is not authorized for the trip', async () => {
      repository.validateReporterTripAuthorization.mockResolvedValueOnce(false);

      const dto = {
        tripId,
        incidentTypeId,
        title: 'Incident',
        description: 'Some description text here.',
      };

      await expect(service.reportIncident(dto, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should reject incident when explicit standalone vehicleId does not exist', async () => {
      const dto = {
        vehicleId: '00000000-0000-4000-a000-000000000000',
        incidentTypeId,
        title: 'Incident',
        description: 'Some description text here.',
      };

      await expect(service.reportIncident(dto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should reject incident when explicit standalone driverId does not exist', async () => {
      const dto = {
        driverId: '00000000-0000-4000-a000-000000000000',
        incidentTypeId,
        title: 'Incident',
        description: 'Some description text here.',
      };

      await expect(service.reportIncident(dto, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should prevent client spoofing by overriding client vehicleId and driverId with authoritative trip data', async () => {
      const spoofedVehicleId = '99999999-9999-4999-a999-999999999999';
      const spoofedDriverId = '88888888-8888-4888-a888-888888888888';

      const dto = {
        tripId,
        vehicleId: spoofedVehicleId,
        driverId: spoofedDriverId,
        incidentTypeId,
        title: 'Spoof attempt incident',
        description: 'Attempting to inject wrong driver and vehicle.',
      };

      await service.reportIncident(dto, mockUser);

      expect(repository.createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId,
          vehicleId,
          driverId,
        }),
      );
    });

    it('should retry and succeed when incident number collides on unique constraint (23505)', async () => {
      const collisionErr = new Error('duplicate key value') as any;
      collisionErr.code = '23505';

      repository.createIncident
        .mockRejectedValueOnce(collisionErr)
        .mockResolvedValueOnce(mockIncident);

      const dto = {
        incidentTypeId,
        title: 'Collision test incident',
        description: 'Testing collision retry logic on unique violation.',
      };

      const result = await service.reportIncident(dto, mockUser);
      expect(result).toBeDefined();
      expect(repository.createIncident).toHaveBeenCalledTimes(2);
    });
  });

  describe('addWitnessStatement', () => {
    it('should allow incident reporter to add a witness statement', async () => {
      const dto = {
        reportDetails: 'Additional passenger statement recorded',
        witnesses: [
          {
            name: 'Sarah Connor',
            statement: 'Confirmed engine smell was present.',
          },
        ],
      };

      const report = await service.addWitnessStatement(incidentId, dto, mockUser);
      expect(report).toBeDefined();
      expect(repository.createIncidentReport).toHaveBeenCalledWith(
        incidentId,
        userId,
        dto.reportDetails,
        dto.witnesses,
      );
    });

    it('should allow SAFETY_OFFICER to add a witness statement', async () => {
      const dto = {
        reportDetails: 'Officer interview findings',
        witnesses: [{ name: 'Officer Bob', statement: 'Visual inspection confirmed leak.' }],
      };

      const report = await service.addWitnessStatement(incidentId, dto, mockStaffUser);
      expect(report).toBeDefined();
    });

    it('should reject non-reporter passenger from adding witness statement with 403 Forbidden', async () => {
      const nonReporter = { id: otherUserId, roles: ['PASSENGER'] };
      const dto = {
        reportDetails: 'Unauthorized attempt',
        witnesses: [{ name: 'Stranger', statement: 'Statement' }],
      };

      await expect(service.addWitnessStatement(incidentId, dto, nonReporter)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return 404 if incident does not exist', async () => {
      const dto = {
        reportDetails: 'Details',
        witnesses: [{ name: 'Witness', statement: 'Statement' }],
      };

      await expect(
        service.addWitnessStatement('00000000-0000-4000-a000-000000000000', dto, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyIncidents', () => {
    it('should return incidents reported by current user', async () => {
      const items = await service.getMyIncidents(mockUser);
      expect(items).toHaveLength(1);
      expect(repository.findIncidentsByReporter).toHaveBeenCalledWith(userId);
    });
  });

  describe('getIncidentById', () => {
    it('should allow original reporter to view their incident', async () => {
      const incident = await service.getIncidentById(incidentId, mockUser);
      expect(incident.id).toBe(incidentId);
      expect(incident.reports).toHaveLength(1);
    });

    it('should allow SAFETY_OFFICER to view any incident', async () => {
      const incident = await service.getIncidentById(incidentId, mockStaffUser);
      expect(incident.id).toBe(incidentId);
    });

    it('should reject unauthorized user from viewing someone elses incident with 403', async () => {
      const nonReporter = { id: otherUserId, roles: ['PASSENGER'] };
      await expect(service.getIncidentById(incidentId, nonReporter)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return 404 if incident is not found', async () => {
      await expect(
        service.getIncidentById('00000000-0000-4000-a000-000000000000', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getIncidents (Staff search)', () => {
    it('should allow SAFETY_OFFICER to query all incidents', async () => {
      const result = await service.getIncidents({ limit: 10, offset: 0 }, mockStaffUser);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should reject PASSENGER from querying all incidents with 403 Forbidden', async () => {
      await expect(service.getIncidents({ limit: 10, offset: 0 }, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
