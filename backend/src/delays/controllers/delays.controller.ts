import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { DetectTripDelaySchema } from '../dto/detect-trip-delay.dto';
import { QueryActiveDelaysSchema } from '../dto/query-active-delays.dto';
import { ResolveTripDelaySchema } from '../dto/resolve-trip-delay.dto';
import { DelaysService } from '../services/delays.service';

@ApiTags('Delay Detection')
@ApiBearerAuth()
@Controller('api/v1/delays')
export class DelaysController {
  constructor(private readonly service: DelaysService) {}

  @Post('detect/:tripId')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate and detect schedule delay for a specific trip' })
  @ApiResponse({ status: 200, description: 'Trip delay evaluation completed' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async detectTripDelay(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const validated = DetectTripDelaySchema.parse(body);
    return this.service.detectTripDelay(tripId, validated, user?.id);
  }

  @Get('active')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER', 'DRIVER', 'PASSENGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retrieve active delayed trips across the transit network' })
  @ApiResponse({ status: 200, description: 'Active delayed trips retrieved' })
  async getActiveDelays(@Query() query: unknown) {
    const validated = QueryActiveDelaysSchema.parse(query);
    return this.service.getActiveDelays(validated);
  }

  @Get('summary')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get network-wide delay metrics and performance summary' })
  @ApiResponse({ status: 200, description: 'Delay summary metrics retrieved' })
  async getDelaySummary() {
    return this.service.getDelaySummary();
  }

  @Post('resolve/:tripId')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually resolve or adjust delay for a delayed trip' })
  @ApiResponse({ status: 200, description: 'Trip delay successfully resolved' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async resolveTripDelay(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const validated = ResolveTripDelaySchema.parse(body);
    return this.service.resolveTripDelay(tripId, validated, user?.id);
  }
}
