import { Module } from "@nestjs/common";
import { EnrichmentService } from "./services/enrichment.service";

@Module({
  providers: [EnrichmentService],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
