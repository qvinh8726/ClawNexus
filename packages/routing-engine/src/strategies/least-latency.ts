/**
 * ClawAI Gateway - Least Latency Strategy
 * Selects the provider with the lowest latency
 */

import type { RouteCandidate, RoutingContext } from '../types.js';
import type { RoutingStrategyInterface, StrategyContext } from './interface.js';

export class LeastLatencyStrategy implements RoutingStrategyInterface {
  select(
    candidates: RouteCandidate[],
    _context: RoutingContext,
    strategyContext: StrategyContext
  ): RouteCandidate {
    if (candidates.length === 0) {
      throw new Error('No candidates available');
    }

    // Sort by latency, then priority
    const sorted = [...candidates].sort((a, b) => {
      const aHealth = strategyContext.providerHealth.get(a.providerId);
      const bHealth = strategyContext.providerHealth.get(b.providerId);

      // Prioritize healthy providers
      const aHealthy = aHealth?.healthy !== false;
      const bHealthy = bHealth?.healthy !== false;

      if (aHealthy !== bHealthy) {
        return aHealthy ? -1 : 1;
      }

      // Compare latency
      const aLatency = aHealth?.latencyMs ?? a.latencyMs ?? Infinity;
      const bLatency = bHealth?.latencyMs ?? b.latencyMs ?? Infinity;

      if (aLatency !== bLatency) {
        return aLatency - bLatency;
      }

      // Fall back to priority
      return a.priority - b.priority;
    });

    return sorted[0];
  }
}
