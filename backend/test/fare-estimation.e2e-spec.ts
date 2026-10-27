import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { DatabaseService } from '../src/database/database.service';
import { FareEstimationRepository } from '../src/fare-estimation/repositories/fare-estimation.repository';

describe('Fare Estimation (e2e)', () => {
  let app: INestApplication;

  const routeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const tripId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

  const mockDatabaseService = {
    verifyIdentity: jest.fn().mockResolvedValue({
      database_name: 'movana',
      database_user: 'movana_app',
    }),
    checkHealth: jest.fn().mockResolvedValue({
      status: 'up',
      latencyMs: 1,
      database: 'movana',
      user: 'movana_app',
    }),
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };

  const mockFareRepo = {
    findRouteById: jest.fn().mockResolvedValue({
      id: routeId,
      route_code: 'DEL-JPR',
      distance_km: 150.0,
      status: 'ACTIVE',
    }),
    findVehicleTypeById: jest.fn().mockResolvedValue(null),
    findTripFareQuote: jest.fn().mockResolvedValue(null),
    findMatchingFareRule: jest.fn().mockResolvedValue({
      id: 'rule-1',
      fare_product_id: 'fp-1',
      route_id: routeId,
      base_fare: 25.0,
      per_km_rate: 1.8,
      tax_percentage: 5.0,
    }),
    findCouponWithDiscount: jest.fn().mockImplementation((code: string) => {
      if (code === 'SAVE10') {
        return Promise.resolve({
          coupon_id: 'c-1',
          coupon_code: 'SAVE10',
          usage_limit: 100,
          times_used: 10,
          coupon_starts_at: new Date(Date.now() - 10000),
          coupon_expires_at: new Date(Date.now() + 10000),
          coupon_is_active: true,
          discount_id: 'd-1',
          discount_name: 'Save 10 Percent',
          discount_type: 'PERCENTAGE',
          discount_value: 10,
          min_order_amount: 50,
          max_discount_amount: 50,
          discount_starts_at: new Date(Date.now() - 10000),
          discount_expires_at: new Date(Date.now() + 10000),
          discount_is_active: true,
        });
      }
      return Promise.resolve(null);
    }),
    findTripFaresByTripId: jest.fn().mockResolvedValue([
      {
        id: 'tf-1',
        trip_id: tripId,
        origin_stop_id: '11111111-1111-4111-a111-111111111111',
        origin_stop_name: 'Origin Stop',
        destination_stop_id: '22222222-2222-4222-a222-222222222222',
        destination_stop_name: 'Dest Stop',
        seat_type: 'REGULAR',
        currency: 'INR',
        base_fare: 50.0,
        total_fare: 80.0,
      },
    ]),
    findRouteFareRules: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(FareEstimationRepository)
      .useValue(mockFareRepo)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/fare-estimation/calculate', () => {
    it('should calculate fare estimate with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fare-estimation/calculate')
        .send({
          routeId,
          seatType: 'REGULAR',
          passengerCategory: 'ADULT',
          couponCode: 'SAVE10',
        });

      expect(res.status).toBe(200);
      expect(res.body.currency).toBe('INR');
      expect(res.body.grossAmount).toBeGreaterThan(0);
      expect(res.body.totalFare).toBeGreaterThan(0);
      expect(res.body.couponApplied?.code).toBe('SAVE10');
    });
  });

  describe('GET /api/v1/fare-estimation/routes/:routeId', () => {
    it('should reject invalid UUID with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/fare-estimation/routes/invalid-uuid',
      );

      expect(res.status).toBe(400);
    });

    it('should return route fare matrix with 200 OK', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/fare-estimation/routes/${routeId}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.routeId).toBe(routeId);
      expect(res.body.fareMatrix).toHaveLength(4);
    });
  });

  describe('GET /api/v1/fare-estimation/trips/:tripId/quotes', () => {
    it('should return stop-to-stop quotes for trip with 200 OK', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/fare-estimation/trips/${tripId}/quotes`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].currency).toBe('INR');
    });
  });

  describe('POST /api/v1/fare-estimation/coupons/validate', () => {
    it('should reject invalid request payload with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fare-estimation/coupons/validate')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should validate coupon code with 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/fare-estimation/coupons/validate')
        .send({
          couponCode: 'SAVE10',
          orderAmount: 100,
        });

      expect(res.status).toBe(200);
      expect(res.body.isValid).toBe(true);
      expect(res.body.discountAmount).toBe(10);
    });
  });
});
