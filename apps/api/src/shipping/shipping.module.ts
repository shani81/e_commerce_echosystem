import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShippingService } from './shipping.service';
import { ShippoService } from './shippo.service';
import { ShippingController } from './shipping.controller';

/**
 * Shipping / fulfillment module. Imports NotificationsModule to email buyers a
 * tracking notification when a shipment goes in-transit.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [ShippingController],
  providers: [ShippingService, ShippoService],
})
export class ShippingModule {}
