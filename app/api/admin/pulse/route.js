import { requireAdmin } from '../../_lib/admin-auth.js';
import { handlePulse } from '../../pulse/route.js';

export const GET = requireAdmin(handlePulse);
