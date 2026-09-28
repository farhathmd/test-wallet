import { Injectable, PipeTransform } from '@nestjs/common';

/**
 * Turns a parse function from `http/dto` into a NestJS pipe, so a controller can declare
 * `@Body(ParseRequest(parseTransferBody)) input: TransferInput` and receive a typed value.
 *
 * The parse functions throw domain `ValidationError`s; the global exception filter renders them.
 */
@Injectable()
export class RequestParsePipe<Output> implements PipeTransform<unknown, Output> {
  constructor(private readonly parse: (input: unknown) => Output) {}

  transform(value: unknown): Output {
    return this.parse(value);
  }
}

export function ParseRequest<Output>(parse: (input: unknown) => Output): RequestParsePipe<Output> {
  return new RequestParsePipe(parse);
}
