import { GANode, MasterDataResource } from '../types';

// Haversine formula to compute distance in kilometers
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface GARoute {
  nodes: GANode[];
  finalInventory: Map<string, { qty: number; weight: number; material: string }>;
  totalRevenue: number;
  finalLoad: number;
  maxLoadReached: number;
  totalDistance: number;
  totalLoadWeightedDistance: number;
  fitness: number;
}

/**
 * Decodes a chromosome sequence into a valid route.
 * Guarantees that:
 * 1. Starting node is always first.
 * 2. All pickup nodes are visited.
 * 3. Delivery nodes are only visited if we have matching materials in the car.
 * 4. Delivery nodes that have nothing to collect are skipped, preventing extra travel.
 */
export function decodeChromosome(
  chromosome: string[],
  startNode: GANode,
  nodesMap: Map<string, GANode>,
  distanceMatrix: Record<string, Record<string, number>>,
  vehicleMaxWeight: number
): GARoute {
  const actualRoute: GANode[] = [startNode];
  
  // Store inventory: recordId -> { qty, weight, material_product }
  const currentInventory = new Map<string, { qty: number; weight: number; material: string }>();
  let currentLoad = 0;
  let maxLoadReached = 0;
  let totalRevenue = 0;

  for (const nodeId of chromosome) {
    const node = nodesMap.get(nodeId);
    if (!node) continue;

    if (node.type === 'PICKUP') {
      actualRoute.push(node);
      const weight = (node.quantity || 0) * (node.estimatedWeight || 0.1);
      currentInventory.set(node.id, {
        qty: node.quantity || 0,
        weight: weight,
        material: `${node.materialCategory}_${node.productCategory}`
      });
      currentLoad += weight;
      if (currentLoad > maxLoadReached) {
        maxLoadReached = currentLoad;
      }
    } else if (node.type === 'DELIVERY') {
      let hasDealt = false;
      let profitEarned = 0;
      const deliveredIds: string[] = [];

      for (const [pickupId, item] of currentInventory.entries()) {
        const key = item.material; // "materialCategory_productCategory"
        if (node.prices && node.prices[key] !== undefined) {
          const unitPrice = node.prices[key];
          profitEarned += item.weight * unitPrice;
          
          currentLoad -= item.weight;
          currentInventory.delete(pickupId);
          hasDealt = true;
          deliveredIds.push(pickupId);
        }
      }

      if (hasDealt) {
        // Create a copy of the delivery node with specific transaction details
        const deliveryStop: GANode = {
          ...node,
          // Storing transaction details dynamically
          deliveredRecordIds: deliveredIds,
          revenueEarned: profitEarned
        };
        actualRoute.push(deliveryStop);
        totalRevenue += profitEarned;
      }
    }
  }

  // Calculate distances and cost coefficients
  let totalDistance = 0;
  let totalLoadWeightedDistance = 0;
  let trackingLoad = 0;
  
  // Track inventory weight segment by segment
  const trackingInventory = new Map<string, number>();

  for (let i = 0; i < actualRoute.length - 1; i++) {
    const curr = actualRoute[i];
    const next = actualRoute[i + 1];

    if (curr.type === 'PICKUP') {
      const w = (curr.quantity || 0) * (curr.estimatedWeight || 0.1);
      trackingInventory.set(curr.id, w);
      trackingLoad += w;
    } else if (curr.type === 'DELIVERY') {
      // If it was a delivery stop, we subtract the weight of delivered items
      const deliveredIds = (curr as any).deliveredRecordIds || [];
      for (const id of deliveredIds) {
        const w = trackingInventory.get(id) || 0;
        trackingLoad -= w;
        trackingInventory.delete(id);
      }
    }

    const dist = distanceMatrix[curr.id]?.[next.id] ?? calculateHaversineDistance(
      curr.coordinates.latitude,
      curr.coordinates.longitude,
      next.coordinates.latitude,
      next.coordinates.longitude
    );

    totalDistance += dist;
    totalLoadWeightedDistance += trackingLoad * dist;
  }

  // Fitness calculation:
  // Fitness = TotalRevenue - (alpha * TotalLoadWeightedDistance) - (beta * TotalDistance) - Penalty
  const alpha = 0.2; // penalty for moving load (TWD)
  const beta = 5.0;  // cost per km base
  
  let penalty = 0;
  if (maxLoadReached > vehicleMaxWeight) {
    // Rigid penalty for overloading
    penalty += (maxLoadReached - vehicleMaxWeight) * 5000;
  }

  const fitness = totalRevenue - (alpha * totalLoadWeightedDistance) - (beta * totalDistance) - penalty;

  return {
    nodes: actualRoute,
    finalInventory: currentInventory,
    totalRevenue,
    finalLoad: currentLoad,
    maxLoadReached,
    totalDistance,
    totalLoadWeightedDistance,
    fitness
  };
}

