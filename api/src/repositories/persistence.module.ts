import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TransactionRepository } from './transaction.repository';
import { UnitOfWork } from './unit-of-work';
import { UserRepository } from './user.repository';

/**
 * Data access for the whole application.
 *
 * Global for the same reason PrismaModule is: persistence is infrastructure shared by every feature,
 * and re-importing it in each feature module would add ceremony without adding isolation. Feature
 * modules therefore declare only their own services and controllers.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [UserRepository, TransactionRepository, UnitOfWork],
  exports: [UserRepository, TransactionRepository, UnitOfWork],
})
export class PersistenceModule {}
