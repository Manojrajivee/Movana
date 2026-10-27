import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CalculateFareDto } from '../dto/calculate-fare.dto';
import { ValidateCouponDto } from '../dto/validate-coupon.dto';
import {
  FareEstimationRepository,
  TripFareQuoteEntity,
} from '../repositories/fare-estimation.repository';

export interface FareCalculationResult {
  currency: string;
  distanceKm: number;
  passengerCategory: string;
  seatType: string;
  baseFare: number;
  distanceFare: number;
  grossAmount: number;
  taxPercentage: number;
  taxAmount: number;
  discountAmount: number;
  couponApplied?: {
    code: string;
    discountType: string;
    discountValue: number;
  } | null;
  totalFare: number;
  pricingMethod: 'MATERIALIZED_TRIP_QUOTE' | 'RULE_BASED' | 'DYNAMIC_DISTANCE_MATRIX';
}

export interface CouponValidationResult {
  isValid: boolean;
  couponCode: string;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue?: number;
  discountAmount: number;
  message: string;
}

@Injectable()
export class FareEstimationService {
  private readonly logger = new Logger(FareEstimationService.name);

  private readonly PASSENGER_MULTIPLIERS: Record<string, number> = {
    ADULT: 1.0,
    SENIOR: 0.7,
    STUDENT: 0.6,
    CHILD: 0.5,
  };

  private readonly SEAT_TYPE_MULTIPLIERS: Record<string, number> = {
    REGULAR: 1.0,
    AC: 1.25,
    SLEEPER: 1.5,
    EXECUTIVE: 1.75,
  };

  constructor(private readonly repo: FareEstimationRepository) {}

  async calculateFare(dto: CalculateFareDto): Promise<FareCalculationResult> {
    // 1. Check materialized trip quote if tripId and stop IDs provided
    if (dto.tripId && dto.originStopId && dto.destinationStopId) {
      const quote = await this.repo.findTripFareQuote(
        dto.tripId,
        dto.originStopId,
        dto.destinationStopId,
        dto.seatType,
      );
      if (quote) {
        let discountAmount = 0;
        let couponApplied = null;
        if (dto.couponCode) {
          const couponRes = await this.validateCoupon({
            couponCode: dto.couponCode,
            orderAmount: quote.total_fare,
          });
          if (couponRes.isValid) {
            discountAmount = couponRes.discountAmount;
            couponApplied = {
              code: couponRes.couponCode,
              discountType: couponRes.discountType!,
              discountValue: couponRes.discountValue!,
            };
          }
        }

        const finalTotal = Math.max(0, parseFloat((quote.total_fare - discountAmount).toFixed(2)));
        return {
          currency: quote.currency || 'INR',
          distanceKm: 0,
          passengerCategory: dto.passengerCategory,
          seatType: dto.seatType,
          baseFare: quote.base_fare,
          distanceFare: parseFloat((quote.total_fare - quote.base_fare).toFixed(2)),
          grossAmount: quote.total_fare,
          taxPercentage: 5.0,
          taxAmount: parseFloat((quote.total_fare * 0.05).toFixed(2)),
          discountAmount,
          couponApplied,
          totalFare: finalTotal,
          pricingMethod: 'MATERIALIZED_TRIP_QUOTE',
        };
      }
    }

    // 2. Resolve Distance
    let distanceKm = dto.distanceKm;
    if (!distanceKm && dto.routeId) {
      const route = await this.repo.findRouteById(dto.routeId);
      if (!route) {
        throw new NotFoundException(`Route with ID '${dto.routeId}' not found`);
      }
      distanceKm = route.distance_km;
    }
    if (!distanceKm) {
      distanceKm = 15.0; // Default nominal transit trip distance
    }

    // 3. Resolve Multipliers
    let vehicleMultiplier = 1.0;
    if (dto.vehicleTypeId) {
      const vtype = await this.repo.findVehicleTypeById(dto.vehicleTypeId);
      if (vtype) {
        vehicleMultiplier = vtype.default_fare_multiplier || 1.0;
      }
    }
    const seatMultiplier = this.SEAT_TYPE_MULTIPLIERS[dto.seatType] || 1.0;
    const combinedVehicleMultiplier = vehicleMultiplier * seatMultiplier;
    const passengerMultiplier = this.PASSENGER_MULTIPLIERS[dto.passengerCategory] || 1.0;

    // 4. Match Fare Rule or Fallback
    const rule = await this.repo.findMatchingFareRule({
      routeId: dto.routeId,
      vehicleTypeId: dto.vehicleTypeId,
      passengerCategory: dto.passengerCategory,
      seatType: dto.seatType,
      distanceKm,
    });

    const baseFare = rule ? rule.base_fare : 20.0;
    const perKmRate = rule ? rule.per_km_rate : 1.75;
    const rawDistanceFare = distanceKm * perKmRate * combinedVehicleMultiplier;
    const distanceFare = parseFloat(rawDistanceFare.toFixed(2));

    const rawGross = (baseFare + distanceFare) * passengerMultiplier;
    const grossAmount = parseFloat(rawGross.toFixed(2));

    const taxPercentage = rule?.tax_percentage || 5.0;
    const taxAmount = parseFloat(((grossAmount * taxPercentage) / 100).toFixed(2));

    // 5. Coupon Discount
    let discountAmount = 0;
    let couponApplied = null;
    if (dto.couponCode) {
      const couponRes = await this.validateCoupon({
        couponCode: dto.couponCode,
        orderAmount: grossAmount,
      });
      if (couponRes.isValid) {
        discountAmount = couponRes.discountAmount;
        couponApplied = {
          code: couponRes.couponCode,
          discountType: couponRes.discountType!,
          discountValue: couponRes.discountValue!,
        };
      }
    }

    const totalFare = Math.max(
      0,
      parseFloat((grossAmount + taxAmount - discountAmount).toFixed(2)),
    );

    return {
      currency: 'INR',
      distanceKm,
      passengerCategory: dto.passengerCategory,
      seatType: dto.seatType,
      baseFare,
      distanceFare,
      grossAmount,
      taxPercentage,
      taxAmount,
      discountAmount,
      couponApplied,
      totalFare,
      pricingMethod: rule ? 'RULE_BASED' : 'DYNAMIC_DISTANCE_MATRIX',
    };
  }

