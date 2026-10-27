import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BusDevicesRepository } from '../repositories/bus-devices.repository';
import { BusDevicesService } from './bus-devices.service';

describe('BusDevicesService', () => {
  let service: BusDevicesService;
  let repo: jest.Mocked<BusDevicesRepository>;

  const mockDevice: any = {
    id: '11111111-2222-3333-4444-555555555555',
    device_imei: '864298031234567',
    device_model: 'Teltonika FMB920',
    firmware_version: '03.28.02.Rev.00',
    vehicle_id: null,
    is_active: true,
    installed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    vehicle_code: null,
    registration_number: null,
    vehicle_status: null,
  };

  const mockVehicle: any = {
    id: '99999999-8888-7777-6666-555555555555',
    vehicle_code: 'BUS-001',
    registration_number: 'DL-01-AB-1234',
    status: 'ACTIVE',
  };

  const mockDecommissionedVehicle: any = {
    id: '88888888-8888-7777-6666-555555555555',
    vehicle_code: 'BUS-OLD',
    registration_number: 'DL-01-OLD',
    status: 'DECOMMISSIONED',
  };

  beforeEach(async () => {
    const mockRepo = {
      createDevice: jest.fn().mockResolvedValue(mockDevice),
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === mockDevice.id) return Promise.resolve(mockDevice);
        return Promise.resolve(null);
      }),
      findByImei: jest.fn().mockImplementation((imei: string) => {
        if (imei === mockDevice.device_imei) return Promise.resolve(mockDevice);
        return Promise.resolve(null);
      }),
      findActiveByVehicleId: jest.fn().mockImplementation((vId: string) => {
        if (vId === 'already-paired-veh') {
          return Promise.resolve({
            ...mockDevice,
            id: 'other-device-id',
            device_imei: '864298039999999',
            vehicle_id: vId,
          });
        }
        return Promise.resolve(null);
      }),
      findVehicleById: jest.fn().mockImplementation((vId: string) => {
        if (vId === mockVehicle.id || vId === 'already-paired-veh')
          return Promise.resolve(mockVehicle);
        if (vId === mockDecommissionedVehicle.id) return Promise.resolve(mockDecommissionedVehicle);
        return Promise.resolve(null);
      }),
      findAll: jest.fn().mockResolvedValue({
        items: [mockDevice],
        total: 1,
      }),
      updateDevice: jest.fn().mockResolvedValue({
        ...mockDevice,
        device_model: 'Teltonika FMB920-v2',
      }),
      pairDevice: jest.fn().mockResolvedValue({
        ...mockDevice,
        vehicle_id: mockVehicle.id,
        installed_at: new Date(),
        vehicle_code: mockVehicle.vehicle_code,
        registration_number: mockVehicle.registration_number,
      }),
      unpairDevice: jest.fn().mockResolvedValue({
        ...mockDevice,
        vehicle_id: null,
        installed_at: null,
      }),
      decommissionDevice: jest.fn().mockResolvedValue({
        ...mockDevice,
        is_active: false,
        vehicle_id: null,
      }),
      getLatestTelemetry: jest.fn().mockResolvedValue({
        latitude: 28.6139,
        longitude: 77.209,
        speed_kmh: 42.5,
        recorded_at: new Date(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BusDevicesService, { provide: BusDevicesRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<BusDevicesService>(BusDevicesService);
    repo = module.get(BusDevicesRepository);
  });

  describe('createDevice', () => {
    it('successfully registers a tracking device without vehicle', async () => {
      const result = await service.createDevice({
        deviceImei: '864298030000001',
        deviceModel: 'Teltonika FMC130',
        firmwareVersion: '01.00.00',
      });

      expect(result).toBeDefined();
      expect(repo.createDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceImei: '864298030000001',
          deviceModel: 'Teltonika FMC130',
        }),
      );
    });

    it('successfully registers a tracking device with a valid vehicle', async () => {
      const result = await service.createDevice({
        deviceImei: '864298030000002',
        deviceModel: 'Teltonika FMC130',
        vehicleId: mockVehicle.id,
      });

      expect(result).toBeDefined();
      expect(repo.createDevice).toHaveBeenCalled();
    });

    it('throws ConflictException if device IMEI already exists', async () => {
      await expect(
        service.createDevice({
          deviceImei: mockDevice.device_imei,
          deviceModel: 'Teltonika FMB920',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if referenced vehicle does not exist', async () => {
      await expect(
        service.createDevice({
          deviceImei: '864298030000003',
          deviceModel: 'Teltonika FMB920',
          vehicleId: 'non-existent-uuid',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if referenced vehicle is decommissioned', async () => {
      await expect(
        service.createDevice({
          deviceImei: '864298030000004',
          deviceModel: 'Teltonika FMB920',
          vehicleId: mockDecommissionedVehicle.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if vehicle already has an active tracking device paired', async () => {
      await expect(
        service.createDevice({
          deviceImei: '864298030000005',
          deviceModel: 'Teltonika FMB920',
          vehicleId: 'already-paired-veh',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getDevices', () => {
    it('returns paginated list of tracking devices', async () => {
      const result = await service.getDevices({ limit: 10, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getDeviceById', () => {
    it('returns tracking device if found', async () => {
      const result = await service.getDeviceById(mockDevice.id);
      expect(result.id).toBe(mockDevice.id);
    });

    it('throws NotFoundException if device does not exist', async () => {
      await expect(service.getDeviceById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateDevice', () => {
    it('updates device successfully', async () => {
      const result = await service.updateDevice(mockDevice.id, {
        deviceModel: 'Teltonika FMB920-v2',
      });
      expect(result.device_model).toBe('Teltonika FMB920-v2');
    });

    it('throws NotFoundException when updating non-existent device', async () => {
      await expect(
        service.updateDevice('non-existent', { deviceModel: 'New Model' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pairDevice', () => {
    it('pairs an active tracking device to an active vehicle', async () => {
      const result = await service.pairDevice(mockDevice.id, {
        vehicleId: mockVehicle.id,
      });
      expect(result.vehicle_id).toBe(mockVehicle.id);
      expect(repo.pairDevice).toHaveBeenCalledWith(mockDevice.id, mockVehicle.id);
    });

    it('throws BadRequestException if device is inactive', async () => {
      repo.findById.mockResolvedValueOnce({
        ...mockDevice,
        is_active: false,
      });

      await expect(
        service.pairDevice(mockDevice.id, { vehicleId: mockVehicle.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if vehicle does not exist', async () => {
      await expect(
        service.pairDevice(mockDevice.id, { vehicleId: 'non-existent-uuid' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if vehicle is decommissioned', async () => {
      await expect(
        service.pairDevice(mockDevice.id, { vehicleId: mockDecommissionedVehicle.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if vehicle is already paired to another active device', async () => {
      await expect(
        service.pairDevice(mockDevice.id, { vehicleId: 'already-paired-veh' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('unpairDevice', () => {
    it('unpairs device from vehicle when currently paired', async () => {
      repo.findById.mockResolvedValueOnce({
        ...mockDevice,
        vehicle_id: mockVehicle.id,
      });

      const result = await service.unpairDevice(mockDevice.id);
      expect(result.vehicle_id).toBeNull();
      expect(repo.unpairDevice).toHaveBeenCalledWith(mockDevice.id);
    });

    it('throws BadRequestException if device is not currently paired', async () => {
      await expect(service.unpairDevice(mockDevice.id)).rejects.toThrow(BadRequestException);
    });
  });

  describe('decommissionDevice', () => {
    it('decommissions device and unsets active flag', async () => {
      const result = await service.decommissionDevice(mockDevice.id);
      expect(result.is_active).toBe(false);
      expect(repo.decommissionDevice).toHaveBeenCalledWith(mockDevice.id);
    });
  });

  describe('getDeviceStatus', () => {
    it('returns status with telemetry for paired device', async () => {
      repo.findById.mockResolvedValueOnce({
        ...mockDevice,
        vehicle_id: mockVehicle.id,
        vehicle_code: mockVehicle.vehicle_code,
        registration_number: mockVehicle.registration_number,
        vehicle_status: mockVehicle.status,
      });

      const status = await service.getDeviceStatus(mockDevice.id);
      expect(status.deviceId).toBe(mockDevice.id);
      expect(status.isPaired).toBe(true);
      expect(status.pairedVehicle).toBeDefined();
      expect(status.pairedVehicle?.code).toBe('BUS-001');
      expect(status.latestTelemetry).toBeDefined();
      expect(status.latestTelemetry?.latitude).toBe(28.6139);
    });

    it('returns status without telemetry for unpaired device', async () => {
      const status = await service.getDeviceStatus(mockDevice.id);
      expect(status.deviceId).toBe(mockDevice.id);
      expect(status.isPaired).toBe(false);
      expect(status.pairedVehicle).toBeNull();
      expect(status.latestTelemetry).toBeNull();
    });
  });
});
