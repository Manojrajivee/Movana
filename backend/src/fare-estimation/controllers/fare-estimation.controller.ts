import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CalculateFareSchema } from '../dto/calculate-fare.dto';
import { ValidateCouponSchema } from '../dto/validate-coupon.dto';
import { FareEstimationService } from '../services/fare-estimation.service';

@ApiTags('Fare Estimation')
@Public()
@Controller('api/v1/fare-estimation')
export class FareEstimationController {
  constructor(private readonly service: FareEstimationService) {}

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calculate estimated transit fare with taxes, multipliers, and discounts',
  })
  @ApiResponse({ status: 200, description: 'Fare calculated successfully' })
  async calculateFare(@Body() body: unknown) {
    const validated = CalculateFareSchema.parse(body);
    return this.service.calculateFare(validated);
  }

  @Get('routes/:routeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get fare pricing matrix across passenger categories for a route' })
  @ApiResponse({ status: 200, description: 'Route fare matrix retrieved successfully' })
  async getRouteFareMatrix(@Param('routeId', ParseUUIDPipe) routeId: string) {
    return this.service.getRouteFareMatrix(routeId);
  }

  @Get('trips/:tripId/quotes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get stop-to-stop materialized fare quotes for a trip' })
  @ApiResponse({ status: 200, description: 'Trip fare quotes retrieved successfully' })
  async getTripFareQuotes(@Param('tripId', ParseUUIDPipe) tripId: string) {
    return this.service.getTripFareQuotes(tripId);
  }

  @Post('coupons/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate discount coupon voucher eligibility and discount amount' })
  @ApiResponse({ status: 200, description: 'Coupon validation completed' })
  async validateCoupon(@Body() body: unknown) {
    const validated = ValidateCouponSchema.parse(body);
    return this.service.validateCoupon(validated);
  }
}
