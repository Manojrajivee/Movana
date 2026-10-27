import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FleetService } from '../services/fleet.service';
import { CreateVehicleDto, CreateVehicleSchema } from '../dto/create-vehicle.dto';
import { UpdateVehicleDto, UpdateVehicleSchema } from '../dto/update-vehicle.dto';
import {
  UpdateVehicleStatusDto,
  UpdateVehicleStatusSchema,
} from '../dto/update-vehicle-status.dto';
import {
  UpdateVehicleTelemetryDto,
  UpdateVehicleTelemetrySchema,
} from '../dto/update-vehicle-telemetry.dto';
import { QueryVehiclesDto, QueryVehiclesSchema } from '../dto/query-vehicles.dto';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  VehicleEntity,
  VehicleTypeEntity,
  VehicleModelEntity,
  VehicleManufacturerEntity,
} from '../repositories/fleet.repository';

@ApiTags('Fleet & Vehicles')
@ApiBearerAuth()
@Controller('api/v1/vehicles')
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('types')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'List all vehicle classification types / service classes' })
  @ApiResponse({ status: 200, description: 'Vehicle types retrieved successfully' })
  async getVehicleTypes(): Promise<VehicleTypeEntity[]> {
    return this.fleetService.getVehicleTypes();
  }

  @Get('models')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'List vehicle models optionally filtered by manufacturer' })
  @ApiResponse({ status: 200, description: 'Vehicle models retrieved successfully' })
  async getVehicleModels(
    @Query('manufacturerId') manufacturerId?: string,
  ): Promise<VehicleModelEntity[]> {
    return this.fleetService.getVehicleModels(manufacturerId);
  }

  @Get('manufacturers')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'List all registered vehicle manufacturers' })
  @ApiResponse({ status: 200, description: 'Manufacturers retrieved successfully' })
  async getManufacturers(): Promise<VehicleManufacturerEntity[]> {
    return this.fleetService.getManufacturers();
  }

  @Post()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new physical vehicle in the fleet' })
  @ApiResponse({ status: 201, description: 'Vehicle created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failure or capacity invariant mismatch' })
  @ApiResponse({ status: 404, description: 'Referenced model, type, or manufacturer not found' })
  @ApiResponse({ status: 409, description: 'Duplicate registration number, vehicle code, or VIN' })
  async createVehicle(
    @Body() body: CreateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleEntity> {
    const validated = CreateVehicleSchema.parse(body);
    return this.fleetService.createVehicle(validated, user);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'List fleet vehicles with search and status filtering' })
  @ApiResponse({ status: 200, description: 'Vehicles retrieved successfully' })
  async getVehicles(
    @Query() query: QueryVehiclesDto,
  ): Promise<{ vehicles: VehicleEntity[]; total: number }> {
    const validated = QueryVehiclesSchema.parse(query);
    return this.fleetService.getVehicles(validated);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Get vehicle details by ID' })
  @ApiResponse({ status: 200, description: 'Vehicle found' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async getVehicleById(@Param('id', ParseUUIDPipe) id: string): Promise<VehicleEntity> {
    return this.fleetService.getVehicleById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @ApiOperation({ summary: 'Update vehicle specifications or capacity' })
  @ApiResponse({ status: 200, description: 'Vehicle updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid capacity or decommissioned vehicle' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async updateVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVehicleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleEntity> {
    const validated = UpdateVehicleSchema.parse(body);
    return this.fleetService.updateVehicle(id, validated, user);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @ApiOperation({
    summary: 'Transition vehicle status (ACTIVE, MAINTENANCE, DECOMMISSIONED, RESERVED)',
  })
  @ApiResponse({ status: 200, description: 'Status updated and logged' })
  @ApiResponse({ status: 400, description: 'Cannot transition from DECOMMISSIONED' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async updateVehicleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVehicleStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleEntity> {
    const validated = UpdateVehicleStatusSchema.parse(body);
    return this.fleetService.updateVehicleStatus(id, validated, user);
  }

  @Patch(':id/telemetry')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @ApiOperation({ summary: 'Update vehicle real-time GPS coordinates and odometer' })
  @ApiResponse({ status: 200, description: 'Telemetry updated' })
  @ApiResponse({ status: 400, description: 'Invalid coordinate range' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async updateVehicleTelemetry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVehicleTelemetryDto,
  ): Promise<VehicleEntity> {
    const validated = UpdateVehicleTelemetrySchema.parse(body);
    return this.fleetService.updateVehicleTelemetry(id, validated);
  }

  @Delete(':id')
  @Roles('ADMIN', 'FLEET_MANAGER')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete vehicle from active fleet registry' })
  @ApiResponse({ status: 204, description: 'Vehicle decommissioned and soft-deleted' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async deleteVehicle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.fleetService.deleteVehicle(id, user);
  }
}
