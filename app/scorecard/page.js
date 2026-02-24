/**
 * Scorecard — Server Component
 *
 * Imports scorecard.json at build time and passes as initialData to the
 * Client Component. This ensures the page renders with real call data
 * immediately — visible to crawlers, link unfurls, and non-JS environments.
 *
 * The scorecard is the "closer" (GTM doctrine) — it MUST show track record
 * data on first render.
 */
import ScorecardClient from './client';
import dataFile from '../../public/data/scorecard.json';

export const metadata = {
  title: 'Scorecard — Prescience',
  description: 'Every signal we\'ve sent. Every outcome tracked. No cherry-picking.',
};

export default function ScorecardPage() {
  return <ScorecardClient initialData={dataFile} />;
}
