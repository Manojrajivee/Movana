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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateSafetyZoneSchema } from '../dto/create-safety-zone.dto';
import { EvaluateSafetyZoneSchema } from '../dto/evaluate-safety-zone.dto';
import { QuerySafetyZonesSchema } from '../dto/query-safety-zones.dto';
import { UpdateSafetyZoneSchema } from '../dto/update-safety-zone.dto';
import { SafetyZonesService } from '../services/safety-zones.service';

@Controller('api/v1/safety-zones')
export class SafetyZonesController {
  constructor(private readonly service: SafetyZonesService) {}

  @Post()
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.CREATED)
  async createSafetyZone(@Body() body: unknown, @CurrentUser() currentUser: any) {
    const parsed = CreateSafetyZoneSchema.parse(body);
    return this.service.createSafetyZone(parsed, currentUser);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER', 'PASSENGER')
  async getSafetyZones(@Query() query: unknown) {
    const parsed = QuerySafetyZonesSchema.parse(query);
    return this.service.getSafetyZones(parsed);
  }

  @Get('active-alerts')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER')
  async getRecentAlerts(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10), 1), 100) : 50;
    return this.service.getRecentAlerts(parsedLimit);
  }

  @Post('evaluate')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  async evaluatePosition(@Body() body: unknown, @CurrentUser() currentUser: any) {
    const parsed = EvaluateSafetyZoneSchema.parse(body);
    return this.service.evaluatePosition(parsed, currentUser);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER', 'PASSENGER')
  async getSafetyZoneById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSafetyZoneById(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  async updateSafetyZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: any,
  ) {
    const parsed = UpdateSafetyZoneSchema.parse(body);
    return this.service.updateSafetyZone(id, parsed, currentUser);
  }

  @Delete(':id')
  @Roles('ADMIN', 'OPERATOR')
  async deleteSafetyZone(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() currentUser: any) {
    const success = await this.service.deleteSafetyZone(id, currentUser);
    return { success };
  }
}