  async getRouteFareMatrix(routeId: string) {
    const route = await this.repo.findRouteById(routeId);
    if (!route) {
      throw new NotFoundException(`Route with ID '${routeId}' not found`);
    }

    const rules = await this.repo.findRouteFareRules(routeId);
    const matrix = await Promise.all(
      ['ADULT', 'CHILD', 'SENIOR', 'STUDENT'].map(async (cat) => {
        const fare = await this.calculateFare({
          routeId,
          distanceKm: route.distance_km,
          passengerCategory: cat as any,
          seatType: 'REGULAR',
        });
        return {
          passengerCategory: cat,
          seatType: 'REGULAR',
          grossFare: fare.grossAmount,
          taxAmount: fare.taxAmount,
          totalFare: fare.totalFare,
        };
      }),
    );

    return {
      routeId: route.id,
      routeCode: route.route_code,
      distanceKm: route.distance_km,
      fareRulesCount: rules.length,
      fareMatrix: matrix,
    };
  }

  async getTripFareQuotes(tripId: string): Promise<TripFareQuoteEntity[]> {
    return this.repo.findTripFaresByTripId(tripId);
  }

  async validateCoupon(dto: ValidateCouponDto): Promise<CouponValidationResult> {
    const coupon = await this.repo.findCouponWithDiscount(dto.couponCode);
    if (!coupon) {
      return {
        isValid: false,
        couponCode: dto.couponCode,
        discountAmount: 0,
        message: `Coupon code '${dto.couponCode}' is invalid or does not exist`,
      };
    }

    const now = new Date();
    if (!coupon.coupon_is_active || !coupon.discount_is_active) {
      return {
        isValid: false,
        couponCode: dto.couponCode,
        discountAmount: 0,
        message: `Coupon '${dto.couponCode}' is inactive or has been disabled`,
      };
    }

    if (now < new Date(coupon.coupon_starts_at) || now > new Date(coupon.coupon_expires_at)) {
      return {
        isValid: false,
        couponCode: dto.couponCode,
        discountAmount: 0,
        message: `Coupon '${dto.couponCode}' has expired or is not yet active`,
      };
    }

    if (coupon.times_used >= coupon.usage_limit) {
      return {
        isValid: false,
        couponCode: dto.couponCode,
        discountAmount: 0,
        message: `Coupon '${dto.couponCode}' has reached its maximum redemption limit`,
      };
    }

    if (dto.orderAmount > 0 && dto.orderAmount < coupon.min_order_amount) {
      return {
        isValid: false,
        couponCode: dto.couponCode,
        discountAmount: 0,
        message: `Order amount of ₹${dto.orderAmount} is below coupon minimum spend of ₹${coupon.min_order_amount}`,
      };
    }

    let calculatedDiscount = 0;
    if (coupon.discount_type === 'PERCENTAGE') {
      const rawDiscount = (dto.orderAmount * coupon.discount_value) / 100;
      calculatedDiscount = coupon.max_discount_amount
        ? Math.min(rawDiscount, coupon.max_discount_amount)
        : rawDiscount;
    } else {
      calculatedDiscount = coupon.discount_value;
    }

    calculatedDiscount = parseFloat(calculatedDiscount.toFixed(2));

    return {
      isValid: true,
      couponCode: coupon.coupon_code,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      discountAmount: calculatedDiscount,
      message: `Coupon '${coupon.coupon_code}' applied successfully: ${coupon.discount_name}`,
    };
  }
}
