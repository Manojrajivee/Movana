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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateRouteVersionSchema } from '../dto/create-route-version.dto';
import { CreateRouteSchema } from '../dto/create-route.dto';
import { QueryRoutesSchema } from '../dto/query-routes.dto';
import { UpdateRouteStatusSchema } from '../dto/update-route-status.dto';
import { UpdateRouteSchema } from '../dto/update-route.dto';
import { RoutesService } from '../services/routes.service';

@ApiTags('Routes')
@ApiBearerAuth()
@Controller('api/v1/routes')
export class RoutesController {
  constructor(private readonly service: RoutesService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a master transportation transit route' })
  @ApiResponse({ status: 201, description: 'Route created successfully' })
  async createRoute(@Body() body: unknown) {
    const validated = CreateRouteSchema.parse(body);
    return this.service.createRoute(validated);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List and query transit routes' })
  @ApiResponse({ status: 200, description: 'Routes retrieved successfully' })
  async getRoutes(@Query() query: unknown) {
    const validated = QueryRoutesSchema.parse(query);
    return this.service.getRoutes(validated);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get route details by ID with origin/destination stop data' })
  @ApiResponse({ status: 200, description: 'Route found' })
  async getRouteById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getRouteById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update route name, description, distance or duration' })
  @ApiResponse({ status: 200, description: 'Route updated successfully' })
  async updateRoute(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateRouteSchema.parse(body);
    return this.service.updateRoute(id, validated);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update route operational status (ACTIVE, INACTIVE, SUSPENDED)' })
  @ApiResponse({ status: 200, description: 'Route status updated successfully' })
  async updateRouteStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = UpdateRouteStatusSchema.parse(body);
    return this.service.updateRouteStatus(id, validated);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete transit route' })
  @ApiResponse({ status: 200, description: 'Route soft-deleted successfully' })
  async deleteRoute(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteRoute(id);
  }

  @Post(':id/versions')
  @Roles('ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish a new revision version for a route' })
  @ApiResponse({ status: 201, description: 'Route version published successfully' })
  async createRouteVersion(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const validated = CreateRouteVersionSchema.parse(body);
    return this.service.createRouteVersion(id, validated);
  }

  @Get(':id/versions')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List version revision history for a route' })
  @ApiResponse({ status: 200, description: 'Route versions retrieved' })
  async getRouteVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getRouteVersions(id);
  }
}
