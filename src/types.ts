export interface RequestVars {
	tenantId: string;
}

export interface ApiRedirectRule {
	tenantId: string;
	ruleUrl: string;
	responseStatus: number;
	responseLocation: string;
	responseHeaders: string[2][];
}

export interface ApiRedirectRuleStatsAggregated {
	tenantId: string,
	ruleUrl: string;
	tsHourMs: number;
	totalVisits: number;
}

export interface ApiListRedirectRulesResponse {
	data: {
		rules: ApiRedirectRule[];
		stats: ApiRedirectRuleStatsAggregated[];
	};
}

export interface ApiUrlVisitStatsSingle {
	ruleUrl: string;
	tsMs: number;
	id: string;
	requestDetailsJson: string;
}
