import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { OrdersService } from './orders.service';
import { ListOrdersDto } from './dto/list-orders.dto';
import { RefundOrderDto } from './dto/refund-order.dto';

/**
 * Admin order management (→ `/api/v1/orders`). Tenant-scoped + RBAC: read for
 * staff/manager/owner; refunds require `order:write`.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Permissions(PERMISSIONS.ORDER_READ)
  list(@CurrentTenant() tenantId: string, @Query() query: ListOrdersDto) {
    return this.orders.list(tenantId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ORDER_READ)
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.orders.findOne(tenantId, id);
  }

  @Post(':id/refund')
  @Permissions(PERMISSIONS.ORDER_WRITE)
  refund(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: RefundOrderDto,
  ) {
    return this.orders.refund(tenantId, id, dto);
  }
}
