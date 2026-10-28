import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CreateAlertRuleSchema,
  EvaluateAlertEventSchema,
  UpdateAlertRuleSchema,
} from '../dto/create-alert-rule.dto';
import { AlertRulesService } from '../services/alert-rules.service';

@Controller('api/v1/alert-rules')
export class AlertRulesController {
  constructor(private readonly service: AlertRulesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRule(@CurrentUser() currentUser: any, @Body() body: unknown) {
    const parsed = CreateAlertRuleSchema.parse(body);
    return this.service.createRule(parsed, currentUser);
  }

  @Get()
  async getMyRules(@CurrentUser() currentUser: any, @Query('userId') filterUserId?: string) {
    return this.service.getUserRules(currentUser, filterUserId);
  }

  @Get(':id')
  async getRuleById(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.getRuleById(id, currentUser);
  }

  @Patch(':id')
  async updateRule(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
    @Body() body: unknown,
  ) {
    const parsed = UpdateAlertRuleSchema.parse(body);
    return this.service.updateRule(id, parsed, currentUser);
  }

  @Patch(':id/toggle')
  async toggleRule(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
    @Body('isActive') isActive: boolean,
  ) {
    return this.service.toggleRuleActive(id, Boolean(isActive), currentUser);
  }

  @Delete(':id')
  async deleteRule(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.service.deleteRule(id, currentUser);
  }

  @Post('evaluate')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  async evaluateEvent(@CurrentUser() currentUser: any, @Body() body: unknown) {
    const parsed = EvaluateAlertEventSchema.parse(body);
    return this.service.evaluateEvent(parsed, currentUser);
  }
}
