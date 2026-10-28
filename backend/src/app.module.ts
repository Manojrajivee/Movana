import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnvironment } from './config/env.validation';
import { configuration } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DriversModule } from './drivers/drivers.module';
import { FleetModule } from './fleet/fleet.module';
import { FleetOperationsModule } from './fleet-operations/fleet-operations.module';
import { DriverOperationsModule } from './driver-operations/driver-operations.module';
import { VehicleMaintenanceModule } from './vehicle-maintenance/vehicle-maintenance.module';
import { TransportOperationsModule } from './transport-operations/transport-operations.module';
import { TransportFoundationModule } from './transport-foundation/transport-foundation.module';
import { BusDevicesModule } from './bus-devices/bus-devices.module';
import { RoutesModule } from './routes/routes.module';
import { RouteVariantsModule } from './route-variants/route-variants.module';
import { StopsModule } from './stops/stops.module';
import { SchedulesModule } from './schedules/schedules.module';
import { TrackingModule } from './tracking/tracking.module';
import { GpsIngestionModule } from './gps-ingestion/gps-ingestion.module';
import { GeofencingModule } from './geofencing/geofencing.module';
import { EtaModule } from './eta/eta.module';
import { DelaysModule } from './delays/delays.module';
import { TripsModule } from './trips/trips.module';
import { TripProgressModule } from './trip-progress/trip-progress.module';
import { StopArrivalsModule } from './stop-arrivals/stop-arrivals.module';
import { StopRemindersModule } from './stop-reminders/stop-reminders.module';
import { ServiceDisruptionsModule } from './service-disruptions/service-disruptions.module';
import { JourneyPlannerModule } from './journey-planner/journey-planner.module';
import { RouteOptimizationModule } from './route-optimization/route-optimization.module';
import { MultiModalModule } from './multi-modal/multi-modal.module';
import { FareEstimationModule } from './fare-estimation/fare-estimation.module';
import { SavedJourneysModule } from './saved-journeys/saved-journeys.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';
import { AlertRulesModule } from './alert-rules/alert-rules.module';
import { RealTimeModule } from './real-time/real-time.module';
import { CommunicationTemplatesModule } from './communication-templates/communication-templates.module';
import { SosModule } from './sos/sos.module';
import { LocationSharingModule } from './location-sharing/location-sharing.module';
import { IncidentsModule } from './incidents/incidents.module';
import { SafetyZonesModule } from './safety-zones/safety-zones.module';
import { IncidentManagementModule } from './incident-management/incident-management.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      load: [configuration],
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    DriversModule,
    FleetModule,
    FleetOperationsModule,
    DriverOperationsModule,
    VehicleMaintenanceModule,
    TransportOperationsModule,
    TransportFoundationModule,
    BusDevicesModule,
    RoutesModule,
    RouteVariantsModule,
    StopsModule,
    SchedulesModule,
    TrackingModule,
    GpsIngestionModule,
    GeofencingModule,
    EtaModule,
    DelaysModule,
    TripsModule,
    TripProgressModule,
    StopArrivalsModule,
    StopRemindersModule,
    ServiceDisruptionsModule,
    JourneyPlannerModule,
    RouteOptimizationModule,
    MultiModalModule,
    FareEstimationModule,
    SavedJourneysModule,
    NotificationsModule,
    NotificationPreferencesModule,
    AlertRulesModule,
    RealTimeModule,
    CommunicationTemplatesModule,
    SosModule,
    LocationSharingModule,
    IncidentsModule,
    SafetyZonesModule,
    IncidentManagementModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
