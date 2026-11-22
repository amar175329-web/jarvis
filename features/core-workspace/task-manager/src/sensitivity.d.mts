export type SensitivityResult = {
  sensitive: boolean;
  confidence: 'high' | 'uncertain';
  category: string | null;
};
export function classifySensitivity(value: unknown): SensitivityResult;
