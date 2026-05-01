import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route handler as not requiring an authenticated session.
 * SessionGuard short-circuits when this metadata is present.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
