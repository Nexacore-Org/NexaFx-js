import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FederationAddressEntity } from './entities/federation-address.entity';
import { StellarFederationService } from './services/stellar-federation.service';
import { FederationController } from './controllers/federation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FederationAddressEntity])],
  controllers: [FederationController],
  providers: [StellarFederationService],
  exports: [StellarFederationService],
})
export class StellarFederationModule {}
