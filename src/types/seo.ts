export interface SeoAnalysisResult {
  pluginId: string;
  score: number;
  issues: SeoIssue[];
  metrics: Record<string, any>;
}

export interface SeoIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  fixable: boolean;
  fixId?: string;
}

export interface SeoFixResult {
  pluginId: string;
  success: boolean;
  changes: string[];
  error?: string;
}

export interface SeoScorecard {
  url: string;
  overallScore: number;
  results: SeoAnalysisResult[];
  timestamp: string;
}
