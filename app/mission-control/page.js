/**
 * Mission Control — Server Component
 *
 * Reads mission-control.json at build time and passes it as initialData to
 * the Client Component. This ensures the page renders with real data
 * immediately on first load (no client-side loading spinner).
 *
 * The client component still does a background refresh on mount + every 2min
 * to pick up data from newer deploys (each sync cron triggers a Vercel deploy).
 */
import MissionControlClient from './client';
import dataFile from '../../public/data/mission-control.json';

export const metadata = {
  title: 'Mission Control — Prescience',
  description: 'Agent activity, cron health, and signal pipeline status.',
};

export default function MissionControlPage() {
  return <MissionControlClient initialData={dataFile} />;
}
