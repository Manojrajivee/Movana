import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FareEstimationRepository } from '../repositories/fare-estimation.repository';
import { FareEstimationService } from './fare-estimation.service';

describe('FareEstimationService', () => {
  let service: FareEstimationService;
  let repo: jest.Mocked<FareEstimationRepository>;

  const routeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const tripId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const stop1 = '11111111-1111-4111-a111-111111111111';
  const stop2 = '22222222-2222-4222-a222-222222222222';

  beforeEach(async () => {
    const mockRepo = {
      findRouteById: jest.fn(),
      findVehicleTypeById: jest.fn(),
      findTripFareQuote: jest.fn(),
      findMatchingFareRule: jest.fn(),
      findCouponWithDiscount: jest.fn(),
      findTripFaresByTripId: jest.fn(),
      findRouteFareRules: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FareEstimationService, { provide: FareEstimationRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<FareEstimationService>(FareEstimationService);
    repo = module.get(FareEstimationRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateFare', () => {
    it('should use materialized trip quote if present', async () => {
      repo.findTripFareQuote.mockResolvedValueOnce({
        id: 'quote-1',
        trip_id: tripId,
        origin_stop_id: stop1,
        destination_stop_id: stop2,
        seat_type: 'REGULAR',
        currency: 'INR',
        base_fare: 50.0,
        total_fare: 75.0,
      });

      const result = await service.calculateFare({
        tripId,
        originStopId: stop1,
        destinationStopId: stop2,
        seatType: 'REGULAR',
        passengerCategory: 'ADULT',
      });

      expect(result.pricingMethod).toBe('MATERIALIZED_TRIP_QUOTE');
      expect(result.totalFare).toBe(75.0);
      expect(result.currency).toBe('INR');
    });

    it('should throw NotFoundException if route not found when resolving distance', async () => {
      repo.findRouteById.mockResolvedValueOnce(null);

      await expect(
        service.calculateFare({
          routeId,
          seatType: 'REGULAR',
          passengerCategory: 'ADULT',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should calculate rule-based fare with tax and passenger concession', async () => {
      repo.findRouteById.mockResolvedValueOnce({
        id: routeId,
        route_code: 'DEL-JPR',
        distance_km: 100.0,
      });

      repo.findMatchingFareRule.mockResolvedValueOnce({
        id: 'rule-1',
        fare_product_id: 'fp-1',
        route_id: routeId,
        origin_stop_id: null,
        destination_stop_id: null,
        vehicle_type_id: null,
        seat_type: null,
        passenger_category: 'SENIOR',
        min_distance_km: 0,
        max_distance_km: null,
        base_fare: 20.0,
        per_km_rate: 1.5,
        tax_percentage: 5.0,
      });

      const result = await service.calculateFare({
        routeId,
        seatType: 'REGULAR',
        passengerCategory: 'SENIOR',
      });

      // Raw distance = 100 * 1.5 = 150
      // Base + distance = 20 + 150 = 170
      // Senior concession = 170 * 0.70 = 119.00
      // Tax = 119 * 0.05 = 5.95
      // Total = 119 + 5.95 = 124.95
      expect(result.pricingMethod).toBe('RULE_BASED');
      expect(result.grossAmount).toBe(119.0);
      expect(result.taxAmount).toBe(5.95);
      expect(result.totalFare).toBe(124.95);
    });

    it('should apply valid coupon discount to calculated fare', async () => {
      repo.findMatchingFareRule.mockResolvedValueOnce(null); // Fallback
      repo.findCouponWithDiscount.mockResolvedValueOnce({
        coupon_id: 'c-1',
        coupon_code: 'SAVE20',
        usage_limit: 100,
        times_used: 10,
        coupon_starts_at: new Date(Date.now() - 100000),
        coupon_expires_at: new Date(Date.now() + 100000),
        coupon_is_active: true,
        discount_id: 'd-1',
        discount_name: '20% Off',
        discount_type: 'PERCENTAGE',
        discount_value: 20,
        min_order_amount: 10,
        max_discount_amount: 50,
        discount_starts_at: new Date(Date.now() - 100000),
        discount_expires_at: new Date(Date.now() + 100000),
        discount_is_active: true,
      });

      const result = await service.calculateFare({
        distanceKm: 20.0,
        seatType: 'REGULAR',
        passengerCategory: 'ADULT',
        couponCode: 'SAVE20',
      });

      expect(result.couponApplied).toBeDefined();
      expect(result.couponApplied?.code).toBe('SAVE20');
      expect(result.discountAmount).toBeGreaterThan(0);
    });
  });

  describe('validateCoupon', () => {
    it('should return invalid if coupon code does not exist', async () => {
      repo.findCouponWithDiscount.mockResolvedValueOnce(null);

      const res = await service.validateCoupon({
        couponCode: 'INVALID',
        orderAmount: 100,
      });
      expect(res.isValid).toBe(false);
      expect(res.message).toContain('invalid');
    });

    it('should return invalid if order amount is below minimum spend', async () => {
      repo.findCouponWithDiscount.mockResolvedValueOnce({
        coupon_id: 'c-1',
        coupon_code: 'MIN500',
        usage_limit: 100,
        times_used: 0,
        coupon_starts_at: new Date(Date.now() - 10000),
        coupon_expires_at: new Date(Date.now() + 10000),
        coupon_is_active: true,
        discount_id: 'd-1',
        discount_name: 'Min 500 Discount',
        discount_type: 'FIXED_AMOUNT',
        discount_value: 50,
        min_order_amount: 500,
        max_discount_amount: null,
        discount_starts_at: new Date(Date.now() - 10000),
        discount_expires_at: new Date(Date.now() + 10000),
        discount_is_active: true,
      });

      const res = await service.validateCoupon({
        couponCode: 'MIN500',
        orderAmount: 200,
      });
      expect(res.isValid).toBe(false);
      expect(res.message).toContain('minimum spend');
    });

    it('should validate active coupon with percentage discount', async () => {
      repo.findCouponWithDiscount.mockResolvedValueOnce({
        coupon_id: 'c-1',
        coupon_code: 'DIWALI10',
        usage_limit: 50,
        times_used: 5,
        coupon_starts_at: new Date(Date.now() - 10000),
        coupon_expires_at: new Date(Date.now() + 10000),
        coupon_is_active: true,
        discount_id: 'd-1',
        discount_name: 'Diwali 10% Off',
        discount_type: 'PERCENTAGE',
        discount_value: 10,
        min_order_amount: 100,
        max_discount_amount: 25,
        discount_starts_at: new Date(Date.now() - 10000),
        discount_expires_at: new Date(Date.now() + 10000),
        discount_is_active: true,
      });

      const res = await service.validateCoupon({
        couponCode: 'DIWALI10',
        orderAmount: 200,
      });
      expect(res.isValid).toBe(true);
      expect(res.discountAmount).toBe(20);
    });
  });
});
