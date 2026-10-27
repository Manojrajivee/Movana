import { Test, TestingModule } from '@nestjs/testing';
import { GpsIngestionController } from './gps-ingestion.controller';
import { GpsIngestionService } from '../services/gps-ingestion.service';

describe('GpsIngestionController', () => {
  let controller: GpsIngestionController;
  let service: jest.Mocked<GpsIngestionService>;

  const vehicleId = '11111111-1111-4111-a111-111111111111';
  const deviceImei = '862000000000001';

  beforeEach(async () => {
    const mockService = {
      ingestGpsPoint: jest.fn().mockResolvedValue({
        success: true,
        id: '22222222-2222-4222-a222-222222222222',
        vehicleId,
        recordedAt: new Date(),
      }),
      batchIngestGps: jest.fn().mockResolvedValue({
        success: true,
        processedCount: 2,
      }),
      recordTrackingEvent: jest.fn().mockResolvedValue({
        id: '33333333-3333-4333-a333-333333333333',
        device_id: '44444444-4444-4444-a444-444444444444',
        vehicle_id: vehicleId,
        event_type: 'IGNITION_ON',
      }),
      getLocationHistory: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GpsIngestionController],
      providers: [{ provide: GpsIngestionService, useValue: mockService }],
    }).compile();

    controller = module.get<GpsIngestionController>(GpsIngestionController);
    service = module.get(GpsIngestionService);
  });

  it('ingests single GPS fix', async () => {
    const body = {
      deviceImei,
      latitude: 28.6139,
      longitude: 77.209,
      speedKmh: 40,
      recordedAt: new Date().toISOString(),
    };
    const res = await controller.ingestGpsPoint(body);
    expect(res.success).toBe(true);
    expect(service.ingestGpsPoint).toHaveBeenCalled();
  });

  it('batch ingests GPS fixes', async () => {
    const body = {
      points: [
        {
          deviceImei,
          latitude: 28.6139,
          longitude: 77.209,
          speedKmh: 40,
          recordedAt: new Date().toISOString(),
        },
      ],
    };
    const res = await controller.batchIngestGps(body);
    expect(res.success).toBe(true);
    expect(service.batchIngestGps).toHaveBeenCalled();
  });

  it('records hardware telematics event', async () => {
    const body = {
      deviceImei,
      eventType: 'IGNITION_ON',
      recordedAt: new Date().toISOString(),
    };
    const res = await controller.recordTrackingEvent(body);
    expect(res.event_type).toBe('IGNITION_ON');
    expect(service.recordTrackingEvent).toHaveBeenCalled();
  });

  it('queries historical breadcrumbs for a vehicle', async () => {
    const res = await controller.getLocationHistory(vehicleId, { limit: 10, offset: 0 });
    expect(res.items).toHaveLength(0);
    expect(service.getLocationHistory).toHaveBeenCalledWith(
      vehicleId,
      expect.objectContaining({ limit: 10, offset: 0 }),
    );
  });
});
