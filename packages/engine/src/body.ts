import { COEFFS, type BodyDim } from './coefficients';
import type { Sex, ShapeStep, ShopperProfile } from './types';

export interface BodyEstimate {
  chest: number;
  waist: number;
  hip: number;
  inseam: number;
  heightCm: number;
  sex: Sex;
}

const SHAPE_STEP = 0.05;

/** Predicts body measurements (cm) from height and weight, then applies the shopper's shape answers. */
export function estimateBody(p: ShopperProfile): BodyEstimate {
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  const predict = (dim: BodyDim) => {
    const { a, b, c, d } = COEFFS[p.sex][dim];
    return a + b * p.heightCm + c * p.weightKg + d * bmi;
  };
  const adjust = (value: number, step: ShapeStep) => value * (1 + SHAPE_STEP * step);

  return {
    chest: adjust(predict('chest'), p.shape.chest),
    waist: adjust(predict('waist'), p.shape.stomach),
    hip: adjust(predict('hip'), p.shape.hips),
    inseam: predict('inseam'),
    heightCm: p.heightCm,
    sex: p.sex,
  };
}
