import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface FareRuleEntity {
  id: string;
  fare_product_id: string;
  route_id: string | null;
  origin_stop_id: string | null;
  destination_stop_id: string | null;
  vehicle_type_id: string | null;
  seat_type: string | null;
  passenger_category: string;
  min_distance_km: number;
  max_distance_km: number | null;
  base_fare: number;
  per_km_rate: number;
  tax_percentage?: number;
}

export interface CouponDiscountEntity {
  coupon_id: string;
  coupon_code: string;
  usage_limit: number;
  times_used: number;
  coupon_starts_at: Date;
  coupon_expires_at: Date;
  coupon_is_active: boolean;
  discount_id: string;
  discount_name: string;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  discount_starts_at: Date;
  discount_expires_at: Date;
  discount_is_active: boolean;
}

export interface TripFareQuoteEntity {
  id: string;
  trip_id: string;
  origin_stop_id: string;
  origin_stop_name?: string;
  destination_stop_id: string;
  destination_stop_name?: string;
  seat_type: string;
  currency: string;
  base_fare: number;
  total_fare: number;
}

@Injectable()
export class FareEstimationRepository {
  constructor(private readonly db: DatabaseService) {}

  async findRouteById(routeId: string): Promise<any | null> {
    const query = `
      SELECT id, route_code, name, distance_km::float, status
      FROM routes
      WHERE id = $1 AND deleted_at IS NULL;
    `;
    const res = await this.db.query(query, [routeId]);
    return res.rows[0] || null;
  }

  async findVehicleTypeById(vehicleTypeId: string): Promise<any | null> {
    const query = `
      SELECT id, code, name, default_fare_multiplier::float
      FROM vehicle_types
      WHERE id = $1;
    `;
    const res = await this.db.query(query, [vehicleTypeId]);
    return res.rows[0] || null;
  }

  async findTripFareQuote(
    tripId: string,
    originStopId: string,
    destStopId: string,
    seatType: string,
  ): Promise<TripFareQuoteEntity | null> {
    const query = `
      SELECT 
        tf.id, tf.trip_id, tf.origin_stop_id, s1.name AS origin_stop_name,
        tf.destination_stop_id, s2.name AS destination_stop_name,
        tf.seat_type, tf.currency, tf.base_fare::float, tf.total_fare::float
      FROM trip_fares tf
      JOIN stops s1 ON tf.origin_stop_id = s1.id
      JOIN stops s2 ON tf.destination_stop_id = s2.id
      WHERE tf.trip_id = $1
        AND tf.origin_stop_id = $2
        AND tf.destination_stop_id = $3
        AND tf.seat_type = $4;
    `;
    const res = await this.db.query<TripFareQuoteEntity>(query, [
      tripId,
      originStopId,
      destStopId,
      seatType,
    ]);
    return res.rows[0] || null;
  }

  async findMatchingFareRule(params: {
    routeId?: string;
    vehicleTypeId?: string;
    passengerCategory: string;
    seatType?: string;
    distanceKm?: number;
  }): Promise<FareRuleEntity | null> {
    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.routeId) {
      conditions.push(`(fr.route_id = $${idx} OR fr.route_id IS NULL)`);
      values.push(params.routeId);
      idx++;
    }
    if (params.vehicleTypeId) {
      conditions.push(`(fr.vehicle_type_id = $${idx} OR fr.vehicle_type_id IS NULL)`);
      values.push(params.vehicleTypeId);
      idx++;
    }
    if (params.seatType) {
      conditions.push(`(fr.seat_type = $${idx} OR fr.seat_type IS NULL)`);
      values.push(params.seatType);
      idx++;
    }
    conditions.push(`fr.passenger_category = $${idx}`);
    values.push(params.passengerCategory);
    idx++;

    if (params.distanceKm !== undefined) {
      conditions.push(`fr.min_distance_km <= $${idx}`);
      values.push(params.distanceKm);
      idx++;
      conditions.push(`(fr.max_distance_km IS NULL OR fr.max_distance_km >= $${idx})`);
      values.push(params.distanceKm);
      idx++;
    }

    const query = `
      SELECT 
        fr.id, fr.fare_product_id, fr.route_id, fr.origin_stop_id, fr.destination_stop_id,
        fr.vehicle_type_id, fr.seat_type, fr.passenger_category,
        fr.min_distance_km::float, fr.max_distance_km::float,
        fr.base_fare::float, fr.per_km_rate::float,
        COALESCE(fp.tax_percentage::float, 5.0) AS tax_percentage
      FROM fare_rules fr
      LEFT JOIN fare_prices fp ON fp.fare_rule_id = fr.id AND fp.is_active = TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY (CASE WHEN fr.route_id IS NOT NULL THEN 1 ELSE 2 END),
               (CASE WHEN fr.vehicle_type_id IS NOT NULL THEN 1 ELSE 2 END)
      LIMIT 1;
    `;
    const res = await this.db.query<FareRuleEntity>(query, values);
    return res.rows[0] || null;
  }

  async findCouponWithDiscount(couponCode: string): Promise<CouponDiscountEntity | null> {
    const query = `
      SELECT 
        c.id AS coupon_id,
        c.coupon_code,
        c.usage_limit,
        c.times_used,
        c.starts_at AS coupon_starts_at,
        c.expires_at AS coupon_expires_at,
        c.is_active AS coupon_is_active,
        d.id AS discount_id,
        d.name AS discount_name,
        d.discount_type,
        d.discount_value::float,
        d.min_order_amount::float,
        d.max_discount_amount::float,
        d.starts_at AS discount_starts_at,
        d.expires_at AS discount_expires_at,
        d.is_active AS discount_is_active
      FROM coupons c
      JOIN discounts d ON c.discount_id = d.id
      WHERE c.coupon_code = $1;
    `;
    const res = await this.db.query<CouponDiscountEntity>(query, [couponCode]);
    return res.rows[0] || null;
  }

  async findTripFaresByTripId(tripId: string): Promise<TripFareQuoteEntity[]> {
    const query = `
      SELECT 
        tf.id, tf.trip_id, tf.origin_stop_id, s1.name AS origin_stop_name,
        tf.destination_stop_id, s2.name AS destination_stop_name,
        tf.seat_type, tf.currency, tf.base_fare::float, tf.total_fare::float
      FROM trip_fares tf
      JOIN stops s1 ON tf.origin_stop_id = s1.id
      JOIN stops s2 ON tf.destination_stop_id = s2.id
      WHERE tf.trip_id = $1
      ORDER BY tf.base_fare ASC;
    `;
    const res = await this.db.query<TripFareQuoteEntity>(query, [tripId]);
    return res.rows;
  }

  async findRouteFareRules(routeId: string): Promise<FareRuleEntity[]> {
    const query = `
      SELECT 
        fr.id, fr.fare_product_id, fr.route_id, fr.origin_stop_id, fr.destination_stop_id,
        fr.vehicle_type_id, fr.seat_type, fr.passenger_category,
        fr.min_distance_km::float, fr.max_distance_km::float,
        fr.base_fare::float, fr.per_km_rate::float,
        COALESCE(fp.tax_percentage::float, 5.0) AS tax_percentage
      FROM fare_rules fr
      LEFT JOIN fare_prices fp ON fp.fare_rule_id = fr.id AND fp.is_active = TRUE
      WHERE fr.route_id = $1 OR fr.route_id IS NULL
      ORDER BY fr.passenger_category ASC, fr.base_fare ASC;
    `;
    const res = await this.db.query<FareRuleEntity>(query, [routeId]);
    return res.rows;
  }
}
