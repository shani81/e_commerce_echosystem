import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

/**
 * PUBLIC storefront cart (→ `/api/v1/storefront/:storeSlug/cart`). No auth — the
 * shopper is anonymous and the cart is addressed by an opaque token the
 * storefront persists locally. All operations are scoped to the store's tenant.
 */
@Controller('storefront/:storeSlug/cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Public()
  @Post()
  create(@Param('storeSlug') storeSlug: string) {
    return this.cart.createCart(storeSlug);
  }

  @Public()
  @Get(':token')
  get(@Param('storeSlug') storeSlug: string, @Param('token') token: string) {
    return this.cart.getCart(storeSlug, token);
  }

  @Public()
  @Post(':token/items')
  addItem(
    @Param('storeSlug') storeSlug: string,
    @Param('token') token: string,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cart.addItem(storeSlug, token, dto);
  }

  @Public()
  @Patch(':token/items/:variantId')
  updateItem(
    @Param('storeSlug') storeSlug: string,
    @Param('token') token: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.setQuantity(storeSlug, token, variantId, dto.quantity);
  }

  @Public()
  @Delete(':token/items/:variantId')
  removeItem(
    @Param('storeSlug') storeSlug: string,
    @Param('token') token: string,
    @Param('variantId') variantId: string,
  ) {
    return this.cart.removeItem(storeSlug, token, variantId);
  }
}
