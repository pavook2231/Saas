import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    _context: ExecutionContext,
    _status?: unknown,
  ): TUser {
    if (err) {
      throw err;
    }

    return (user ?? null) as TUser;
  }
}
