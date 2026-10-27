import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { VehicleMaintenanceService } from '../services/vehicle-maintenance.service';
import { CreateMaintenanceScheduleSchema } from '../dto/create-maintenance-schedule.dto';
import { CreateMaintenanceRecordSchema } from '../dto/create-maintenance-record.dto';
import { UpdateMaintenanceStatusSchema } from '../dto/update-maintenance-status.dto';
import { CreateVehicleInspectionSchema } from '../dto/create-vehicle-inspection.dto';
import {
  QueryMaintenanceSchedulesSchema,
  QueryMaintenanceRecordsSchema,
  QueryVehicleInspectionsSchema,
} from '../dto/query-maintenance.dto';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  MaintenanceScheduleEntity,
  MaintenanceRecordEntity,
  VehicleInspectionEntity,
} from '../repositories/vehicle-maintenance.repository';

@ApiTags('Vehicle Maintenance')
@ApiBearerAuth()
@Controller('api/v1/maintenance')
export class VehicleMaintenanceController {
  constructor(private readonly maintService: VehicleMaintenanceService) {}

  // 1. Maintenance Schedules
  @Post('schedules')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR')
  @ApiOperation({ summary: 'Create preventative maintenance schedule' })
  @ApiResponse({ status: 201, description: 'Maintenance schedule created' })
  async createSchedule(
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<MaintenanceScheduleEntity> {
    const validated = CreateMaintenanceScheduleSchema.parse(body);
    return this.maintService.createSchedule(validated, currentUser);
  }

  @Get('schedules')
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'List maintenance schedules' })
  @ApiResponse({ status: 200, description: 'Maintenance schedules retrieved' })
  async getSchedules(
    @Query() query: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<MaintenanceScheduleEntity[]> {
    const validated = QueryMaintenanceSchedulesSchema.parse(query);
    return this.maintService.getSchedules(validated, currentUser);
  }

  @Get('schedules/:id')
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Retrieve maintenance schedule details by ID' })
  @ApiResponse({ status: 200, description: 'Maintenance schedule found' })
  async getScheduleById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<MaintenanceScheduleEntity> {
    return this.maintService.getScheduleById(id, currentUser);
  }

  // 2. Maintenance Records / Work Orders
  @Post('records')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR')
  @ApiOperation({ summary: 'Create maintenance service record / work order' })
  @ApiResponse({ status: 201, description: 'Maintenance record created' })
  async createRecord(
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<MaintenanceRecordEntity> {
    const validated = CreateMaintenanceRecordSchema.parse(body);
    return this.maintService.createRecord(validated, currentUser);
  }

  @Get('records')
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Query maintenance service records' })
  @ApiResponse({ status: 200, description: 'Maintenance records retrieved' })
  async getRecords(
    @Query() query: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ records: MaintenanceRecordEntity[]; total: number }> {
    const validated = QueryMaintenanceRecordsSchema.parse(query);
    return this.maintService.getRecords(validated, currentUser);
  }

  @Get('records/:id')
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Retrieve maintenance service record by ID' })
  @ApiResponse({ status: 200, description: 'Maintenance record found' })
  async getRecordById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<MaintenanceRecordEntity> {
    return this.maintService.getRecordById(id, currentUser);
  }

  @Patch('records/:id/status')
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR')
  @ApiOperation({ summary: 'Update maintenance work order status' })
  @ApiResponse({ status: 200, description: 'Maintenance record status updated' })
  async updateRecordStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<MaintenanceRecordEntity> {
    const validated = UpdateMaintenanceStatusSchema.parse(body);
    return this.maintService.updateRecordStatus(id, validated, currentUser);
  }

  // 3. Vehicle Inspections
  @Post('inspections')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Record daily or pre/post-trip vehicle safety inspection' })
  @ApiResponse({ status: 201, description: 'Vehicle inspection recorded' })
  async createInspection(
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<VehicleInspectionEntity> {
    const validated = CreateVehicleInspectionSchema.parse(body);
    return this.maintService.createInspection(validated, currentUser);
  }

  @Get('inspections')
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Query vehicle inspections history' })
  @ApiResponse({ status: 200, description: 'Vehicle inspections retrieved' })
  async getInspections(
    @Query() query: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ inspections: VehicleInspectionEntity[]; total: number }> {
    const validated = QueryVehicleInspectionsSchema.parse(query);
    return this.maintService.getInspections(validated, currentUser);
  }

  @Get('inspections/:id')
  @Roles('ADMIN', 'FLEET_MANAGER', 'OPERATOR', 'SAFETY_OFFICER', 'DRIVER')
  @ApiOperation({ summary: 'Retrieve vehicle inspection details by ID' })
  @ApiResponse({ status: 200, description: 'Vehicle inspection found' })
  async getInspectionById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<VehicleInspectionEntity> {
    return this.maintService.getInspectionById(id, currentUser);
  }
}
