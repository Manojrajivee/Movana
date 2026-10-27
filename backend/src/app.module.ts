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
