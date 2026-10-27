import { Test, TestingModule } from '@nestjs/testing';
import { FareEstimationController } from './fare-estimation.controller';
import { FareEstimationService } from '../services/fare-estimation.service';

describe('FareEstimationController', () => {
  let controller: FareEstimationController;
  let service: jest.Mocked<FareEstimationService>;

  const routeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const tripId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

  beforeEach(async () => {
    const mockService = {
      calculateFare: jest.fn(),
      getRouteFareMatrix: jest.fn(),
      getTripFareQuotes: jest.fn(),
      validateCoupon: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FareEstimationController],
      providers: [{ provide: FareEstimationService, useValue: mockService }],
    }).compile();

    controller = module.get<FareEstimationController>(FareEstimationController);
    service = module.get(FareEstimationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('calculateFare', () => {
    it('should validate body and invoke service.calculateFare', async () => {
      service.calculateFare.mockResolvedValueOnce({
        totalFare: 150.0,
      } as any);

      const body = {
        distanceKm: 25,
        seatType: 'REGULAR',
        passengerCategory: 'ADULT',
      };

      const result = await controller.calculateFare(body);
      expect(result.totalFare).toBe(150.0);
      expect(service.calculateFare).toHaveBeenCalledWith(
        expect.objectContaining({
          distanceKm: 25,
          seatType: 'REGULAR',
          passengerCategory: 'ADULT',
        }),
      );
    });
  });

  describe('getRouteFareMatrix', () => {
    it('should invoke service.getRouteFareMatrix', async () => {
      service.getRouteFareMatrix.mockResolvedValueOnce({} as any);

      const result = await controller.getRouteFareMatrix(routeId);
      expect(result).toBeDefined();
      expect(service.getRouteFareMatrix).toHaveBeenCalledWith(routeId);
    });
  });

  describe('getTripFareQuotes', () => {
    it('should invoke service.getTripFareQuotes', async () => {
      service.getTripFareQuotes.mockResolvedValueOnce([]);

      const result = await controller.getTripFareQuotes(tripId);
      expect(result).toEqual([]);
      expect(service.getTripFareQuotes).toHaveBeenCalledWith(tripId);
    });
  });

  describe('validateCoupon', () => {
    it('should validate coupon payload and invoke service.validateCoupon', async () => {
      service.validateCoupon.mockResolvedValueOnce({
        isValid: true,
        couponCode: 'PROMO10',
        discountAmount: 15,
        message: 'Valid',
      });

      const body = {
        couponCode: 'PROMO10',
        orderAmount: 150,
      };

      const result = await controller.validateCoupon(body);
      expect(result.isValid).toBe(true);
      expect(service.validateCoupon).toHaveBeenCalledWith({
        couponCode: 'PROMO10',
        orderAmount: 150,
      });
    });
  });
});
