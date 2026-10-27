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
import { BatchIngestGpsSchema } from '../dto/batch-ingest-gps.dto';
import { IngestGpsPointSchema } from '../dto/ingest-gps-point.dto';
import { QueryLocationHistorySchema } from '../dto/query-location-history.dto';
import { RecordTrackingEventSchema } from '../dto/record-tracking-event.dto';
import { GpsIngestionService } from '../services/gps-ingestion.service';

@ApiTags('GPS Ingestion')
@ApiBearerAuth()
@Controller('api/v1/gps')
export class GpsIngestionController {
  constructor(private readonly service: GpsIngestionService) {}

  @Post('ingest')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest single GPS telemetry fix' })
  @ApiResponse({ status: 201, description: 'GPS fix ingested successfully' })
  async ingestGpsPoint(@Body() body: unknown) {
    const validated = IngestGpsPointSchema.parse(body);
    return this.service.ingestGpsPoint(validated);
  }

  @Post('ingest/batch')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Batch ingest GPS telemetry fixes' })
  @ApiResponse({ status: 201, description: 'GPS batch ingested successfully' })
  async batchIngestGps(@Body() body: unknown) {
    const validated = BatchIngestGpsSchema.parse(body);
    return this.service.batchIngestGps(validated);
  }

  @Post('events')
  @Roles('ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record hardware tracking / telematics event' })
  @ApiResponse({ status: 201, description: 'Tracking event recorded' })
  async recordTrackingEvent(@Body() body: unknown) {
    const validated = RecordTrackingEventSchema.parse(body);
    return this.service.recordTrackingEvent(validated);
  }

  @Get('history/:vehicleId')
  @Roles('ADMIN', 'OPERATOR', 'FLEET_MANAGER', 'SAFETY_OFFICER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query historical GPS breadcrumbs for a vehicle' })
  @ApiResponse({ status: 200, description: 'Historical location records retrieved' })
  async getLocationHistory(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: unknown,
  ) {
    const validated = QueryLocationHistorySchema.parse(query);
    return this.service.getLocationHistory(vehicleId, validated);
  }
}
