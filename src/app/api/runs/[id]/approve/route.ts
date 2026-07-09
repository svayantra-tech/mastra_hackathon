// POST /api/runs/:id/approve — resume the suspended Mastra workflow (FR-08).
// The ONLY path from SUSPENDED to execution is this human action.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, rateLimit, parseBody } from '@/lib/auth';
import { resumeSentinelRun } from '@/mastra';
import { getRun } from '@/lib/run-registry';

const ApproveBody = z.object({
  approved: z.boolean(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const limited = rateLimit(req);
  if (limited) return limited;
  const auth = await requireAuth(req, 1);
  if ('error' in auth) return auth.error;

  const body = await parseBody(req, ApproveBody);
  if ('error' in body) return body.error;

  // A run present in memory must be SUSPENDED to approve. If it's ABSENT, the
  // process may have restarted (the serverless failure mode) — don't 404;
  // delegate to resumeSentinelRun, which rehydrates from durable Mastra storage
  // and validates the persisted status before resuming.
  const reg = getRun(params.id);
  if (reg && reg.view.stage !== 'SUSPENDED') {
    return NextResponse.json({ error: `Run is ${reg.view.stage}, not SUSPENDED` }, { status: 409 });
  }

  const result = await resumeSentinelRun(params.id, {
    approved: body.data.approved,
    technicianId: auth.user.sub,
    notes: body.data.notes,
  });
  if (!result.ok) {
    const status = result.error === 'Unknown run' ? 404
      : result.error?.startsWith('Run is') ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
