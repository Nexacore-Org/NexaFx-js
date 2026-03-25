import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { SimulationModule } from './simulation/simulation.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [AuthModule, MaintenanceModule, SimulationModule, UsersModule],
})
export class AppModule {}
