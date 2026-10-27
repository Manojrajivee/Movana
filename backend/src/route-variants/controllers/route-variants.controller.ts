import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AddRouteStopSchema } from '../dto/add-route-stop.dto';
import { ReorderRouteStopsSchema } from '../dto/reorder-route-stops.dto';
import { UpdateRouteStopSchema } from '../dto/update-route-stop.dto';
import { RouteVariantsService } from '../services/route-variants.service';

@ApiTags('Route Variants')
@ApiBearerAuth()
@Controller('api/v1/routes/:routeId/stops')
export class RouteVariantsController {
  constructor(private readonly service: RouteVariantsService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a intermediate stop to the route alignment/variant sequence' })
  @ApiResponse({ status: 201, description: 'Route stop added successfully' })
  async addRouteStop(@Param('routeId', ParseUUIDPipe) routeId: string, @Body() body: unknown) {
    const validated = AddRouteStopSchema.parse(body);
    return this.service.addRouteStop(routeId, validated);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get full ordered stop alignment for a transit route' })
  @ApiResponse({ status: 200, description: 'Route stops retrieved successfully' })
  async getStopsByRouteId(@Param('routeId', ParseUUIDPipe) routeId: string) {
    return this.service.getStopsByRouteId(routeId);
  }

  @Get('alignment-summary')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get route alignment overview, total stops, and distance statistics' })
  @ApiResponse({ status: 200, description: 'Route alignment summary retrieved' })
  async getAlignmentSummary(@Param('routeId', ParseUUIDPipe) routeId: string) {
    return this.service.getAlignmentSummary(routeId);
  }

  @Post('reorder')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder the sequence numbers of stops in route topological alignment' })
  @ApiResponse({ status: 200, description: 'Route stops reordered successfully' })
  async reorderRouteStops(@Param('routeId', ParseUUIDPipe) routeId: string, @Body() body: unknown) {
    const validated = ReorderRouteStopsSchema.parse(body);
    return this.service.reorderRouteStops(routeId, validated);
  }

  @Get(':stopId')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get stop topological alignment details on route' })
  @ApiResponse({ status: 200, description: 'Route stop found' })
  async getRouteStop(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.service.getRouteStop(routeId, stopId);
  }

  @Patch(':stopId')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update route stop timing offsets, boarding/dropoff permissions' })
  @ApiResponse({ status: 200, description: 'Route stop updated successfully' })
  async updateRouteStop(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() body: unknown,
  ) {
    const validated = UpdateRouteStopSchema.parse(body);
    return this.service.updateRouteStop(routeId, stopId, validated);
  }

  @Delete(':stopId')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a stop from the route topological sequence' })
  @ApiResponse({ status: 200, description: 'Route stop removed successfully' })
  async deleteRouteStop(
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Param('stopId', ParseUUIDPipe) stopId: string,
  ) {
    return this.service.deleteRouteStop(routeId, stopId);
  }
}
