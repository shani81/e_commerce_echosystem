import { Module } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';

/** Public customer portal (order lookup + return requests). */
@Module({
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
