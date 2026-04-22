import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VirtualCard } from './entities/virtual-card.entity';
import { CardAuthorization } from './entities/card-authorization.entity';
import { CardService } from './services/cards.service';
import { CardNumberService } from './services/card-number.service';
import { AuthorizationService } from './services/authorization.service';
import { ThreeDsService } from './services/three-ds.service';
import { CardsController } from './controllers/cards.controller';
import { CardNetworkController } from './controllers/card-network.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VirtualCard, CardAuthorization])],
  controllers: [CardsController, CardNetworkController],
  providers: [CardService, CardNumberService, AuthorizationService, ThreeDsService],
  exports: [CardService, AuthorizationService],
})
export class CardsModule {}
