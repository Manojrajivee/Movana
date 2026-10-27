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
import {
  FleetOperationsService,
  VehicleReadinessResult,
} from '../services/fleet-operations.service';
import { CreateVehicleAssignmentSchema } from '../dto/create-vehicle-assignment.dto';
import { QueryVehicleAssignmentsSchema } from '../dto/query-vehicle-assignments.dto';
import { UpdateVehicleAssignmentStatusSchema } from '../dto/update-vehicle-assignment-status.dto';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  VehicleAssignmentEntity,
  VehicleStatusHistoryEntity,
  FleetSummaryStats,
} from '../repositories/fleet-operations.repository';

@ApiTags('Fleet Operations')
@ApiBearerAuth()
@Controller('api/v1/fleet-operations')
export class FleetOperationsController {
  constructor(private readonly fleetOpsService: FleetOperationsService) {}

  @Post('assignments')
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @ApiOperation({ summary: 'Dispatch and assign a vehicle to a driver shift or trip' })
  @ApiResponse({ status: 201, description: 'Vehicle assignment created successfully' })
  async createAssignment(
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<VehicleAssignmentEntity> {
    const validated = CreateVehicleAssignmentSchema.parse(body);
    return this.fleetOpsService.createAssignment(validated, currentUser);
  }

  @Get('assignments')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @ApiOperation({ summary: 'Query vehicle assignments with optional filters' })
  @ApiResponse({ status: 200, description: 'Vehicle assignments retrieved successfully' })
  async getAssignments(
    @Query() query: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ assignments: VehicleAssignmentEntity[]; total: number }> {
    const validated = QueryVehicleAssignmentsSchema.parse(query);
    return this.fleetOpsService.getAssignments(validated, currentUser);
  }

  @Get('assignments/:id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @ApiOperation({ summary: 'Retrieve vehicle assignment details by ID' })
  @ApiResponse({ status: 200, description: 'Vehicle assignment found' })
  async getAssignmentById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<VehicleAssignmentEntity> {
    return this.fleetOpsService.getAssignmentById(id, currentUser);
  }

  @Patch('assignments/:id/status')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @ApiOperation({ summary: 'Update vehicle assignment operational status' })
  @ApiResponse({ status: 200, description: 'Vehicle assignment status updated' })
  async updateAssignmentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<VehicleAssignmentEntity> {
    const validated = UpdateVehicleAssignmentStatusSchema.parse(body);
    return this.fleetOpsService.updateAssignmentStatus(id, validated, currentUser);
  }

  @Get('vehicles/:id/readiness')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'DRIVER')
  @ApiOperation({ summary: 'Inspect vehicle operational dispatch readiness' })
  @ApiResponse({ status: 200, description: 'Vehicle readiness evaluation completed' })
  async getVehicleReadiness(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<VehicleReadinessResult> {
    return this.fleetOpsService.getVehicleReadiness(id, currentUser);
  }

  @Get('vehicles/:id/status-history')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @ApiOperation({ summary: 'Retrieve vehicle status transition audit log' })
  @ApiResponse({ status: 200, description: 'Vehicle status history retrieved' })
  async getVehicleStatusHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ): Promise<{ history: VehicleStatusHistoryEntity[]; total: number }> {
    const lim = limit ? parseInt(limit, 10) : 20;
    const off = offset ? parseInt(offset, 10) : 0;
    return this.fleetOpsService.getVehicleStatusHistory(id, lim, off, currentUser!);
  }

  @Get('summary')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  @ApiOperation({ summary: 'Retrieve fleet operational summary statistics' })
  @ApiResponse({ status: 200, description: 'Fleet operational summary retrieved' })
  async getFleetSummary(@CurrentUser() currentUser: AuthenticatedUser): Promise<FleetSummaryStats> {
    return this.fleetOpsService.getFleetSummary(currentUser);
  }
}
