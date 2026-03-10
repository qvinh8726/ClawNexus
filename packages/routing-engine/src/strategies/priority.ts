/**
 * ClawNexus - Priority Strategy
 * Selects the provider with the highest priority (lowest priority number)
 */

import type { RouteCandidate, RoutingContext } from '../types.js';
import type { RoutingStrategyInterface, StrategyContext } from './interface.js';

export class PriorityStrategy implements RoutingStrategyInterface {
  select(
    candidates: RouteCandidate[],
    _context: RoutingContext,
    strategyContext: StrategyContext
  ): RouteCandidate {
    if (candidates.length === 0) {
      throw new Error('No candidates available');
    }

    // Sort by priority (lower is better), then by health, then by score
    const sorted = [...candidates].sort((a, b) => {
      // First compare priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Then compare health
      const aHealth = strategyContext.providerHealth.get(a.providerId);
      const bHealth = strategyContext.providerHealth.get(b.providerId);

      const aHealthy = aHealth?.healthy !== false;
      const bHealthy = bHealth?.healthy !== false;

      if (aHealthy !== bHealthy) {
        return aHealthy ? -1 : 1;
      }

      // Then compare score
      return b.score - a.score;
    });

    return sorted[0];
  }
}
