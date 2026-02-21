import { requireAdmin } from '../../_lib/admin-auth.js';
import { handleSignals } from '../../signals/route.js';

export const GET = requireAdmin(handleSignals);
