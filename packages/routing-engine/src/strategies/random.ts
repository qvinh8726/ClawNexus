/**
 * ClawAI Gateway - Random Strategy
 * Selects a random provider from the available candidates
 */

import type { RouteCandidate, RoutingContext } from '../types.js';
import type { RoutingStrategyInterface, StrategyContext } from './interface.js';

export class RandomStrategy implements RoutingStrategyInterface {
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

    // Select random candidate
    const index = Math.floor(Math.random() * targetCandidates.length);
    return targetCandidates[index];
  }
}
