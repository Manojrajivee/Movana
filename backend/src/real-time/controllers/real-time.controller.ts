import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PublishEventSchema } from '../dto/real-time.dto';
import { RealTimeService } from '../services/real-time.service';

@Controller('api/v1/real-time')
export class RealTimeController {
  constructor(private readonly service: RealTimeService) {}

  @Public()
  @Get('channels')
  getChannels() {
    return {
      channels: this.service.getAvailableChannels(),
      documentation:
        'Connect via WebSocket to namespace /realtime with Bearer token in handshake auth: { token: "<JWT>" }',
    };
  }

  @Get('stats')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER')
  getStats() {
    return this.service.getStats();
  }

  @Post('publish')
  @Roles('ADMIN', 'OPERATOR', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  async publishEvent(@Body() body: unknown) {
    const parsed = PublishEventSchema.parse(body);
    return this.service.publishToRoom(parsed.room, parsed.event, parsed.data);
  }
}
