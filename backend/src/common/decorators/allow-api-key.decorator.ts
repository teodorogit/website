import { SetMetadata } from '@nestjs/common';

export const ALLOW_API_KEY_KEY = 'allowApiKey';

/** Header carrying the key. Node lower-cases incoming header names. */
export const API_KEY_HEADER = 'x-api-key';

/** Name of the security scheme in the OpenAPI document (`@ApiSecurity`). */
export const API_KEY_SECURITY_NAME = 'api-key';

/**
 * Lets a route also be read with the `X-Api-Key` header (`POWERBI_API_KEY`) instead of a Clerk session
 * token, for clients that cannot sign in, such as Power BI. The key is long-lived and stands for one
 * fixed account, so mark only read-only routes: everywhere else the header is ignored.
 */
export const AllowApiKey = (): MethodDecorator => SetMetadata(ALLOW_API_KEY_KEY, true);
