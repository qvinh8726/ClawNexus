/**
 * ClawNexus - Least Cost Strategy
 * Selects the provider with the lowest cost
 */

import type { RouteCandidate, RoutingContext } from '../types.js';
import type { RoutingStrategyInterface, StrategyContext } from './interface.js';

export class LeastCostStrategy implements RoutingStrategyInterface {
  select(
    candidates: RouteCandidate[],
    _context: RoutingContext,
    strategyContext: StrategyContext
  ): RouteCandidate {
    if (candidates.length === 0) {
      throw new Error('No candidates available');
    }

    // Sort by cost, then priority
    const sorted = [...candidates].sort((a, b) => {
      const aHealth = strategyContext.providerHealth.get(a.providerId);
      const bHealth = strategyContext.providerHealth.get(b.providerId);

      // Prioritize healthy providers
      const aHealthy = aHealth?.healthy !== false;
      const bHealthy = bHealth?.healthy !== false;

      if (aHealthy !== bHealthy) {
        return aHealthy ? -1 : 1;
      }

      // Compare cost
      const aCost = a.costPer1kTokens ?? Infinity;
      const bCost = b.costPer1kTokens ?? Infinity;

      if (aCost !== bCost) {
        return aCost - bCost;
      }

      // Fall back to priority
      return a.priority - b.priority;
    });

    return sorted[0];
  }
}
