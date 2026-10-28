import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AddWitnessStatementSchema } from '../dto/add-witness.dto';
import { CreateIncidentSchema } from '../dto/create-incident.dto';
import { QueryIncidentsSchema } from '../dto/query-incidents.dto';
import { IncidentsService } from '../services/incidents.service';

@Controller('api/v1/incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get('types')
  async getIncidentTypes() {
    return this.service.getIncidentTypes();
  }

  @Get('severities')
  async getSeverityLevels() {
    return this.service.getSeverityLevels();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async reportIncident(@Body() body: unknown, @CurrentUser() currentUser: any) {
    const parsed = CreateIncidentSchema.parse(body);
    return this.service.reportIncident(parsed, currentUser);
  }

  @Get('my')
  async getMyIncidents(@CurrentUser() currentUser: any) {
    return this.service.getMyIncidents(currentUser);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  async getIncidents(@Query() query: unknown, @CurrentUser() currentUser: any) {
    const parsed = QueryIncidentsSchema.parse(query);
    return this.service.getIncidents(parsed, currentUser);
  }

  @Get(':id')
  async getIncidentById(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.getIncidentById(id, currentUser);
  }

  @Post(':id/witnesses')
  @HttpCode(HttpStatus.CREATED)
  async addWitnessStatement(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() currentUser: any,
  ) {
    const parsed = AddWitnessStatementSchema.parse(body);
    return this.service.addWitnessStatement(id, parsed, currentUser);
  }
}
