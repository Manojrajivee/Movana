import { Test, TestingModule } from '@nestjs/testing';
import { BusDevicesController } from './bus-devices.controller';
import { BusDevicesService } from '../services/bus-devices.service';

describe('BusDevicesController', () => {
  let controller: BusDevicesController;
  let service: jest.Mocked<BusDevicesService>;

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
  };

  beforeEach(async () => {
    const mockService = {
      createDevice: jest.fn().mockResolvedValue(mockDevice),
      getDevices: jest.fn().mockResolvedValue({ items: [mockDevice], total: 1 }),
      getDeviceById: jest.fn().mockResolvedValue(mockDevice),
      updateDevice: jest.fn().mockResolvedValue({ ...mockDevice, device_model: 'Updated Model' }),
      pairDevice: jest.fn().mockResolvedValue({
        ...mockDevice,
        vehicle_id: '99999999-8888-7777-6666-555555555555',
      }),
      unpairDevice: jest.fn().mockResolvedValue(mockDevice),
      decommissionDevice: jest.fn().mockResolvedValue({ ...mockDevice, is_active: false }),
      getDeviceStatus: jest.fn().mockResolvedValue({
        deviceId: mockDevice.id,
        imei: mockDevice.device_imei,
        isActive: true,
        isPaired: false,
        pairedVehicle: null,
        latestTelemetry: null,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BusDevicesController],
      providers: [{ provide: BusDevicesService, useValue: mockService }],
    }).compile();

    controller = module.get<BusDevicesController>(BusDevicesController);
    service = module.get(BusDevicesService);
  });

  it('creates a new tracking device', async () => {
    const body = {
      deviceImei: '864298031234567',
      deviceModel: 'Teltonika FMB920',
    };
    const result = await controller.createDevice(body);
    expect(result).toBeDefined();
    expect(service.createDevice).toHaveBeenCalledWith(body);
  });

  it('gets list of devices', async () => {
    const result = await controller.getDevices({ limit: 10, offset: 0 });
    expect(result.items).toHaveLength(1);
    expect(service.getDevices).toHaveBeenCalled();
  });

  it('gets device by ID', async () => {
    const result = await controller.getDeviceById(mockDevice.id);
    expect(result.id).toBe(mockDevice.id);
    expect(service.getDeviceById).toHaveBeenCalledWith(mockDevice.id);
  });

  it('updates device', async () => {
    const body = { deviceModel: 'Updated Model' };
    const result = await controller.updateDevice(mockDevice.id, body);
    expect(result.device_model).toBe('Updated Model');
    expect(service.updateDevice).toHaveBeenCalledWith(mockDevice.id, body);
  });

  it('pairs device with vehicle', async () => {
    const body = { vehicleId: '99999999-8888-7777-6666-555555555555' };
    const result = await controller.pairDevice(mockDevice.id, body);
    expect(result.vehicle_id).toBe(body.vehicleId);
    expect(service.pairDevice).toHaveBeenCalledWith(mockDevice.id, body);
  });

  it('unpairs device from vehicle', async () => {
    const result = await controller.unpairDevice(mockDevice.id);
    expect(result).toBeDefined();
    expect(service.unpairDevice).toHaveBeenCalledWith(mockDevice.id);
  });

  it('decommissions device', async () => {
    const result = await controller.decommissionDevice(mockDevice.id);
    expect(result.is_active).toBe(false);
    expect(service.decommissionDevice).toHaveBeenCalledWith(mockDevice.id);
  });

  it('retrieves device connectivity status', async () => {
    const result = await controller.getDeviceStatus(mockDevice.id);
    expect(result.deviceId).toBe(mockDevice.id);
    expect(service.getDeviceStatus).toHaveBeenCalledWith(mockDevice.id);
  });
});
