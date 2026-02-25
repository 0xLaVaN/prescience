/**
 * PRESCIENCE — False Positive Dampening Rules
 * Reduces noise from meme, sports, and near-expiry markets
 */

const SPORTS_KEYWORDS = [
  'win', 'score', 'goal', 'touchdown', 'home run', 'nba', 'nfl', 'mlb', 'nhl',
  'premier league', 'champions league', 'serie a', 'la liga', 'bundesliga',
  'super bowl', 'playoff', 'finals', 'world cup', 'match', 'game',
  'lakers', 'celtics', 'warriors', 'yankees', 'dodgers', 'chiefs', 'eagles',
  'manchester', 'liverpool', 'arsenal', 'chelsea', 'barcelona', 'real madrid',
  'wild', 'rangers', 'bruins', 'maple leafs', 'oilers', 'avalanche',
  'points', 'rebounds', 'assists', 'rushing yards', 'passing yards',
  'mvp', 'rookie of the year', 'all-star', 'draft pick',
  'over under', 'spread', 'moneyline'
];

const MEME_KEYWORDS = [
  'tweet', 'tiktok', 'instagram', 'follower', 'subscriber', 'viral',
  'meme', 'doge', 'pepe', 'shib', 'bonk', 'wojak', 'fartcoin',
  'streamer', 'youtuber', 'influencer', 'celebrity', 'kardashian',
  'jake paul', 'logan paul', 'mr beast', 'elon musk tweet',
  'will say', 'will post', 'will wear', 'will eat',
  'onlyfans', 'reality tv', 'bachelor', 'love island'
];

const ENTERTAINMENT_KEYWORDS = [
  'oscar', 'grammy', 'emmy', 'golden globe', 'box office',
  'album', 'movie', 'tv show', 'netflix', 'disney',
  'taylor swift', 'beyonce', 'drake', 'kanye',
  'super bowl halftime', 'concert', 'tour'
];

/**
 * Apply dampening rules to a market
 * @param {Object} market - Market data with question, currentPrices, endDate, etc.
 * @returns {{ factor: number, reason: string|null, isDampened: boolean }}
 */
export function computeDampening(market) {
  const question = (market.question || '').toLowerCase();
  const reasons = [];
  let totalDampening = 0;

  // Rule 1: Sports market detection
  // GUARD: 'win' is a sports keyword but is ambiguous in political election markets.
  // "Will Beshear WIN the 2028 Presidential Election?" is NOT a sports market.
  // Exclude 'win' from matching when the question is clearly about elections/politics.
  const isPoliticalElection = /presidential|nomination|nominee|election|senate race|governor race|congress/i.test(question);
  const sportsMatches = SPORTS_KEYWORDS.filter(kw => {
    if (kw === 'win' && isPoliticalElection) return false; // 'win' is ambiguous in elections
    return question.includes(kw);
  });
  if (sportsMatches.length >= 2) {
    // Strong sports signal: even bet distribution is normal
    totalDampening = Math.max(totalDampening, 0.3);
    reasons.push(`sports_market(${sportsMatches.slice(0, 2).join(',')})`);
  } else if (sportsMatches.length === 1) {
    totalDampening = Math.max(totalDampening, 0.15);
    reasons.push(`possible_sports(${sportsMatches[0]})`);
  }

  // Rule 2: Meme/entertainment market detection
  const memeMatches = MEME_KEYWORDS.filter(kw => question.includes(kw));
  if (memeMatches.length >= 1) {
    totalDampening = Math.max(totalDampening, 0.5);
    reasons.push(`meme_market(${memeMatches[0]})`);
  }

  const entertainmentMatches = ENTERTAINMENT_KEYWORDS.filter(kw => question.includes(kw));
  if (entertainmentMatches.length >= 1) {
    totalDampening = Math.max(totalDampening, 0.2);
    reasons.push(`entertainment(${entertainmentMatches[0]})`);
  }

  // Rule 3: Micro-price meme (YES < 5¢ with many small trades)
  try {
    const prices = JSON.parse(market.outcomePrices || '[]');
    const minPrice = Math.min(...prices.map(p => parseFloat(p) || 1));
    if (minPrice < 0.05) {
      totalDampening = Math.max(totalDampening, 0.5);
      reasons.push('micro_price(<5¢)');
    }
  } catch {}

  // Rule 4: Near-expiry convergence noise (resolves within 48h)
  if (market.endDate) {
    const hoursToExpiry = (new Date(market.endDate).getTime() - Date.now()) / 3600000;
    if (hoursToExpiry > 0 && hoursToExpiry <= 48) {
      try {
        const prices = JSON.parse(market.outcomePrices || '[]');
        const maxPrice = Math.max(...prices.map(p => parseFloat(p) || 0));
        if (maxPrice >= 0.90) {
          totalDampening = Math.max(totalDampening, 0.4);
          reasons.push(`expiry_convergence(${Math.round(hoursToExpiry)}h,${Math.round(maxPrice * 100)}¢)`);
        }
      } catch {}
    }
    // Very close to expiry (< 6h) — almost always noise
    if (hoursToExpiry > 0 && hoursToExpiry <= 6) {
      totalDampening = Math.max(totalDampening, 0.6);
      reasons.push('imminent_expiry(<6h)');
    }
  }

  // Rule 5: Daily resolution pattern (recurring markets like "BTC above X today")
  const dailyPatterns = ['today', 'tonight', 'this evening', 'by midnight', 'by end of day', 'daily'];
  if (dailyPatterns.some(p => question.includes(p))) {
    totalDampening = Math.max(totalDampening, 0.25);
    reasons.push('daily_recurring');
  }

  return {
    factor: totalDampening,
    reason: reasons.length > 0 ? reasons.join('; ') : null,
    isDampened: totalDampening > 0
  };
}

/**
 * Apply dampening factor to a threat score
 * adjusted_score = raw_score * (1 - dampening_factor)
 */
export function applyDampening(rawScore, dampeningFactor) {
  return Math.round(rawScore * (1 - dampeningFactor));
}
