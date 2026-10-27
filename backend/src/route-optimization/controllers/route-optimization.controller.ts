import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { QueryRouteAnalyticsSchema } from '../dto/query-route-analytics.dto';
import { RouteOptimizationService } from '../services/route-optimization.service';

@ApiTags('Route Optimization')
@ApiBearerAuth()
@Controller('api/v1/route-optimization')
export class RouteOptimizationController {
  constructor(private readonly service: RouteOptimizationService) {}

  @Get('routes/:routeId/analytics')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DISPATCHER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get segment-level speed, delay, and bottleneck analytics for a route' })
  @ApiResponse({ status: 200, description: 'Route analytics retrieved successfully' })
  async getRouteAnalytics(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Query('timeframeDays') timeframeDays?: string,
  ) {
    const validated = QueryRouteAnalyticsSchema.parse({ timeframeDays });
    return this.service.getRouteAnalytics(routeId, validated.timeframeDays);
  }

  @Get('routes/:routeId/recommendations')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DISPATCHER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get optimal departure window recommendations based on historical delay trends',
  })
  @ApiResponse({ status: 200, description: 'Route recommendations retrieved successfully' })
  async getRouteRecommendations(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Query('timeframeDays') timeframeDays?: string,
  ) {
    const validated = QueryRouteAnalyticsSchema.parse({ timeframeDays });
    return this.service.getRouteRecommendations(routeId, validated.timeframeDays);
  }

  @Get('network/congestion-hotspots')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DISPATCHER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get network-wide top congested route segments and traffic bottlenecks',
  })
  @ApiResponse({ status: 200, description: 'Network congestion hotspots retrieved successfully' })
  async getNetworkCongestionHotspots(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(50, Math.max(1, parseInt(limit, 10))) : 10;
    return this.service.getNetworkCongestionHotspots(parsedLimit);
  }
}
