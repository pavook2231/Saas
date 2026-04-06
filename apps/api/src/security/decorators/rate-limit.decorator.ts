import { SetMetadata } from '@nestjs/common';

import { RATE_LIMIT_METADATA_KEY, RateLimitMetadata } from '../security.constants';

export const RateLimit = (options: Omit<RateLimitMetadata, 'skip'>) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, options satisfies RateLimitMetadata);

export const SkipRateLimit = () =>
  SetMetadata(
    RATE_LIMIT_METADATA_KEY,
    {
      skip: true,
      limit: 0,
      windowMs: 0,
    } satisfies RateLimitMetadata,
  );
