import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

/**
 * IAM module — tenant-scoped user/team/role read APIs. PrismaService comes from
 * the global PrismaModule; the JWT strategy/guards come from AuthModule (wired
 * globally) so this module only needs to register its own service & controller.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class IamModule {}
