import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseRequest } from '../../http/pipes/request-parse.pipe';
import { parseTopupBody, parseTransferBody } from '../../http/dto/wallet.dto';
import type { TopupInput, TransferInput } from '../../http/dto/wallet.dto';
import { serializeBalance } from '../../http/serializers/user.serializer';
import { WalletService } from './wallet.service';

/**
 * Wallet endpoints — the caller's own wallet only, taken from the verified token. There is no `user_id`
 * parameter anywhere: an id in the request could be tampered with, the token cannot.
 */
@Controller()
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser): Promise<{ balance: number }> {
    return serializeBalance(await this.wallet.getBalance({ userId: user.id }));
  }

  /** 204: the client's next step is `GET /balance`, so there is nothing useful to return. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('topup')
  async topup(
    @CurrentUser() user: AuthenticatedUser,
    @Body(ParseRequest(parseTopupBody)) input: TopupInput,
  ): Promise<void> {
    await this.wallet.topup({ userId: user.id, amount: input.amount });
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('transfer')
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body(ParseRequest(parseTransferBody)) input: TransferInput,
  ): Promise<void> {
    await this.wallet.transfer({
      fromUserId: user.id,
      toUsername: input.toUsername,
      amount: input.amount,
    });
  }
}
