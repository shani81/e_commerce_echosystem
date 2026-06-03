import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { ShippingService } from './shipping.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';

/**
 * Admin shipping/fulfillment (→ `/api/v1`). Tenant-scoped + RBAC. Shipments hang
 * off an order; status changes drive fulfillment + buyer notifications.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Post('orders/:orderId/shipments')
  @Permissions(PERMISSIONS.SHIPPING_WRITE)
  create(
    @CurrentTenant() tenantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CreateShipmentDto,
  ) {
    return this.shipping.create(tenantId, orderId, dto);
  }

  @Get('orders/:orderId/shipments')
  @Permissions(PERMISSIONS.SHIPPING_READ)
  list(@CurrentTenant() tenantId: string, @Param('orderId') orderId: string) {
    return this.shipping.list(tenantId, orderId);
  }

  @Patch('shipments/:id')
  @Permissions(PERMISSIONS.SHIPPING_WRITE)
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateShipmentDto,
  ) {
    return this.shipping.update(tenantId, id, dto);
  }

  @Post('shipments/:id/ship')
  @Permissions(PERMISSIONS.SHIPPING_WRITE)
  ship(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.shipping.ship(tenantId, id);
  }
}
