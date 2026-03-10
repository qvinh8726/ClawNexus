/**
 * ClawNexus - Weighted Strategy
 * Selects providers based on their weights (probabilistic)
 */

import type { RouteCandidate, RoutingContext } from '../types.js';
import type { RoutingStrategyInterface, StrategyContext } from './interface.js';

export class WeightedStrategy implements RoutingStrategyInterface {
  select(
    candidates: RouteCandidate[],
    _context: RoutingContext,
    strategyContext: StrategyContext
  ): RouteCandidate {
    if (candidates.length === 0) {
      throw new Error('No candidates available');
    }

    // Filter to only healthy candidates
    const healthyCandidates = candidates.filter((c) => {
      const health = strategyContext.providerHealth.get(c.providerId);
      return health?.healthy !== false;
    });

    const targetCandidates = healthyCandidates.length > 0 ? healthyCandidates : candidates;

    // Calculate total weight
    const totalWeight = targetCandidates.reduce((sum, c) => sum + c.weight, 0);

    if (totalWeight === 0) {
      // All weights are 0, fall back to first candidate
      return targetCandidates[0];
    }

    // Generate random number
    const random = Math.random() * totalWeight;

    // Select based on weight
    let cumulativeWeight = 0;
    for (const candidate of targetCandidates) {
      cumulativeWeight += candidate.weight;
      if (random <= cumulativeWeight) {
        return candidate;
      }
    }

    // Fallback (should not reach here)
    return targetCandidates[targetCandidates.length - 1];
  }
}
