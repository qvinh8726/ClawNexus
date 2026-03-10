/**
 * ClawAI Gateway - Round Robin Strategy
 * Distributes requests evenly across providers
 */

import type { RouteCandidate, RoutingContext } from '../types.js';
import type { RoutingStrategyInterface, StrategyContext } from './interface.js';

export class RoundRobinStrategy implements RoutingStrategyInterface {
  select(
    candidates: RouteCandidate[],
    context: RoutingContext,
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

    // Create a unique key for this model request
    const key = `${context.userId}:${context.requestedModel}`;

    // Get current index
    let index = strategyContext.roundRobinIndex.get(key) || 0;

    // Wrap around if needed
    index = index % targetCandidates.length;

    // Update index for next call
    strategyContext.roundRobinIndex.set(key, index + 1);

    return targetCandidates[index];
  }
}