/**
 * Performs Order Crossover (OX) on two parent chromosomes
 */
export function orderCrossover(parent1: string[], parent2: string[]): string[] {
  const size = parent1.length;
  const child = new Array<string>(size).fill('');
  
  const startPos = Math.floor(Math.random() * size);
  const endPos = Math.floor(Math.random() * size);
  
  const min = Math.min(startPos, endPos);
  const max = Math.max(startPos, endPos);
  
  // Copy segment from parent1
  for (let i = min; i <= max; i++) {
    child[i] = parent1[i];
  }
  
  // Fill remaining positions with parent2 genes preserves original sequence order
  let childIdx = 0;
  for (let i = 0; i < size; i++) {
    // If child index is in the segment we already copied, skip it
    if (childIdx >= min && childIdx <= max) {
      childIdx = max + 1;
    }
    
    const gene = parent2[i];
    if (!child.includes(gene)) {
      if (childIdx < size) {
        child[childIdx] = gene;
        childIdx++;
      }
    }
  }
  
  return child;
}

/**
 * Inversion mutation: reverses a random subset of genes
 */
export function invertMutation(chromosome: string[]): string[] {
  const mutated = [...chromosome];
  const size = mutated.length;
  if (size < 2) return mutated;

  const idx1 = Math.floor(Math.random() * size);
  const idx2 = Math.floor(Math.random() * size);

  const min = Math.min(idx1, idx2);
  const max = Math.max(idx1, idx2);

  if (min === max) return mutated;

  const reversed = mutated.slice(min, max + 1).reverse();
  for (let i = min; i <= max; i++) {
    mutated[i] = reversed[i - min];
  }

  return mutated;
}

/**
 * Main local genetic algorithm solver
 */
