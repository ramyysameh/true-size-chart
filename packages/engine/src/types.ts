export type Sex = 'female' | 'male';
export type ShapeStep = -1 | 0 | 1;
export type FitPref = 'slim' | 'regular' | 'relaxed';
export type Category = 'tshirt' | 'shirt' | 'hoodie' | 'jacket' | 'dress' | 'pants' | 'shorts' | 'skirt';
export type Dim = 'chest' | 'waist' | 'hip' | 'length' | 'inseam';

export interface ChartTable {
  sizes: string[];
  measurements: Partial<Record<Dim, (number | null)[]>>;
}

export interface ChartInput extends ChartTable {
  unit: 'cm' | 'in';
  basis: 'garment_flat' | 'garment_circ' | 'body';
  category: Category;
  intendedFit: 'slim' | 'regular' | 'oversized';
}

export interface NormalizedChart {
  sizes: string[];
  measurements: Partial<Record<Dim, (number | null)[]>>;
  basis: 'garment' | 'body';
  category: Category;
  intendedFit: ChartInput['intendedFit'];
}

export interface ShopperProfile {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  shape: { chest: ShapeStep; stomach: ShapeStep; hips: ShapeStep };
  fitPref: FitPref;
}

export interface AreaFit {
  dim: Dim;
  /** (garment − target) / target */
  delta: number;
  label: 'snug' | 'ideal' | 'roomy';
  /** −1 (snug) … 0 (ideal) … 1 (roomy), for the fit dot */
  position: number;
}

export interface SizeScore {
  size: string;
  error: number;
  areas: AreaFit[];
}

export interface Recommendation {
  size: string;
  runnerUp: string | null;
  fitMatch: number;
  band: 'confident' | 'good' | 'between';
  areas: AreaFit[];
  scores: SizeScore[];
  fitNote: 'true_to_size' | 'runs_small' | 'runs_large';
  outOfRange: null | 'below' | 'above';
}

export class ChartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartError';
  }
}
