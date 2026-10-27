import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateSavedLocationSchema } from '../dto/create-saved-location.dto';
import { CreateSavedRouteSchema } from '../dto/create-saved-route.dto';
import { SavedJourneysService } from '../services/saved-journeys.service';

@ApiTags('Saved Journeys')
@ApiBearerAuth()
@Controller('api/v1/saved-journeys')
export class SavedJourneysController {
  constructor(private readonly service: SavedJourneysService) {}

  @Post('locations')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a passenger transit location (Home, Work, Other)' })
  @ApiResponse({ status: 201, description: 'Location saved successfully' })
  async saveLocation(@Body() body: unknown, @CurrentUser() currentUser: AuthenticatedUser) {
    const validated = CreateSavedLocationSchema.parse(body);
    return this.service.saveLocation(currentUser, validated);
  }

  @Get('locations')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all saved locations for the authenticated passenger' })
  @ApiResponse({ status: 200, description: 'Saved locations retrieved successfully' })
  async getUserLocations(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.service.getUserLocations(currentUser.id);
  }

  @Delete('locations/:id')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a saved location' })
  @ApiResponse({ status: 200, description: 'Location deleted successfully' })
  async deleteLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.deleteLocation(id, currentUser);
  }

  @Post('routes')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a frequent transit commute route' })
  @ApiResponse({ status: 201, description: 'Commute route saved successfully' })
  async saveRoute(@Body() body: unknown, @CurrentUser() currentUser: AuthenticatedUser) {
    const validated = CreateSavedRouteSchema.parse(body);
    return this.service.saveRoute(currentUser, validated);
  }

  @Get('routes')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all saved commute routes for the authenticated passenger' })
  @ApiResponse({ status: 200, description: 'Saved commute routes retrieved successfully' })
  async getUserRoutes(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.service.getUserRoutes(currentUser.id);
  }

  @Delete('routes/:id')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a saved commute route' })
  @ApiResponse({ status: 200, description: 'Saved route deleted successfully' })
  async deleteRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.deleteRoute(id, currentUser);
  }

  @Get('routes/:id/next-trip')
  @Roles('PASSENGER', 'ADMIN', 'OPERATOR', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the next upcoming active or scheduled trip for a saved commute' })
  @ApiResponse({ status: 200, description: 'Next trip lookup completed' })
  async getNextTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.service.getNextTripForSavedRoute(id, currentUser);
  }
}
