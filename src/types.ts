export interface ApiRedirectRule {
    tenantId: string,
    ruleUrl: string,
    responseStatus: number,
    responseLocation: string,
    responseHeaders: string[2][],
}

export interface ApiRedirectRuleStatsAggregated {
    ruleUrl: string,
    tsHourMs: number,
    totalVisits: number,
}

export interface ApiListRedirectRulesResponse {
    data: {
        rules: ApiRedirectRule[],
        stats: ApiRedirectRuleStatsAggregated[],
    }
}
