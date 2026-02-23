import { Module } from "@nestjs/common";
import { SnapshotService } from "./services/snapshot.service";

@Module({
  providers: [SnapshotService],
  exports: [SnapshotService],
})
export class SnapshotsModule {}
