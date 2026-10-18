const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

export function ftInToCm(ft: number, inch: number): number {
  return (ft * 12 + inch) * CM_PER_INCH;
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { ft: Math.floor(totalInches / 12), inch: totalInches % 12 };
}

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

export function kgToLbs(kg: number): number {
  return kg / KG_PER_LB;
}
