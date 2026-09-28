import { Controller, Get, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseRequest } from '../../http/pipes/request-parse.pipe';
import { parseLimitQuery, parseTransactionListQuery } from '../../http/dto/reporting.dto';
import type { LimitQuery, TransactionListQuery } from '../../http/dto/reporting.dto';
import {
  serializeTopTransaction,
  serializeTopUser,
  serializeTransactionPage,
  type SerializedTopTransaction,
  type SerializedTopUser,
  type SerializedTransactionPage,
} from '../../http/serializers/transaction.serializer';
import { ReportingService } from './reporting.service';

/**
 * Everything the dashboard reads. Each handler is three lines: parse, delegate, serialise.
 *
 * The admin-only rule for `?username=` is *not* enforced here with `@Roles('admin')`: reading your
 * own wallet stays available to everybody, and the decision depends on the parameter value, not on
 * the route — so it belongs in the service, which explains it as a 403.
 */
@Controller()
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('transactions')
  async transactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(ParseRequest(parseTransactionListQuery)) query: TransactionListQuery,
  ): Promise<SerializedTransactionPage> {
    return serializeTransactionPage(
      await this.reporting.getTransactionPage({
        requester: user,
        targetUsername: query.username,
        page: query.page,
        perPage: query.perPage,
        filters: query.filters,
      }),
    );
  }

  @Get('transactions/top')
  async topTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query(ParseRequest(parseLimitQuery)) query: LimitQuery,
  ): Promise<SerializedTopTransaction[]> {
    const rows = await this.reporting.getTopTransactions({ userId: user.id, limit: query.limit });
    return rows.map(serializeTopTransaction);
  }

  @Get('users/top')
  async topUsers(
    @Query(ParseRequest(parseLimitQuery)) query: LimitQuery,
  ): Promise<SerializedTopUser[]> {
    const rows = await this.reporting.getTopUsers({ limit: query.limit });
    return rows.map(serializeTopUser);
  }
}
