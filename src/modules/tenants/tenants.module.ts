import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { TenantContextService } from './context/tenant-context.service';
import { TenantService } from './services/tenant.service';
import { TenantResolutionMiddleware } from './middleware/tenant-resolution.middleware';
import { TenantsAdminController } from './controllers/tenants-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  controllers: [TenantsAdminController],
  providers: [TenantContextService, TenantService, TenantResolutionMiddleware],
  exports: [TenantContextService, TenantService],
})
export class TenantsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*');
  }
}