export function runGeneticRoutePlanner(
  startNode: GANode,
  pickups: GANode[],
  deliveries: GANode[],
  masterResources: MasterDataResource[],
  selectedVehicles: string[],
  populationSize = 100,
  maxGenerations = 100
): { route: GARoute; stats: { generationsComputed: number } } {
  // 1. Get vehicle parameters
  // Handle vehicle type conversions
  let maxWeight = 50; // default motorcycle 50kg
  if (selectedVehicles.includes('truck')) maxWeight = 1200;
  else if (selectedVehicles.includes('minivan')) maxWeight = 500;
  else if (selectedVehicles.includes('motorcycle')) maxWeight = 60;
  else if (selectedVehicles.includes('bicycle')) maxWeight = 25;
  else if (selectedVehicles.includes('trolley')) maxWeight = 40;
  else if (selectedVehicles.includes('onfoot')) maxWeight = 10;

  // 2. Decorate nodes with matching master data estimated weights
  const masterWeightMap = new Map<string, number>();
  masterResources.forEach(res => {
    const key = `${res.material}_${res.product}`;
    masterWeightMap.set(key, res.estimatedWeight ?? 0.1);
  });

  const pickupsDecorated = pickups.map(p => ({
    ...p,
    estimatedWeight: p.materialCategory && p.productCategory 
      ? (masterWeightMap.get(`${p.materialCategory}_${p.productCategory}`) ?? 0.1)
      : 0.1
  }));

  const allRouteNodes = [...pickupsDecorated, ...deliveries];
  const allNodesList = [startNode, ...allRouteNodes];
  const nodesMap = new Map<string, GANode>();
  allNodesList.forEach(n => nodesMap.set(n.id, n));

  // 3. Preconstruct Distance Matrix (Haversine)
  const distanceMatrix: Record<string, Record<string, number>> = {};
  allNodesList.forEach(n1 => {
    distanceMatrix[n1.id] = {};
    allNodesList.forEach(n2 => {
      distanceMatrix[n1.id][n2.id] = calculateHaversineDistance(
        n1.coordinates.latitude,
        n1.coordinates.longitude,
        n2.coordinates.latitude,
        n2.coordinates.longitude
      );
    });
  });

  const chromosomeGenes = allRouteNodes.map(n => n.id);
  if (chromosomeGenes.length === 0) {
    // Guard empty records
    return {
      route: decodeChromosome([], startNode, nodesMap, distanceMatrix, maxWeight),
      stats: { generationsComputed: 0 }
    };
  }

  // 4. Initialize Population
  let population: string[][] = [];
  for (let i = 0; i < populationSize; i++) {
    // Generate random shuffle
    const shuffle = [...chromosomeGenes].sort(() => Math.random() - 0.5);
    population.push(shuffle);
  }

  let bestGlobalRoute: GARoute | null = null;
  let unchangedGenerations = 0;
  let gCount = 0;

  for (let gen = 0; gen < maxGenerations; gen++) {
    gCount++;
    // Decode and calculate fitness
    const evaluated = population.map(chromosome => {
      const route = decodeChromosome(chromosome, startNode, nodesMap, distanceMatrix, maxWeight);
      return { chromosome, route };
    });

    // Sort by fitness descending
    evaluated.sort((a, b) => b.route.fitness - a.route.fitness);

    const currentBest = evaluated[0].route;
    if (!bestGlobalRoute || currentBest.fitness > bestGlobalRoute.fitness) {
      bestGlobalRoute = currentBest;
      unchangedGenerations = 0;
    } else {
      unchangedGenerations++;
    }

    // Heuristics: early stop if top score didn't improve for 25 generations
    if (unchangedGenerations >= 25) {
      break;
    }

    // Generate next population (Elitism: keep top 10%)
    const nextPopulation: string[][] = [];
    const eliteSize = Math.max(2, Math.floor(populationSize * 0.1));
    for (let i = 0; i < eliteSize; i++) {
      nextPopulation.push(evaluated[i].chromosome);
    }

    // Tournament selection & Crossover to fill remainder
    const tournamentSelect = (): string[] => {
      const k = 3;
      let bestParentChromosome = evaluated[0].chromosome;
      let bestParentFitness = -Infinity;

      for (let i = 0; i < k; i++) {
        const randIdx = Math.floor(Math.random() * populationSize);
        const candidate = evaluated[randIdx];
        if (candidate.route.fitness > bestParentFitness) {
          bestParentFitness = candidate.route.fitness;
          bestParentChromosome = candidate.chromosome;
        }
      }
      return bestParentChromosome;
    };

    while (nextPopulation.length < populationSize) {
      const parent1 = tournamentSelect();
      const parent2 = tournamentSelect();

      // Crossover
      let child = orderCrossover(parent1, parent2);

      // Mutation (30% chance for Inversion Mutation as requested in specs)
      if (Math.random() < 0.3) {
        child = invertMutation(child);
      }

      nextPopulation.push(child);
    }

    population = nextPopulation;
  }

  return {
    route: bestGlobalRoute!,
    stats: { generationsComputed: gCount }
  };
}
