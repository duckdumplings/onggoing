// 리스크 리포트 관련 타입 정의

export interface RiskSummary {
  totalRisks: number;
  highRisks: number;
  mediumRisks: number;
  lowRisks: number;
  riskScore: number;
  categories: {
    timeViolations: number;
    distanceMismatches: number;
    scheduleUncertainties: number;
  };
}

export interface RiskReport {
  id: string;
  validation_id: string;
  report_content: string;
  risk_summary?: RiskSummary | null;
  generated_at: string;
}

export interface RiskReportInsert {
  validation_id: string;
  report_content: string;
  risk_summary?: RiskSummary | null;
}

export interface RiskReportResult {
  success: boolean;
  data?: {
    id: string;
    report_content: string;
    risk_summary?: RiskSummary;
    generated_at: string;
  };
  error?: {
    code: string;
    message: string;
  };
}



