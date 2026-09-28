import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/**
 * Wallet feature module. The repositories it depends on come from the global PersistenceModule, so
 * only the feature's own controller and service are declared here.
 */
@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
